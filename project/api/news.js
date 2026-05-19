// GET /api/news?syms=AAPL,NVDA,TSLA
// Primary:  Polygon /v2/reference/news (batch, with sentiment)
// Fallback: Finnhub /api/v1/company-news (per-ticker, no sentiment)
// Returns:  { articles: [{ id, sym, title, url, source, publishedAt, sentiment }] }

export default async function handler(req, res) {
  const polygonKey = process.env.POLYGON_API_KEY;
  const finnhubKey = process.env.FINNHUB_API_KEY;

  const syms = (req.query.syms || "")
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  if (!syms.length) return res.status(400).json({ error: "No symbols" });

  // 7-day window
  const now   = new Date();
  const from  = new Date(now - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const to    = now.toISOString().slice(0, 10);

  // Stocks only (exclude crypto symbols that won't be in news APIs)
  // We pass all syms and let the API filter
  const articles = [];

  // ── Polygon batch news ─────────────────────────────────────────────
  if (polygonKey) {
    try {
      const tickerParam = syms.join(",");
      const url = `https://api.polygon.io/v2/reference/news` +
        `?ticker.any_of=${encodeURIComponent(tickerParam)}` +
        `&published_utc.gte=${from}T00:00:00Z` +
        `&published_utc.lte=${to}T23:59:59Z` +
        `&limit=50&sort=published_utc&order=desc` +
        `&apiKey=${polygonKey}`;

      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const d = await r.json();
        for (const item of (d.results || [])) {
          // Find which of our watched syms this article covers
          const matchedSym = syms.find(s => (item.tickers || []).includes(s));
          if (!matchedSym) continue;

          // Sentiment from insights array
          const insight = (item.insights || []).find(i => i.ticker === matchedSym);
          const sentiment = insight?.sentiment ?? null; // "positive"|"negative"|"neutral"|null

          articles.push({
            id:          item.id || item.article_url,
            sym:         matchedSym,
            title:       item.title || "",
            url:         item.article_url || "",
            source:      item.publisher?.name || "",
            publishedAt: item.published_utc || "",
            sentiment,
          });
        }
      }
    } catch (_) {}
  }

  // ── Finnhub per-ticker fallback (when Polygon has no key or returned nothing) ──
  if (articles.length === 0 && finnhubKey) {
    const stockSyms = syms; // Try all; Finnhub silently returns empty for crypto
    await Promise.all(stockSyms.map(async sym => {
      try {
        const url = `https://finnhub.io/api/v1/company-news` +
          `?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}` +
          `&token=${finnhubKey}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return;
        const items = await r.json();
        if (!Array.isArray(items)) return;
        for (const item of items.slice(0, 5)) {
          if (!item.headline || !item.url) continue;
          articles.push({
            id:          item.url,
            sym,
            title:       item.headline,
            url:         item.url,
            source:      item.source || "",
            publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : "",
            sentiment:   null,
          });
        }
      } catch (_) {}
    }));
  }

  // Deduplicate by URL, sort newest first, cap at 30
  const seen = new Set();
  const unique = [];
  for (const a of articles.sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : -1))) {
    if (!seen.has(a.url)) {
      seen.add(a.url);
      unique.push(a);
      if (unique.length >= 30) break;
    }
  }

  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  res.status(200).json({ articles: unique });
}
