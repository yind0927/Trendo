// Vercel serverless function — real-time market data
// Stocks/ETFs strategy:
//   Finnhub (real-time last) + Yahoo Finance 2-day (accurate prevClose) run in PARALLEL.
//   Finnhub wins for `last`; Yahoo wins for `prevClose` (time-series is more reliable for OTC).
//   Polygon /prev is the last resort when both fail.
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
    await Promise.all(stocks.slice(0, 50).map(async sym => {

      // Run Finnhub and Yahoo Finance in parallel for each symbol.
      // Finnhub gives real-time `last`; Yahoo 2-day series gives accurate `prevClose`.
      const [fhResult, yhResult] = await Promise.allSettled([

        // 1) Finnhub — real-time price
        (async () => {
          if (!finnhubKey) return null;
          const r = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`,
            { signal: AbortSignal.timeout(5000) }
          );
          const d = await r.json();
          if (d.c > 0) return { last: d.c, prevClose: d.pc > 0 ? d.pc : null, changePct: d.dp ?? null };
          return null;
        })(),

        // 2) Yahoo Finance — 2-day series for reliable prevClose
        (async () => {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`,
            { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
          );
          const d    = await r.json();
          const meta = d.chart?.result?.[0]?.meta;
          // Skip non-USD quotes (foreign OTC stocks may return CAD price)
          if (!(meta?.regularMarketPrice > 0) || (meta.currency ?? "USD") !== "USD") return null;
          const closes      = d.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
          const validCloses = closes.filter(c => c != null);
          const derivedPc   = validCloses.length >= 2 ? validCloses[validCloses.length - 2] : null;
          const pc = meta.previousClose ?? meta.chartPreviousClose ?? derivedPc ?? null;
          return { last: meta.regularMarketPrice, prevClose: pc, name: meta.shortName || meta.longName || null };
        })(),
      ]);

      const fh = fhResult.status  === "fulfilled" ? fhResult.value  : null;
      const yh = yhResult.status  === "fulfilled" ? yhResult.value  : null;

      if (fh || yh) {
        // Prefer Finnhub's real-time last and prevClose (unadjusted, accurate for daily P&L).
        // Fall back to Yahoo's prevClose only when Finnhub has none (e.g. OTC stocks).
        const last      = fh?.last      ?? yh?.last      ?? null;
        let   prevClose = fh?.prevClose ?? yh?.prevClose ?? null;

        // When we have a current price but no prevClose (e.g. OTC stocks where Finnhub
        // omits d.pc and Yahoo returns non-USD), use Polygon's previous-day bar for prevClose.
        // We must NOT let Polygon overwrite `last` here — we only want its prevClose.
        if (last && !prevClose && polygonKey) {
          try {
            const pr  = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/prev?adjusted=true&apiKey=${polygonKey}`,
              { signal: AbortSignal.timeout(5000) }
            );
            const pd  = await pr.json();
            const bar = pd.results?.[0];
            if (bar?.c > 0) prevClose = bar.c;
          } catch (_) {}
        }

        const changePct = prevClose && last ? ((last - prevClose) / prevClose) * 100
                        : fh?.changePct ?? null;
        results[sym] = { last, prevClose, changePct, name: yh?.name ?? null };
        return;
      }

      // 3) Polygon prev-day — yesterday's close only (last resort: both Finnhub AND Yahoo failed)
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
