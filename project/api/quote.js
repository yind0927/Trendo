// Vercel serverless function — real-time market data
// Stocks/ETFs (per symbol, Finnhub + Yahoo in parallel):
//   last      → Market OPEN: Finnhub d.c (real-time), guarded against gross divergence
//               from Yahoo regularMarketPrice. Market CLOSED (pre/post/weekend): Yahoo
//               regularMarketPrice (the REGULAR-session close) — Finnhub d.c can drift to
//               an extended-hours print off-hours and mismatch the broker's day change.
//   prevClose → Yahoo raw close series (unadjusted, broker-matching) using timestamps to
//               pick the correct bar whether market is open or closed → Polygon daily bars
//               with the SAME timestamp-based selection (NOT /prev: after the close /prev
//               returns today's finalized bar, flattening the daily change to ~0%).
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

  // US regular session: Mon–Fri 13:30–21:00 UTC. Determines prevClose bar selection —
  // when closed, `last` equals the most recent completed close, so the daily change
  // must reference the session before it (see comments in the Yahoo block).
  const _now = new Date();
  const _mins = _now.getUTCHours() * 60 + _now.getUTCMinutes();
  const marketOpen = _now.getUTCDay() >= 1 && _now.getUTCDay() <= 5 &&
                     _mins >= 13 * 60 + 30 && _mins < 21 * 60;

  // Polygon daily bars (ascending) for the past ~9 days. Used by both fallbacks below.
  // We do NOT use Polygon /prev: after the close it returns TODAY's finalized bar, so
  // prevClose would equal today's close and flatten the daily change to ~0% for any
  // symbol whose Yahoo fetch happened to fail that cycle. With the bar list we apply
  // the same timestamp-based selection as the Yahoo path: skip today's bar if present.
  // adjusted=false: unadjusted closes match Yahoo indicators.quote[0].close (raw) and
  // broker display. adjusted=true gives dividend-adjusted historical prices that can
  // diverge from the broker's "previous session close" on ex-dividend dates.
  const polygonBars = async sym => {
    const to   = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10);
    const r = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/range/1/day/${from}/${to}` +
      `?adjusted=false&sort=asc&apiKey=${polygonKey}`,
      { signal: AbortSignal.timeout(3500) }
    );
    const d = await r.json();
    return (d.results || []).filter(b => b.c > 0);
  };
  // Previous-session close from the bar list — same session-aware rule as the Yahoo
  // path: market open with no today-bar → bars[-1] (yesterday); every other case
  // (today's bar present, or market closed = pre-market/weekend) → bars[-2].
  const polygonPrevClose = bars => {
    if (!bars.length) return null;
    if (bars.length === 1) return bars[0].c;
    const todayUTC = new Date().toISOString().slice(0, 10);
    const lastUTC  = new Date(bars[bars.length - 1].t).toISOString().slice(0, 10);
    const todayBarIn = lastUTC === todayUTC;
    const bar = (marketOpen && !todayBarIn)
      ? bars[bars.length - 1]
      : bars[bars.length - 2];
    return bar?.c ?? null;
  };

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
              // prevClose = the unadjusted close of the most recent COMPLETED session
              // STRICTLY BEFORE the session that `last` (regularMarketPrice) belongs to.
              // We anchor to meta.regularMarketTime — the timestamp of the regular-session
              // price — instead of the wall clock, so the choice stays correct across the
              // UTC/ET date boundary, pre-market, after-hours and weekends WITHOUT a
              // separate marketOpen heuristic (the old `new Date()` anchor could pick the
              // wrong bar in the UTC-evening window). The in-progress intraday bar (whose
              // close is the live price, same session date as regularMarketTime) is
              // auto-excluded, and so is the just-finalized bar after the close — both
              // share the session date, and we require bar date < session date.
              const rawCloses = d.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
              const timestamps = d.chart?.result?.[0]?.timestamp ?? [];
              const validBars  = rawCloses
                .map((c, i) => ({ c, ts: timestamps[i] }))
                .filter(b => b.c != null && b.ts != null);
              const rmt = meta.regularMarketTime;
              let derivedPc = null;
              if (validBars.length >= 2 && rmt) {
                const sessionUTC = new Date(rmt * 1000).toISOString().slice(0, 10);
                for (let i = validBars.length - 1; i >= 0; i--) {
                  const barUTC = new Date(validBars[i].ts * 1000).toISOString().slice(0, 10);
                  if (barUTC < sessionUTC) { derivedPc = validBars[i].c; break; }
                }
                if (derivedPc == null) derivedPc = validBars[validBars.length - 2].c;
              } else if (validBars.length >= 2) {
                // No regularMarketTime — fall back to the second-to-last bar (correct
                // off-hours and in the common case).
                derivedPc = validBars[validBars.length - 2].c;
              } else if (validBars.length === 1) {
                derivedPc = validBars[0].c;
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
        // `last` source selection — the crux of matching the broker's day change:
        //  • Market OPEN: Finnhub d.c is the freshest regular-session print → prefer it,
        //    but if it diverges grossly from Yahoo's regularMarketPrice (>12% → a stale or
        //    bad tick) fall back to Yahoo so last/prevClose stay session-consistent.
        //  • Market CLOSED (pre-market / after-hours / weekend): use Yahoo
        //    regularMarketPrice — the REGULAR-session close. Finnhub d.c can drift to an
        //    EXTENDED-HOURS print for liquid names, which then mismatches the broker's day
        //    change (computed off the regular close) — the exact "some stocks match, some
        //    don't" symptom. Yahoo regularMarketPrice excludes extended hours and pairs
        //    exactly with the bar-derived prevClose (same regular session).
        //  Yahoo derivedPc is the sole prevClose source here; Finnhub d.pc is excluded (see
        //  header comment). If Yahoo failed, prevClose stays null and Polygon fills it.
        const fhLast = fh?.last ?? null;
        const yhLast = yh?.last ?? null;
        let last;
        if (marketOpen && fhLast != null) {
          const diverged = yhLast != null && Math.abs(fhLast - yhLast) / yhLast > 0.12;
          last = diverged ? yhLast : fhLast;
        } else {
          last = yhLast ?? fhLast;
        }
        let   prevClose = yh?.prevClose ?? null;

        // Polygon daily bars when Yahoo failed to supply prevClose (common when Yahoo is
        // rate-limited or returns non-USD data). Never let it overwrite `last`.
        if (last && !(prevClose > 0) && polygonKey) {
          try {
            const pc = polygonPrevClose(await polygonBars(sym));
            if (pc > 0) prevClose = pc;
          } catch (_) {}
        }

        const changePct = (last != null && prevClose > 0)
          ? (last - prevClose) / prevClose * 100
          : null;
        results[sym] = { last, prevClose, changePct, name: yh?.name ?? null };
        return;
      }

      // 3) Polygon daily bars — last resort: both Finnhub AND Yahoo failed entirely.
      // With ≥2 bars we can serve a genuine last + prevClose pair (e.g. after the close:
      // last = today's finalized close, prevClose = yesterday) instead of the old
      // flattened prevClose===last && changePct null placeholder.
      if (polygonKey) {
        try {
          const bars = await polygonBars(sym);
          if (bars.length >= 2) {
            const last = bars[bars.length - 1].c;
            const pc   = bars[bars.length - 2].c;
            results[sym] = { last, prevClose: pc, changePct: (last - pc) / pc * 100 };
          } else if (bars.length === 1) {
            results[sym] = { last: bars[0].c, prevClose: bars[0].c, changePct: null };
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

  // Edge-cache each identical (symbol-set) request for 45s. The client polls every 30s
  // with a stable query string, so ~every other poll is served from the CDN WITHOUT
  // invoking the function → roughly halves invocations, and multiple tabs/devices hitting
  // the same edge dedupe onto one origin call. Max staleness ~45s (fine for swing trading).
  // NOTE: no stale-while-revalidate — SWR revalidates in the background on every request,
  // which re-invokes the function and defeats the dedup. A plain s-maxage cache does not.
  res.setHeader("Cache-Control", "public, s-maxage=45");
  res.status(200).json({ results });
}
