// Vercel serverless function — real-time market data
// Stocks/ETFs:
//   last      → Finnhub d.c (real-time) with Yahoo regularMarketPrice as fallback
//   prevClose → Yahoo derivedPc (genuine last completed session close), Finnhub d.pc,
//               or Polygon /prev as last resort.
//   changePct → computed ONCE from the final last + prevClose, so price and % always
//               share the same two numbers and stay self-consistent.
//
// IMPORTANT — Yahoo is requested in BATCHES via the spark endpoint
// (/v8/finance/spark?symbols=A,B,C). With 60+ holdings, firing one Yahoo request per
// symbol gets the whole burst rate-limited (HTTP 429) and prevClose comes back null for
// everything. The spark endpoint returns the daily close series for ~20 symbols in a
// SINGLE request, so 66 holdings become ~4 Yahoo calls instead of 66 — well under the
// rate limit. Finnhub still runs per-symbol (in parallel) for the real-time `last`.
//
// Crypto: Polygon snapshot (POLYGON_API_KEY)

const YH_CHUNK = 20; // symbols per Yahoo spark request

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
    const syms = stocks.slice(0, 80);

    // Finnhub (real-time `last`, per-symbol) and Yahoo spark (batch `prevClose`) run
    // concurrently — they are independent. fhMap/yhMap collect the raw values.
    const fhMap = {}; // sym → { last, prevClose }
    const yhMap = {}; // sym → { last, prevClose, name }

    const finnhubAll = async () => {
      if (!finnhubKey) return;
      await Promise.all(syms.map(async sym => {
        try {
          const r = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`,
            { signal: AbortSignal.timeout(4000) }
          );
          const d = await r.json();
          // d.c = current price, d.pc = previous close. We keep d.pc only as a prevClose
          // backup; Yahoo's derivedPc is preferred because Finnhub's d.pc can be stale
          // off-market. We never trust Finnhub d.dp for the % (it collapses to 0 off-market).
          if (d.c > 0) fhMap[sym] = { last: d.c, prevClose: d.pc > 0 ? d.pc : null };
        } catch (_) {}
      }));
    };

    const yahooAll = async () => {
      const chunks = [];
      for (let i = 0; i < syms.length; i += YH_CHUNK) chunks.push(syms.slice(i, i + YH_CHUNK));
      await Promise.all(chunks.map(async chunk => {
        const symbolsParam = chunk.map(encodeURIComponent).join(",");
        for (const host of ["query1", "query2"]) {
          try {
            const r = await fetch(
              `https://${host}.finance.yahoo.com/v8/finance/spark` +
              `?symbols=${symbolsParam}&range=5d&interval=1d`,
              { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) }
            );
            if (!r.ok) continue; // 429 / 5xx → try the other edge host
            const d = await r.json();
            const arr = d.spark?.result ?? [];
            if (!arr.length) continue;
            for (const item of arr) {
              const sym  = item.symbol;
              const resp = item.response?.[0];
              const meta = resp?.meta;
              if (!meta) continue;
              // Skip non-USD quotes (foreign OTC stocks may return CAD price)
              if ((meta.currency ?? "USD") !== "USD") continue;
              const closes = (resp?.indicators?.quote?.[0]?.close ?? []).filter(c => c != null);
              // derivedPc = 2nd-to-last daily close = the genuine last completed-session close.
              // (The last element is today's still-forming bar during/after market hours.)
              // We deliberately do NOT use meta.chartPreviousClose — that is the close BEFORE
              // the 5-day window starts, which would inflate the daily change to a multi-day move.
              const derivedPc = closes.length >= 2 ? closes[closes.length - 2] : null;
              const pc = derivedPc ?? (meta.previousClose > 0 ? meta.previousClose : null) ?? null;
              yhMap[sym] = {
                last: meta.regularMarketPrice > 0 ? meta.regularMarketPrice : null,
                prevClose: pc,
                name: meta.shortName || meta.longName || null,
              };
            }
            return; // this chunk succeeded — stop trying hosts
          } catch (_) { /* try next host */ }
        }
      }));
    };

    await Promise.all([finnhubAll(), yahooAll()]);

    // Merge: Finnhub wins for `last` (more real-time); Yahoo derivedPc wins for `prevClose`.
    for (const sym of syms) {
      const fh = fhMap[sym], yh = yhMap[sym];
      if (!fh && !yh) continue;
      const last      = fh?.last      ?? yh?.last      ?? null;
      const prevClose = yh?.prevClose ?? fh?.prevClose ?? null;
      results[sym] = { last, prevClose, changePct: null, name: yh?.name ?? null };
    }

    // Polygon /prev fallback — only for symbols that have a live `last` but still no
    // prevClose (Yahoo skipped/failed AND Finnhub omitted d.pc). Capped to respect
    // Polygon's free-tier rate limit (5 req/min); the common case needs zero of these.
    if (polygonKey) {
      const needPc = syms
        .filter(s => results[s]?.last != null && !(results[s]?.prevClose > 0))
        .slice(0, 6);
      await Promise.all(needPc.map(async sym => {
        try {
          const r = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/prev?adjusted=true&apiKey=${polygonKey}`,
            { signal: AbortSignal.timeout(4000) }
          );
          const d   = await r.json();
          const bar = d.results?.[0];
          if (bar?.c > 0) results[sym].prevClose = bar.c;
        } catch (_) {}
      }));

      // Symbols where BOTH Finnhub and Yahoo returned nothing at all → Polygon prev-day
      // bar gives at least yesterday's close (prevClose === last; client marks changePct null).
      const noData = syms.filter(s => !results[s]).slice(0, 6);
      await Promise.all(noData.map(async sym => {
        try {
          const r = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/prev?adjusted=true&apiKey=${polygonKey}`,
            { signal: AbortSignal.timeout(4000) }
          );
          const d   = await r.json();
          const bar = d.results?.[0];
          if (bar?.c > 0) results[sym] = { last: bar.c, prevClose: bar.c, changePct: null, name: null };
        } catch (_) {}
      }));
    }

    // changePct computed once, from the exact last + prevClose we return, so the tape and
    // daily P&L always show a self-consistent number that matches standard stock apps.
    for (const sym of syms) {
      const r = results[sym];
      if (!r) continue;
      r.changePct = (r.last != null && r.prevClose > 0)
        ? (r.last - r.prevClose) / r.prevClose * 100
        : null;
    }
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
