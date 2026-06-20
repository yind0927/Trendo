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

  // Merge — Polygon articles have ML sentiment; Yahoo/Finnhub use keyword inference
  const all = [
    ...polygonArticles,
    ...yahooArticles.map(a  => ({ ...a, sentiment: inferSentiment(a.title),  sentimentSource: "inferred" })),
    ...finnhubArticles.map(a => ({ ...a, sentiment: inferSentiment(a.title), sentimentSource: "inferred" })),
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
// Weighted scoring: financial phrases = 3pts, specific terms = 2pts, single words = 1pt.
// Higher total wins; ties = neutral.
function inferSentiment(title) {
  if (!title) return "neutral";
  const t = title.toLowerCase();
  let pos = 0, neg = 0;

  // ── 3-point financial phrases ──────────────────────────────────────
  if (/\b(beat|beats|topped?|exceeded?)\s+(estimates?|expectations?|consensus|forecast)\b/.test(t)) pos += 3;
  if (/\b(eps|earnings?|revenue|sales)\s+(beat|topped?|exceeded?)\b/.test(t)) pos += 3;
  if (/\bguidance\s+(raised?|increased?|lifted?|improved?|boosted?)\b/.test(t)) pos += 3;
  if (/\bupgraded?\s+to\s+(buy|outperform|overweight|strong\s+buy)\b/.test(t)) pos += 3;

  if (/\b(miss|misses|missed|fell?\s+short\s+of)\s+(estimates?|expectations?|consensus|forecast)\b/.test(t)) neg += 3;
  if (/\b(eps|earnings?|revenue|sales)\s+(miss|missed|disappointed?)\b/.test(t)) neg += 3;
  if (/\bguidance\s+(cut|reduced?|lowered?|slashed?|trimmed?)\b/.test(t)) neg += 3;
  if (/\bdowngraded?\s+to\s+(sell|underperform|underweight)\b/.test(t)) neg += 3;
  if (/\b(sec|doj|ftc)\s+(probe|investigation|charges?|lawsuit|fine[sd]?)\b/.test(t)) neg += 3;

  // ── 2-point specific terms ─────────────────────────────────────────
  if (/\bprice\s+target\s+(raised?|increased?|lifted?|hiked?)\b/.test(t)) pos += 2;
  if (/\b(buyback|share\s+repurchase)\b/.test(t)) pos += 2;
  if (/\bdividend\s+(increase[sd]?|raised?|hiked?|boost)\b/.test(t)) pos += 2;
  if (/\b(record|all.time\s+high)\s+(revenue|profit|earnings|sales|quarter)\b/.test(t)) pos += 2;

  if (/\bprice\s+target\s+(cut|reduced?|lowered?|slashed?)\b/.test(t)) neg += 2;
  if (/\b(layoffs?|job\s+cuts?|workforce\s+reduction|restructur)\b/.test(t)) neg += 2;
  if (/\bdividend\s+(cut|reduced?|suspended?|eliminated?)\b/.test(t)) neg += 2;
  if (/\b(recall|data\s+breach|scandal|fraud|bankruptcy)\b/.test(t)) neg += 2;
  if (/\b(plunge[sd]?|tumble[sd]?|slump[sed]*|crash[ed]*|tank[sed]*)\b/.test(t)) neg += 2;

  // ── 1-point single keywords ────────────────────────────────────────
  if (/\b(surge[sd]?|soar[sed]*|jump[sed]*|rally|rallied|spike[sd]?|climb[sed]*)\b/.test(t)) pos += 1;
  if (/\b(beat|profit|upgrade|strong|rise[sd]?|gain[sed]*|growth|outperform|rebound|recover)\b/.test(t)) pos += 1;
  if (/\b(bullish|upside|momentum|positive)\b/.test(t)) pos += 1;

  if (/\b(miss|fall[s]?|drop[s]?|decline[sd]?|loss|losses|downgrade|weak|warn[sed]*|fear[s]?)\b/.test(t)) neg += 1;
  if (/\b(bearish|downside|headwind|pressure|concern[s]?)\b/.test(t)) neg += 1;
  if (/\b(lawsuit|probe|investigation|fine|penalty)\b/.test(t)) neg += 1;

  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
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
      const insight   = (item.insights || []).find(i => i.ticker === matchedSym);
      const hasMl     = insight?.sentiment != null;
      articles.push({
        id:              item.id || item.article_url,
        sym:             matchedSym,
        title:           item.title || "",
        url:             item.article_url || "",
        source:          item.publisher?.name || "",
        publishedAt:     item.published_utc || "",
        sentiment:       hasMl ? insight.sentiment : inferSentiment(item.title),
        sentimentSource: hasMl ? "ml" : "inferred",
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
