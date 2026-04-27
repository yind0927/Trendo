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
  const _debug  = {};

  // ── Stocks + ETFs ──────────────────────────────────────────────
  if (stocks.length) {
    try {
      const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers` +
        `?tickers=${stocks.join(",")}&apiKey=${key}`;
      const r    = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await r.json();

      _debug.stocks_status   = data.status;
      _debug.stocks_count    = data.tickers?.length ?? 0;
      _debug.stocks_sample   = data.tickers?.[0] ?? null;  // first ticker raw for inspection

      (data.tickers || []).forEach(t => {
        // Try fields from most-current to least: latest-minute close → day close → prev-day close → last trade
        const last = t.min?.c ?? t.day?.c ?? t.prevDay?.c ?? t.lastTrade?.p ?? null;
        results[t.ticker] = {
          last,
          prevClose:  t.prevDay?.c       ?? null,
          changePct:  t.todaysChangePerc ?? null,
        };
      });
    } catch (e) {
      _debug.stocks_error = e.message;
    }
  }

  // ── Fallback: /v2/aggs/ticker/{sym}/prev for any stock with no price ──
  const missing = stocks.filter(s => results[s]?.last == null);
  for (const sym of missing.slice(0, 8)) {
    try {
      const url  = `https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${key}`;
      const r    = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = await r.json();
      const bar  = data.results?.[0];
      if (bar?.c) {
        results[sym] = { last: bar.c, prevClose: bar.o, changePct: null };
        _debug[`fallback_${sym}`] = "used prev aggs";
      }
    } catch (_) {}
  }

  // ── Crypto (Polygon format: X:BTCUSD) ──────────────────────────
  if (cryptos.length) {
    try {
      const polyTickers = cryptos.map(s => `X:${s}USD`).join(",");
      const url  = `https://api.polygon.io/v2/snapshot/locale/global/markets/crypto/tickers` +
        `?tickers=${polyTickers}&apiKey=${key}`;
      const r    = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await r.json();

      _debug.crypto_status = data.status;
      _debug.crypto_count  = data.tickers?.length ?? 0;

      (data.tickers || []).forEach(t => {
        const sym  = t.ticker.replace(/^X:/, "").replace(/USD$/, "");
        const last = t.min?.c ?? t.day?.c ?? t.prevDay?.c ?? t.lastTrade?.p ?? null;
        results[sym] = {
          last,
          prevClose:  t.prevDay?.c       ?? null,
          changePct:  t.todaysChangePerc ?? null,
        };
      });
    } catch (e) {
      _debug.crypto_error = e.message;
    }
  }

  res.setHeader("Cache-Control", "s-maxage=29, stale-while-revalidate=60");
  res.status(200).json({ results, _debug });
}
