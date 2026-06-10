// Vercel serverless function — real-time market data
// Stocks/ETFs (per symbol, Finnhub + Yahoo in parallel):
//   last      → Finnhub d.c (real-time) with Yahoo regularMarketPrice as fallback
//   prevClose → Yahoo raw close series (unadjusted, broker-matching) using timestamps to
//               pick the correct bar whether market is open or closed → Polygon /prev
//               NOTE: Finnhub d.pc and Yahoo meta.previousClose are intentionally NOT used.
//               Finnhub d.pc can be stale by multiple sessions. Yahoo meta.previousClose is
//               ADJUSTED for corporate actions (spin-offs, special dividends), so on an
//               ex-distribution day it returns the adjusted basis (e.g. ~$99) while the
//               broker compares to the actual previous session close (~$110) — causing a
//               large phantom gain. The raw indicators.quote[0].close series is unadjusted
//               and timestamp-indexed so we always select the true previous session close.
//   changePct → computed ONCE from the final last + prevClose, so the ticker tape and the
//               今日盈亏 module always show the same self-consistent number.
//
// The CLIENT splits its holdings into small chunks (~15 symbols) and calls this endpoint
// once per chunk, so a single invocation never fires 130+ concurrent fetches (which got
// Yahoo rate-limited and timed the function out → empty response → "行情加载中"). Each
// chunk is small enough to finish well under Vercel's 10s limit.
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

      const [fhResult, yhResult] = await Promise.allSettled([

        // 1) Finnhub — real-time price only. d.c = last.
        //    d.pc is intentionally ignored: it can lag by multiple sessions and produces
        //    a wrong multi-day % that looks like a valid daily move (see header comment).
        (async () => {
          if (!finnhubKey) return null;
          const r = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`,
            { signal: AbortSignal.timeout(3500) }
          );
          const d = await r.json();
          if (d.c > 0) return { last: d.c };
          return null;
        })(),

        // 2) Yahoo chart — 5-day daily series for an accurate prevClose. Try query1 then
        //    query2 (independent edges) on any failure (timeout / 429 / non-OK).
        (async () => {
          for (const host of ["query1", "query2"]) {
            try {
              const r = await fetch(
                `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
                { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(3500) }
              );
              if (!r.ok) continue;
              const d    = await r.json();
              const meta = d.chart?.result?.[0]?.meta;
              // Skip non-USD quotes (foreign OTC stocks may return CAD price)
              if (!(meta?.regularMarketPrice > 0) || (meta.currency ?? "USD") !== "USD") return null;
              // indicators.quote[0].close = RAW (unadjusted) closes — broker-matching.
              // meta.previousClose = ADJUSTED by Yahoo for corporate actions (spin-off / special
              // dividend): e.g. INTC after a ~$11 distribution Yahoo sets previousClose≈$99
              // while the broker compares to the actual session close of ~$110. Never use it.
              //
              // Pick the right bar using timestamps: when today's session bar is present (last
              // bar's date == today UTC), the previous close is closes[length-2]. When the series
              // ends at yesterday (pre-market / market still open), it's closes[length-1].
              const rawCloses = d.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
              const timestamps = d.chart?.result?.[0]?.timestamp ?? [];
              const validBars  = rawCloses
                .map((c, i) => ({ c, ts: timestamps[i] }))
                .filter(b => b.c != null);
              let derivedPc = null;
              if (validBars.length >= 1) {
                const lastTs  = validBars[validBars.length - 1].ts;
                const todayUTC = new Date().toISOString().slice(0, 10);
                const lastUTC  = new Date(lastTs * 1000).toISOString().slice(0, 10);
                derivedPc = lastUTC === todayUTC && validBars.length >= 2
                  ? validBars[validBars.length - 2].c   // today in series → 2nd-to-last = yesterday
                  : validBars[validBars.length - 1].c;  // today not in series → last = yesterday
              }
              const pc = derivedPc ?? null;
              return { last: meta.regularMarketPrice, prevClose: pc, name: meta.shortName || meta.longName || null };
            } catch (_) { /* try next host */ }
          }
          return null;
        })(),
      ]);

      const fh = fhResult.status === "fulfilled" ? fhResult.value : null;
      const yh = yhResult.status === "fulfilled" ? yhResult.value : null;

      if (fh || yh) {
        // Finnhub wins for `last` (more real-time). Yahoo derivedPc is the sole source for
        // `prevClose` from the Finnhub+Yahoo parallel fetch — Finnhub d.pc is excluded (see
        // header comment). If Yahoo failed, prevClose stays null and Polygon /prev fills it.
        const last      = fh?.last      ?? yh?.last      ?? null;
        let   prevClose = yh?.prevClose ?? null;

        // Polygon prev-day bar when Yahoo failed to supply prevClose (common when Yahoo is
        // rate-limited or returns non-USD data). Never let it overwrite `last`.
        if (last && !(prevClose > 0) && polygonKey) {
          try {
            const pr  = await fetch(
              `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/prev?adjusted=true&apiKey=${polygonKey}`,
              { signal: AbortSignal.timeout(3500) }
            );
            const pd  = await pr.json();
            const bar = pd.results?.[0];
            if (bar?.c > 0) prevClose = bar.c;
          } catch (_) {}
        }

        const changePct = (last != null && prevClose > 0)
          ? (last - prevClose) / prevClose * 100
          : null;
        results[sym] = { last, prevClose, changePct, name: yh?.name ?? null };
        return;
      }

      // 3) Polygon prev-day — last resort: both Finnhub AND Yahoo failed entirely.
      if (polygonKey) {
        try {
          const r = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/prev?adjusted=true&apiKey=${polygonKey}`,
            { signal: AbortSignal.timeout(3500) }
          );
          const d   = await r.json();
          const bar = d.results?.[0];
          if (bar?.c) results[sym] = { last: bar.c, prevClose: bar.c, changePct: null };
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
