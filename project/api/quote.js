// Vercel serverless function — real-time market data
//
// Design goal: fetch `last` + `prevClose` for up to ~80 symbols every 30s WITHOUT
// tripping upstream rate limits. The old per-symbol design issued Finnhub + Yahoo-chart
// for every symbol (~2×N upstream calls); at 60+ holdings that rate-limited after hours
// and dropped symbols onto the Polygon prev-day fallback where prevClose === last, which
// flattens the daily change to ±0 (the "±$0 / +0.00%" rows).
//
// New design:
//   1. Yahoo spark — ONE batched request returns last + prevClose for ALL symbols.
//   2. Per-symbol Yahoo chart — fallback ONLY for the few symbols spark missed.
//   3. Finnhub — used ONLY to sharpen `last` during US market hours. We never take
//      prevClose from Finnhub: off-market it sets d.pc === d.c and flattens the change.
//   4. Polygon prev-day bar — its close is YESTERDAY's close, a valid prevClose; used as
//      a last-resort prevClose source. Only when we have NO `last` at all do we fall to
//      the truly flattened (prevClose === last) shape, and the client then keeps its own
//      previously-known prevClose instead of clobbering it.
//
// changePct is computed ONCE from the final last + prevClose, so price and % always agree.
// Crypto: Polygon snapshot (POLYGON_API_KEY).

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

function isUSMarketHours() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= 13 * 60 + 25 && mins < 21 * 60 + 5; // 13:25–21:05 UTC (regular session ± buffer)
}

// Parse a Yahoo chart/spark `response[0]` object into { last, prevClose, name }.
// Robust to spark's lighter meta: if regularMarketPrice is absent we derive `last` from
// the close series, so a minimal-meta spark item still yields usable data instead of being
// dropped (which would flush every symbol back onto the per-symbol fallback).
function parseYahooResult(resp) {
  const meta = resp?.meta;
  if (!meta) return null;
  if ((meta.currency ?? "USD") !== "USD") return null; // skip foreign-currency quotes
  const closes     = (resp.indicators?.quote?.[0]?.close ?? []).filter(c => c != null);
  const lastClose  = closes.length ? closes[closes.length - 1] : null;
  const last       = meta.regularMarketPrice > 0 ? meta.regularMarketPrice : lastClose;
  if (!(last > 0)) return null;
  // 2nd-to-last close in the series = genuine last completed session close, so daily change
  // is broker-like across pre-market / after-hours (NOT 0). We do NOT fall back to
  // meta.chartPreviousClose: that is the close BEFORE the chart range starts (days ago for
  // range=5d), which inflates the daily change to a multi-day move (the +8~13% bug). When
  // derivedPc is unavailable we use meta.previousClose (Yahoo's official prior-session close).
  const derivedPc  = closes.length >= 2 ? closes[closes.length - 2] : null;
  return {
    last,
    prevClose: derivedPc ?? meta.previousClose ?? null,
    name:      meta.shortName || meta.longName || null,
  };
}

// One batched Yahoo spark request → { SYM: {last, prevClose, name} }. Tries query1 then query2.
async function fetchYahooSpark(symbols) {
  const out = {};
  if (!symbols.length) return out;
  // range=5d (not 2d): guarantees the close series holds >=2 trading-day bars so derivedPc
  // (the 2nd-to-last close = yesterday's close) is reliably present. With range=2d a weekend
  // or holiday could leave a single bar, dropping derivedPc and forcing a wrong fallback.
  const qs = `symbols=${encodeURIComponent(symbols.join(","))}&range=5d&interval=1d`;
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const r = await fetch(`https://${host}/v8/finance/spark?${qs}`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
      if (!r.ok) continue;
      const d = await r.json();
      (d.spark?.result || []).forEach(item => {
        const parsed = parseYahooResult(item.response?.[0]);
        if (parsed) out[(item.symbol || item.response?.[0]?.meta?.symbol || "").toUpperCase()] = parsed;
      });
      if (Object.keys(out).length) return out; // got data — done
    } catch (_) { /* try next host */ }
  }
  return out;
}

// Per-symbol Yahoo chart → { last, prevClose, name } | null. Fallback for spark misses.
async function fetchYahooChart(sym) {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const r = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
      if (!r.ok) continue;
      const d = await r.json();
      const parsed = parseYahooResult(d.chart?.result?.[0]);
      if (parsed) return parsed;
    } catch (_) { /* try next host */ }
  }
  return null;
}

// Finnhub real-time last (market hours only). Returns number | null. Never used for prevClose.
async function fetchFinnhubLast(sym, key) {
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`,
      { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    return d.c > 0 ? d.c : null;
  } catch (_) { return null; }
}

// Polygon previous-day bar close = YESTERDAY's close → a valid prevClose. Returns number | null.
async function fetchPolygonPrevClose(sym, key) {
  try {
    const r = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/prev?adjusted=true&apiKey=${key}`,
      { signal: AbortSignal.timeout(5000) });
    const d   = await r.json();
    const bar = d.results?.[0];
    return bar?.c > 0 ? bar.c : null;
  } catch (_) { return null; }
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
    const marketOpen = isUSMarketHours();

    // 1) ONE batched spark request for everyone.
    const spark = await fetchYahooSpark(stocks);

    await Promise.all(stocks.map(async sym => {
      // prevClose source priority (all give a genuine prior-session close):
      //   spark derivedPc → chart derivedPc → polygon prev bar.
      // Finnhub is NEVER a prevClose source (its d.pc flattens off-market).
      let base = spark[sym] ?? null;

      // 2) spark missed this symbol → per-symbol Yahoo chart (reliable prevClose + last).
      if (!base) base = await fetchYahooChart(sym);

      // 3) sharpen `last` with Finnhub during market hours (more real-time than Yahoo).
      let last = base?.last ?? null;
      if (finnhubKey && marketOpen) {
        const fhLast = await fetchFinnhubLast(sym, finnhubKey);
        if (fhLast != null) last = fhLast;
      }

      let prevClose = base?.prevClose ?? null;

      // 4) still no prevClose but we have a last → Polygon prev-day close (yesterday).
      if (last != null && !(prevClose > 0) && polygonKey) {
        prevClose = await fetchPolygonPrevClose(sym, polygonKey);
      }

      // 5) no last from anywhere → Polygon prev bar as both (flattened). The client detects
      //    changePct === null && prevClose === last and keeps its own known prevClose.
      if (last == null && polygonKey) {
        const pc = await fetchPolygonPrevClose(sym, polygonKey);
        if (pc != null) { results[sym] = { last: pc, prevClose: pc, changePct: null }; return; }
      }

      if (last == null) return; // nothing at all for this symbol

      const changePct = (prevClose > 0) ? (last - prevClose) / prevClose * 100 : null;
      results[sym] = { last, prevClose: prevClose ?? null, changePct, name: base?.name ?? null };
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
