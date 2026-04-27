// Vercel serverless function — real-time market data
// Stocks/ETFs : Finnhub /api/v1/quote (real-time)  OR  Polygon last-trade + prev-close
// Crypto      : Polygon snapshot
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

  // ── Stocks + ETFs ─────────────────────────────────────────────────
  if (stocks.length) {
    await Promise.all(stocks.slice(0, 12).map(async sym => {

      // Priority 1: Finnhub — single call, real-time current + true prevClose
      if (finnhubKey) {
        try {
          const r = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`,
            { signal: AbortSignal.timeout(5000) }
          );
          const d = await r.json();
          if (d.c > 0) {
            results[sym] = {
              last:      d.c,
              prevClose: d.pc || null,
              changePct: d.pc > 0 ? ((d.c - d.pc) / d.pc) * 100 : (d.dp ?? null),
            };
            return; // done for this symbol
          }
        } catch (_) {}
      }

      // Priority 2: Polygon — last trade (today's price) + prev-day (true prevClose)
      // last/trade gives 15-min delayed price on free tier but IS today's price
      if (!polygonKey) return;
      try {
        const [tradeR, prevR] = await Promise.all([
          fetch(`https://api.polygon.io/v2/last/trade/${sym}?apiKey=${polygonKey}`,
            { signal: AbortSignal.timeout(5000) }),
          fetch(`https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${polygonKey}`,
            { signal: AbortSignal.timeout(5000) }),
        ]);
        const [tradeD, prevD] = await Promise.all([tradeR.json(), prevR.json()]);

        const last      = tradeD.results?.p ?? null;          // last traded price
        const prevClose = prevD.results?.[0]?.c ?? null;      // previous day close

        if (last || prevClose) {
          results[sym] = {
            last:      last ?? prevClose,
            prevClose: prevClose,
            changePct: (last && prevClose) ? ((last - prevClose) / prevClose) * 100 : null,
          };
        }
      } catch (_) {}
    }));
  }

  // ── Crypto: Polygon snapshot ──────────────────────────────────────
  if (cryptos.length && polygonKey) {
    try {
      const tickers = cryptos.map(s => `X:${s}USD`).join(",");
      const r = await fetch(
        `https://api.polygon.io/v2/snapshot/locale/global/markets/crypto/tickers` +
        `?tickers=${tickers}&apiKey=${polygonKey}`,
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
