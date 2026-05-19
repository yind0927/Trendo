// GET /api/news?syms=AAPL,NVDA,TSLA
// Sources run in parallel: Yahoo Finance (no key) + Polygon (sentiment) + Finnhub
// Logos fetched from Finnhub company profile in parallel with news.
// Sentiment inferred by keyword for articles not covered by Polygon.
// Returns: { articles: [{id,sym,title,url,source,publishedAt,sentiment}], logos:{SYM:url} }

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

  // Run news sources AND logo fetch all in parallel
  const [yahooArticles, polygonArticles, finnhubArticles, logos] = await Promise.all([
    fetchYahoo(syms),
    fetchPolygon(syms, polygonKey, from, to),
    fetchFinnhub(syms, finnhubKey, from, to),
    fetchLogos(syms, finnhubKey),
  ]);

  // Merge — Polygon articles already have real sentiment; infer for the rest
  const all = [
    ...polygonArticles,
    ...yahooArticles.map(a  => ({ ...a, sentiment: a.sentiment ?? inferSentiment(a.title) })),
    ...finnhubArticles.map(a => ({ ...a, sentiment: a.sentiment ?? inferSentiment(a.title) })),
  ];

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
  res.status(200).json({ articles: unique, logos });
}

// ── Keyword sentiment inference (applied to Yahoo + Finnhub articles) ─
function inferSentiment(title) {
  if (!title) return "neutral";
  const t = title.toLowerCase();
  const posScore = [
    /\b(beat|beats|surge|surges|rally|rallies|record|profit|upgrade|strong|rise|rises|gain|gains|bull|bullish|growth|jump|jumps|soar|soars|exceed|outperform|rebound|recover|high|top|lead|leads|win|wins|boost|lifts?)\b/,
  ].reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  const negScore = [
    /\b(miss|misses|fall|falls|drop|drops|decline|declines|loss|losses|downgrade|weak|cut|cuts|concern|concerns|risk|risks|warn|warns|warning|bear|bearish|sell|low|lawsuit|probe|investigation|fine|penalty|crash|plunge|tumble|disappoint|disappoints|fear|fears|retreat|slump)\b/,
  ].reduce((n, re) => n + (re.test(t) ? 1 : 0), 0);
  if (posScore > negScore) return "positive";
  if (negScore > posScore) return "negative";
  return "neutral";
}

// ── Yahoo Finance: free, no key ───────────────────────────────────────
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

// ── Polygon: batch with real ML sentiment ────────────────────────────
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
      const insight = (item.insights || []).find(i => i.ticker === matchedSym);
      articles.push({
        id:          item.id || item.article_url,
        sym:         matchedSym,
        title:       item.title || "",
        url:         item.article_url || "",
        source:      item.publisher?.name || "",
        publishedAt: item.published_utc || "",
        sentiment:   insight?.sentiment ?? inferSentiment(item.title),
      });
    }
    return articles;
  } catch (_) { return []; }
}

// ── Finnhub: per-ticker ───────────────────────────────────────────────
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

// ── Finnhub company profile: logo URLs ───────────────────────────────
async function fetchLogos(syms, apiKey) {
  if (!apiKey) return {};
  const entries = await Promise.all(syms.map(async sym => {
    try {
      const r = await fetch(
        `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${apiKey}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!r.ok) return [sym, null];
      const d = await r.json();
      return [sym, d.logo || null];
    } catch (_) { return [sym, null]; }
  }));
  return Object.fromEntries(entries.filter(([, v]) => v));
}
