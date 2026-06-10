// Vercel serverless function — real-time market data
// Stocks/ETFs:
//   last      → Finnhub d.c (real-time) with Yahoo regularMarketPrice as fallback
//   prevClose → Yahoo derivedPc (genuine last completed session close), Finnhub d.pc,
//               or Polygon snapshot prevDay.c as last resort (one batch call, not per-symbol,
//               to avoid rate-limiting Polygon with 60+ parallel requests)
//   changePct → computed ONCE after all sources resolve, so price and % always
//               share the same two numbers and stay self-consistent.
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
    // Phase 1: Finnhub (real-time last) + Yahoo (reliable prevClose) in parallel per symbol
    await Promise.all(stocks.slice(0, 80).map(async sym => {

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
        //    With 60+ holdings a single host gets rate-limited; query2 is an independent edge
        //    that often recovers rate-limited symbols.
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

      const fh = fhResult.status === "fulfilled" ? fhResult.value : null;
      const yh = yhResult.status === "fulfilled" ? yhResult.value : null;

      if (fh || yh) {
        // Finnhub wins for `last` (more real-time).
        // Yahoo wins for `prevClose`: its derivedPc gives "session-before-last" close so
        // pre-market we show the completed session's change, not 0%.
        const last      = fh?.last      ?? yh?.last      ?? null;
        const prevClose = yh?.prevClose ?? fh?.prevClose ?? null;
        // changePct computed in Phase 3 after Polygon fills any gaps
        results[sym] = { last, prevClose, changePct: null, name: yh?.name ?? null };
      }
      // If both failed, leave results[sym] undefined — Phase 2/3 will handle it
    }));

    // Phase 2: Batch Polygon snapshot for symbols that got a last price but no prevClose.
    // One batch call instead of N individual /prev calls avoids hammering Polygon's rate limit.
    if (polygonKey) {
      const needPc = stocks.slice(0, 80).filter(s => results[s]?.last != null && !(results[s]?.prevClose > 0));
      if (needPc.length) {
        try {
          const pr = await fetch(
            `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers` +
            `?tickers=${needPc.join(",")}&apiKey=${polygonKey}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (pr.ok) {
            const pd = await pr.json();
            (pd.tickers || []).forEach(t => {
              const pc = t.prevDay?.c;
              if (pc > 0 && results[t.ticker]) {
                results[t.ticker].prevClose = pc;
              }
            });
          }
        } catch (_) {}
      }
    }

    // Phase 3: Polygon /prev for symbols where both Finnhub AND Yahoo returned nothing
    if (polygonKey) {
      const noData = stocks.slice(0, 80).filter(s => !results[s]);
      if (noData.length) {
        await Promise.all(noData.map(async sym => {
          try {
            const r = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${polygonKey}`,
              { signal: AbortSignal.timeout(5000) }
            );
            const d   = await r.json();
            const bar = d.results?.[0];
            if (bar?.c) {
              // prevClose === last here: client detects this via changePct === null guard
              results[sym] = { last: bar.c, prevClose: bar.c, changePct: null, name: null };
            }
          } catch (_) {}
        }));
      }
    }

    // Compute changePct for all stocks once all prevClose sources are resolved.
    // This guarantees price and % share the same two numbers and are always self-consistent.
    stocks.slice(0, 80).forEach(sym => {
      const r = results[sym];
      if (!r) return;
      r.changePct = (r.last != null && r.prevClose > 0)
        ? (r.last - r.prevClose) / r.prevClose * 100
        : null;
    });
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
