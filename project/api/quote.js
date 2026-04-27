// Vercel serverless function — proxies Polygon.io snapshot API
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

  // ── Stocks + ETFs ──────────────────────────────────────────────
  if (stocks.length) {
    try {
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers` +
        `?tickers=${stocks.join(",")}&apiKey=${key}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const data = await r.json();
      (data.tickers || []).forEach(t => {
        results[t.ticker] = {
          last:      t.day?.c           ?? t.lastTrade?.p ?? null,
          prevClose: t.prevDay?.c       ?? null,
          changePct: t.todaysChangePerc ?? null,
        };
      });
    } catch (_) { /* timeout or network error — skip */ }
  }

  // ── Crypto (Polygon format: X:BTCUSD) ──────────────────────────
  if (cryptos.length) {
    try {
      const polyTickers = cryptos.map(s => `X:${s}USD`).join(",");
      const url = `https://api.polygon.io/v2/snapshot/locale/global/markets/crypto/tickers` +
        `?tickers=${polyTickers}&apiKey=${key}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
      const data = await r.json();
      (data.tickers || []).forEach(t => {
        // "X:BTCUSD" → "BTC"
        const sym = t.ticker.replace(/^X:/, "").replace(/USD$/, "");
        results[sym] = {
          last:      t.day?.c           ?? t.lastTrade?.p ?? null,
          prevClose: t.prevDay?.c       ?? null,
          changePct: t.todaysChangePerc ?? null,
        };
      });
    } catch (_) { /* timeout or network error — skip */ }
  }

  // Cache at edge for 29s so rapid re-renders don't re-hit Polygon
  res.setHeader("Cache-Control", "s-maxage=29, stale-while-revalidate=60");
  res.status(200).json({ results });
}
