// Vercel serverless function — real-time market data
// Stocks/ETFs:
//   last + prevClose come together from a SINGLE Finnhub /quote call (d.c and d.pc),
//   so the common path needs exactly one request per symbol and prevClose is always
//   populated. Yahoo (chart) and Polygon (/prev) only fill the few symbols Finnhub
//   misses — and both are CAPPED so we never fire a 60-way request storm that gets
//   rate-limited (the bug that left prevClose null → "行情加载中" for everything).
//   changePct is computed ONCE from the final last + prevClose, so the ticker tape and
//   the "今日盈亏" module always show the same self-consistent number.
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
    const syms = stocks.slice(0, 80);

    // Phase 1 — Finnhub: one call gives BOTH real-time last (d.c) and previous close (d.pc).
    // d.pc is the official prior-session close, so (d.c - d.pc) / d.pc is the standard daily
    // change shown by stock apps. We guard d.pc !== d.c so a rare flat/closed-market reading
    // (pc collapsed to c) is treated as "missing" and filled by Yahoo below.
    await Promise.all(syms.map(async sym => {
      if (!finnhubKey) return;
      try {
        const r = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`,
          { signal: AbortSignal.timeout(4000) }
        );
        const d = await r.json();
        if (d.c > 0) {
          results[sym] = {
            last: d.c,
            prevClose: (d.pc > 0 && d.pc !== d.c) ? d.pc : null,
            changePct: null,
            name: null,
          };
        }
      } catch (_) {}
    }));

    // Phase 2 — Yahoo chart fills symbols Finnhub missed entirely OR left without prevClose.
    // CAPPED at 16 and only the gaps, so this is a handful of requests, not 60+.
    const needYahoo = syms.filter(s => !results[s] || !(results[s].prevClose > 0)).slice(0, 16);
    if (needYahoo.length) {
      await Promise.all(needYahoo.map(async sym => {
        for (const host of ["query1", "query2"]) {
          try {
            const r = await fetch(
              `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`,
              { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(4000) }
            );
            if (!r.ok) continue; // 429 / 5xx → try the other edge host
            const d    = await r.json();
            const meta = d.chart?.result?.[0]?.meta;
            // Skip non-USD quotes (foreign OTC stocks may return CAD price)
            if (!(meta?.regularMarketPrice > 0) || (meta.currency ?? "USD") !== "USD") return;
            const closes = (d.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(c => c != null);
            // derivedPc = 2nd-to-last daily close = genuine last completed-session close.
            // We deliberately do NOT use meta.chartPreviousClose (close before the window
            // starts), which would inflate the daily change to a multi-day move.
            const derivedPc = closes.length >= 2 ? closes[closes.length - 2] : null;
            const pc = derivedPc ?? (meta.previousClose > 0 ? meta.previousClose : null);
            const cur = results[sym] || { last: null, prevClose: null, changePct: null, name: null };
            if (cur.last == null) cur.last = meta.regularMarketPrice;
            if (pc > 0) cur.prevClose = pc;
            if (cur.name == null) cur.name = meta.shortName || meta.longName || null;
            results[sym] = cur;
            return;
          } catch (_) { /* try next host */ }
        }
      }));
    }

    // Phase 3 — Polygon prev-day close, CAPPED at 6, for whatever still lacks prevClose
    // (free tier is 5 req/min, so the cap matters).
    if (polygonKey) {
      const needPoly = syms.filter(s => !results[s] || !(results[s].prevClose > 0)).slice(0, 6);
      await Promise.all(needPoly.map(async sym => {
        try {
          const r = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/prev?adjusted=true&apiKey=${polygonKey}`,
            { signal: AbortSignal.timeout(4000) }
          );
          const d   = await r.json();
          const bar = d.results?.[0];
          if (bar?.c > 0) {
            const cur = results[sym] || { last: bar.c, prevClose: null, changePct: null, name: null };
            if (cur.last == null) cur.last = bar.c;
            cur.prevClose = bar.c;
            results[sym] = cur;
          }
        } catch (_) {}
      }));
    }

    // changePct computed once, from the exact last + prevClose we return.
    for (const sym of syms) {
      const r = results[sym];
      if (!r) continue;
      r.changePct = (r.last > 0 && r.prevClose > 0)
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
