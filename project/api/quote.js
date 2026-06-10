// Vercel serverless function — real-time market data
// Stocks/ETFs:
//   last      → Finnhub d.c (real-time) with Yahoo regularMarketPrice as fallback
//   prevClose → Yahoo derivedPc (genuine last completed session close), Finnhub d.pc,
//               or Polygon /prev as last resort
//   changePct → computed ONCE as (last - prevClose) / prevClose, so price and % always
//               share the same two numbers and stay self-consistent. We never trust
//               Finnhub d.dp/d.pc for the % — off-market they collapse change to 0.
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
    await Promise.all(stocks.slice(0, 80).map(async sym => {

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
          // Only take Finnhub's real-time `last` and `pc`. We do NOT trust Finnhub for the
          // % change: during off-market hours it can set d.pc === d.c (change collapses to 0).
          if (d.c > 0) return { last: d.c, prevClose: d.pc > 0 ? d.pc : null };
          return null;
        })(),

        // 2) Yahoo Finance — 2-day series for reliable prevClose.
        //    Try query1, then query2 on any failure (timeout / 429 rate-limit / non-OK).
        //    With 60+ holdings a single host gets rate-limited and the symbol would otherwise
        //    fall through to the Polygon flatten (prevClose === last → ±$0). The second host
        //    is an independent edge, so this recovers most rate-limited symbols.
        (async () => {
          for (const host of ["query1", "query2"]) {
            try {
              const r = await fetch(
                `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`,
                { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
              );
              if (!r.ok) continue; // 429 / 5xx → try the other host
              const d    = await r.json();
              const meta = d.chart?.result?.[0]?.meta;
              // Skip non-USD quotes (foreign OTC stocks may return CAD price)
              if (!(meta?.regularMarketPrice > 0) || (meta.currency ?? "USD") !== "USD") return null;
              const closes      = d.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
              const validCloses = closes.filter(c => c != null);
              const derivedPc   = validCloses.length >= 2 ? validCloses[validCloses.length - 2] : null;
              // derivedPc = 2nd-to-last close in the series (session-before-last close).
              // NOTE: we deliberately do NOT fall back to meta.chartPreviousClose — that is the
              // close BEFORE the chart range starts (days ago), which inflates the daily change.
              const pc = derivedPc ?? meta.previousClose ?? null;
              return { last: meta.regularMarketPrice, prevClose: pc, name: meta.shortName || meta.longName || null };
            } catch (_) { /* try next host */ }
          }
          return null;
        })(),
      ]);

      const fh = fhResult.status  === "fulfilled" ? fhResult.value  : null;
      const yh = yhResult.status  === "fulfilled" ? yhResult.value  : null;

      if (fh || yh) {
        // Finnhub wins for `last` (more real-time).
        // Yahoo wins for `prevClose`: its derivedPc gives "session-before-last" close so
        // pre-market we show the completed session's change, not 0%.
        // During active trading derivedPc is null → Yahoo falls back to meta.previousClose
        // which equals Finnhub's d.pc anyway, so there's no conflict.
        const last      = fh?.last      ?? yh?.last      ?? null;
        let   prevClose = yh?.prevClose ?? fh?.prevClose ?? null;

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

        // changePct is computed ONCE from the exact `last` and `prevClose` we return.
        // This guarantees price and % are always self-consistent (they share the same two
        // numbers) and never relies on Finnhub's d.dp/d.pc, which collapse to 0 off-market.
        // prevClose here = Yahoo derivedPc (the genuine last completed session close), so the
        // result matches what standard stock apps display for the daily change.
        const changePct = (last != null && prevClose > 0)
          ? (last - prevClose) / prevClose * 100
          : null;
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
