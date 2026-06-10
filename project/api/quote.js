// Vercel serverless function — real-time market data
// Stocks/ETFs:
//   Yahoo spark (ONE batched request for all symbols) → last + prevClose for everyone.
//   Old design fetched Yahoo per symbol: ~30 parallel hits per 30s cycle tripped Yahoo's
//   rate limit alongside Finnhub's 60/min cap, dropping symbols onto the Polygon prev-day
//   fallback where prevClose === last and the daily change flattens to ±0.
//   Finnhub d.c still wins for `last` (more real-time), but only during US market hours —
//   off-market it just repeats the session close Yahoo already gives us.
//   changePct → computed ONCE as (last - prevClose) / prevClose, so price and % always
//   share the same two numbers and stay self-consistent.
// Crypto: Polygon snapshot (POLYGON_API_KEY)

function isUSMarketHours() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  // 13:25–21:05 UTC — regular session with a small buffer either side
  return mins >= 13 * 60 + 25 && mins < 21 * 60 + 5;
}

export default async function handler(req, res) {
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const polygonKey = process.env.POLYGON_API_KEY;

  const stocks  = (req.query.stocks || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 80);
  const cryptos = (req.query.crypto || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

  if (!stocks.length && !cryptos.length) {
    return res.status(400).json({ error: "No symbols provided" });
  }

  const results = {};

  // ── Stocks + ETFs ─────────────────────────────────────────────────
  if (stocks.length) {

    // 1) Yahoo spark — single batched request covering every symbol.
    //    2-day daily series: 2nd-to-last close = genuine last completed session close,
    //    so pre-market we show the completed session's change, not 0%.
    const spark = {};
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(stocks.join(","))}&range=2d&interval=1d`,
        { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) }
      );
      const d = await r.json();
      (d.spark?.result || []).forEach(item => {
        const resp = item.response?.[0];
        const meta = resp?.meta;
        // Skip non-USD quotes (foreign OTC stocks may return CAD price)
        if (!(meta?.regularMarketPrice > 0) || (meta.currency ?? "USD") !== "USD") return;
        const closes    = (resp.indicators?.quote?.[0]?.close ?? []).filter(c => c != null);
        const derivedPc = closes.length >= 2 ? closes[closes.length - 2] : null;
        spark[(item.symbol || meta.symbol || "").toUpperCase()] = {
          last:      meta.regularMarketPrice,
          prevClose: derivedPc ?? meta.previousClose ?? meta.chartPreviousClose ?? null,
          name:      meta.shortName || meta.longName || null,
        };
      });
    } catch (_) {}

    const marketOpen = isUSMarketHours();

    await Promise.all(stocks.map(async sym => {

      // 2) Finnhub — real-time `last`, market hours only (off-market d.c === session close,
      //    which spark already provides; skipping keeps us under the 60 req/min cap).
      //    Also used as fallback when spark missed this symbol entirely.
      let fh = null;
      if (finnhubKey && (marketOpen || !spark[sym])) {
        try {
          const r = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`,
            { signal: AbortSignal.timeout(5000) }
          );
          const d = await r.json();
          // Only take Finnhub's real-time `last` and `pc`. We do NOT trust Finnhub for the
          // % change: during off-market hours it can set d.pc === d.c (change collapses to 0).
          if (d.c > 0) fh = { last: d.c, prevClose: d.pc > 0 ? d.pc : null };
        } catch (_) {}
      }

      let yh = spark[sym] ?? null;

      // 3) Per-symbol Yahoo chart — only when the spark batch missed this symbol AND
      //    Finnhub failed too (rare: spark down or freshly listed ticker).
      if (!yh && !fh) {
        try {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`,
            { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
          );
          const d    = await r.json();
          const meta = d.chart?.result?.[0]?.meta;
          if (meta?.regularMarketPrice > 0 && (meta.currency ?? "USD") === "USD") {
            const closes      = d.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
            const validCloses = closes.filter(c => c != null);
            const derivedPc   = validCloses.length >= 2 ? validCloses[validCloses.length - 2] : null;
            yh = {
              last:      meta.regularMarketPrice,
              prevClose: derivedPc ?? meta.previousClose ?? null,
              name:      meta.shortName || meta.longName || null,
            };
          }
        } catch (_) {}
      }

      if (fh || yh) {
        // Finnhub wins for `last` (more real-time); Yahoo wins for `prevClose`
        // (its derived close is the genuine last completed session close).
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

        // changePct is computed ONCE from the exact `last` and `prevClose` we return,
        // so price and % are always self-consistent.
        const changePct = (last != null && prevClose > 0)
          ? (last - prevClose) / prevClose * 100
          : null;
        results[sym] = { last, prevClose, changePct, name: yh?.name ?? null };
        return;
      }

      // 4) Polygon prev-day — yesterday's close only (last resort: every source failed).
      //    prevClose === last here, so changePct stays null; the client treats this as a
      //    price-only update and keeps its previously known prevClose.
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
