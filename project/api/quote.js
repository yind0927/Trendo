// Vercel serverless function — proxies Polygon.io market data
// Keeps API key server-side and resolves browser CORS restrictions
//
// Usage: GET /api/quote?stocks=NVDA,TSLA,META&crypto=BTC,ETH
// Returns: { results: { NVDA: { last, prevClose, changePct }, ... } }

export default async function handler(req, res) {
  const key = process.env.POLYGON_API_KEY;
  if (!key) {
    return res.status(503).json({ error: "POLYGON_API_KEY not configured" });
  }

  const stocks  = (req.query.stocks || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const cryptos = (req.query.crypto || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

  if (!stocks.length && !cryptos.length) {
    return res.status(400).json({ error: "No symbols provided" });
  }

  const results = {};

  // ── Stocks + ETFs: /v2/aggs/ticker/{sym}/prev ─────────────────
  // (Polygon free tier blocks the snapshot endpoint; prev-day aggs are available on all plans)
  await Promise.all(stocks.slice(0, 12).map(async sym => {
    try {
      const url  = `https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${key}`;
      const r    = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const data = await r.json();
      const bar  = data.results?.[0];
      if (bar?.c) {
        results[sym] = {
          last:      bar.c,
          prevClose: bar.o,
          changePct: bar.o ? ((bar.c - bar.o) / bar.o) * 100 : null,
        };
      }
    } catch (_) {}
  }));

  // ── Crypto (Polygon format: X:BTCUSD) ──────────────────────────
  if (cryptos.length) {
    try {
      const polyTickers = cryptos.map(s => `X:${s}USD`).join(",");
      const url  = `https://api.polygon.io/v2/snapshot/locale/global/markets/crypto/tickers` +
        `?tickers=${polyTickers}&apiKey=${key}`;
      const r    = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await r.json();

      (data.tickers || []).forEach(t => {
        const sym  = t.ticker.replace(/^X:/, "").replace(/USD$/, "");
        const last = t.min?.c ?? t.day?.c ?? t.prevDay?.c ?? t.lastTrade?.p ?? null;
        results[sym] = {
          last,
          prevClose:  t.prevDay?.c       ?? null,
          changePct:  t.todaysChangePerc ?? null,
        };
      });
    } catch (_) {}
  }

  res.setHeader("Cache-Control", "s-maxage=29, stale-while-revalidate=60");
  res.status(200).json({ results });
}
