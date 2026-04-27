// Vercel serverless function — real-time market data
// Stocks/ETFs priority:
//   1. Finnhub /api/v1/quote       (real-time, needs FINNHUB_API_KEY)
//   2. Yahoo Finance chart API     (today's price, no key required)
//   3. Polygon /prev               (yesterday's close, last resort)
// Crypto: Polygon snapshot (POLYGON_API_KEY)

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

      // 1) Finnhub — real-time, single call (needs FINNHUB_API_KEY)
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
            return;
          }
        } catch (_) {}
      }

      // 2) Yahoo Finance — today's price, no API key needed
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
          { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
        );
        const d    = await r.json();
        const meta = d.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice > 0) {
          const last = meta.regularMarketPrice;
          const pc   = meta.previousClose ?? meta.chartPreviousClose ?? null;
          results[sym] = {
            last,
            prevClose: pc,
            changePct: pc ? ((last - pc) / pc) * 100 : null,
          };
          return;
        }
      } catch (_) {}

      // 3) Polygon prev-day — yesterday's close only (last resort)
      if (polygonKey) {
        try {
          const r = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${polygonKey}`,
            { signal: AbortSignal.timeout(5000) }
          );
          const d   = await r.json();
          const bar = d.results?.[0];
          if (bar?.c) {
            results[sym] = { last: bar.c, prevClose: bar.c, changePct: null };
          }
        } catch (_) {}
      }
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
