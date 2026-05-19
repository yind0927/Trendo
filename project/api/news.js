// GET /api/news?syms=AAPL,NVDA,TSLA
// All three sources run IN PARALLEL — results merged and deduped by URL.
//
// 1. Yahoo Finance search  — no key, always runs, ~5 items/sym
// 2. Polygon reference/news — batch with sentiment, needs POLYGON_API_KEY
// 3. Finnhub company-news  — per-ticker, needs FINNHUB_API_KEY
//
// Returns: { articles: [{ id, sym, title, url, source, publishedAt, sentiment }] }

export default async function handler(req, res) {
  const polygonKey = process.env.POLYGON_API_KEY;
  const finnhubKey = process.env.FINNHUB_API_KEY;

  const syms = (req.query.syms || "")
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  if (!syms.length) return res.status(400).json({ error: "No symbols" });

  const now  = new Date();
  const from = new Date(now - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to   = now.toISOString().slice(0, 10);

  // ── Run all sources in parallel ──────────────────────────────────────
  const [yahooArticles, polygonArticles, finnhubArticles] = await Promise.all([
    fetchYahoo(syms),
    fetchPolygon(syms, polygonKey, from, to),
    fetchFinnhub(syms, finnhubKey, from, to),
  ]);

  const all = [...yahooArticles, ...polygonArticles, ...finnhubArticles];

  // Deduplicate by URL, sort newest first, cap at 50
  const seen   = new Set();
  const unique = [];
  for (const a of all.sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : -1))) {
    if (a.url && !seen.has(a.url)) {
      seen.add(a.url);
      unique.push(a);
      if (unique.length >= 50) break;
    }
  }

  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  res.status(200).json({ articles: unique });
}

// ── Yahoo Finance: free, no key, ~5 news per symbol ───────────────────
async function fetchYahoo(syms) {
  const results = await Promise.all(syms.map(async sym => {
    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search` +
        `?q=${encodeURIComponent(sym)}&newsCount=8&enableNavLinks=false&enableEnhancedTrivialQuery=true`;
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return [];
      const d = await r.json();
      return (d.news || [])
        .filter(item => item.type === "STORY" && item.title && item.link)
        .map(item => ({
          id:          item.uuid || item.link,
          sym,
          title:       item.title,
          url:         item.link,
          source:      item.publisher || "",
          publishedAt: item.providerPublishTime
            ? new Date(item.providerPublishTime * 1000).toISOString()
            : "",
          sentiment:   null,
        }));
    } catch (_) { return []; }
  }));
  return results.flat();
}

// ── Polygon: batch with sentiment, needs API key ──────────────────────
async function fetchPolygon(syms, apiKey, from, to) {
  if (!apiKey) return [];
  try {
    const url = `https://api.polygon.io/v2/reference/news` +
      `?ticker.any_of=${encodeURIComponent(syms.join(","))}` +
      `&published_utc.gte=${from}T00:00:00Z` +
      `&published_utc.lte=${to}T23:59:59Z` +
      `&limit=50&sort=published_utc&order=desc` +
      `&apiKey=${apiKey}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return [];
    const d = await r.json();
    const articles = [];
    for (const item of (d.results || [])) {
      const matchedSym = syms.find(s => (item.tickers || []).includes(s));
      if (!matchedSym) continue;
      const insight   = (item.insights || []).find(i => i.ticker === matchedSym);
      articles.push({
        id:          item.id || item.article_url,
        sym:         matchedSym,
        title:       item.title || "",
        url:         item.article_url || "",
        source:      item.publisher?.name || "",
        publishedAt: item.published_utc || "",
        sentiment:   insight?.sentiment ?? null,
      });
    }
    return articles;
  } catch (_) { return []; }
}

// ── Finnhub: per-ticker, needs API key ───────────────────────────────
async function fetchFinnhub(syms, apiKey, from, to) {
  if (!apiKey) return [];
  const results = await Promise.all(syms.map(async sym => {
    try {
      const url = `https://finnhub.io/api/v1/company-news` +
        `?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}&token=${apiKey}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return [];
      const items = await r.json();
      if (!Array.isArray(items)) return [];
      return items
        .filter(item => item.headline && item.url)
        .slice(0, 6)
        .map(item => ({
          id:          item.url,
          sym,
          title:       item.headline,
          url:         item.url,
          source:      item.source || "",
          publishedAt: item.datetime
            ? new Date(item.datetime * 1000).toISOString()
            : "",
          sentiment:   null,
        }));
    } catch (_) { return []; }
  }));
  return results.flat();
}
