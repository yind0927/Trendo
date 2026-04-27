// Vercel serverless function — real-time market data
// Stocks/ETFs : Finnhub /api/v1/quote  (real-time; uses FINNHUB_API_KEY)
// Crypto      : Polygon snapshot        (uses POLYGON_API_KEY)
//
// GET /api/quote?stocks=NVDA,TSLA&crypto=BTC
// Returns: { results: { SYM: { last, prevClose, changePct } } }

export default async function handler(req, res) {
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const polygonKey = process.env.POLYGON_API_KEY;

  const stocks  = (req.query.stocks || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const cryptos = (req.query.crypto || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

  if (!stocks.length && !cryptos.length) {
    return res.status(400).json({ error: "No symbols provided" });
  }

  const results = {};

  // ── Stocks + ETFs: Finnhub real-time quote ────────────────────────
  // Returns c=current, pc=prevClose, dp=daily% — free tier, real-time
  if (stocks.length && finnhubKey) {
    await Promise.all(stocks.slice(0, 12).map(async sym => {
      try {
        const r = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`,
          { signal: AbortSignal.timeout(6000) }
        );
        const d = await r.json();
        if (d.c > 0) {
          results[sym] = {
            last:      d.c,
            prevClose: d.pc || null,
            changePct: d.pc > 0 ? ((d.c - d.pc) / d.pc) * 100 : (d.dp ?? null),
          };
        }
      } catch (_) {}
    }));
  }

  // ── Stocks fallback: Polygon prev-day (if Finnhub not configured) ─
  if (stocks.length && !finnhubKey && polygonKey) {
    await Promise.all(stocks.slice(0, 12).map(async sym => {
      if (results[sym]) return;
      try {
        const r = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${polygonKey}`,
          { signal: AbortSignal.timeout(6000) }
        );
        const d    = await r.json();
        const bar  = d.results?.[0];
        if (bar?.c) {
          results[sym] = {
            last:      bar.c,
            prevClose: bar.c,
            changePct: null,
          };
        }
      } catch (_) {}
    }));
  }

  // ── Crypto: Polygon snapshot (works on free tier for global markets) ─
  if (cryptos.length && polygonKey) {
    try {
      const polyTickers = cryptos.map(s => `X:${s}USD`).join(",");
      const r = await fetch(
        `https://api.polygon.io/v2/snapshot/locale/global/markets/crypto/tickers` +
        `?tickers=${polyTickers}&apiKey=${polygonKey}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const d = await r.json();
      (d.tickers || []).forEach(t => {
        const sym = t.ticker.replace(/^X:/, "").replace(/USD$/, "");
        results[sym] = {
          last:      t.min?.c ?? t.day?.c ?? t.prevDay?.c ?? t.lastTrade?.p ?? null,
          prevClose: t.prevDay?.c ?? null,
          changePct: t.todaysChangePerc ?? null,
        };
      });
    } catch (_) {}
  }

  res.setHeader("Cache-Control", "s-maxage=29, stale-while-revalidate=60");
  res.status(200).json({ results });
}
