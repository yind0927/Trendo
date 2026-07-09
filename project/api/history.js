// Vercel serverless function — historical daily closes + options chain
// History: ?symbols=AAPL,BTC-USD&from=2024-01-01
// Options: ?opts=1&sym=QQQ[&expiry=<unix_ts>]

export default async function handler(req, res) {
  // ── Options chain mode (?opts=1) ─────────────────────────────────────────
  if (req.query.opts === "1") {
    const sym    = (req.query.sym || "").toUpperCase();
    const expiry = req.query.expiry || "";
    if (!sym) return res.status(400).json({ error: "sym required" });

    const kvUrl   = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const kvHdr   = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };
    const cacheKey = `trendo:opts:${sym}:${expiry || "0"}`;

    if (kvUrl && kvToken) {
      try {
        const r = await fetch(`${kvUrl}/pipeline`, {
          method: "POST", headers: kvHdr,
          body: JSON.stringify([["GET", cacheKey]]),
        });
        const [{ result }] = await r.json();
        if (result) return res.json({ ...JSON.parse(result), cached: true });
      } catch (_) {}
    }

    try {
      const url = expiry
        ? `https://query2.finance.yahoo.com/v7/finance/options/${sym}?date=${expiry}`
        : `https://query2.finance.yahoo.com/v7/finance/options/${sym}`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      });
      if (!resp.ok) return res.status(resp.status).json({ error: `Yahoo returned ${resp.status}` });
      const data = await resp.json();
      const chain = data?.optionChain?.result?.[0];
      if (!chain) return res.status(404).json({ error: "No options data" });

      const mapOpt = o => ({
        strike: o.strike, bid: o.bid ?? 0, ask: o.ask ?? 0, last: o.lastPrice ?? 0,
        iv: o.impliedVolatility ?? 0, volume: o.volume ?? 0, oi: o.openInterest ?? 0,
        expiry: o.expiration, itm: o.inTheMoney ?? false,
      });
      const result = {
        sym, spot: chain.quote?.regularMarketPrice ?? 0,
        expirations: chain.expirationDates ?? [],
        calls: (chain.options?.[0]?.calls ?? []).map(mapOpt),
        puts:  (chain.options?.[0]?.puts  ?? []).map(mapOpt),
        selectedExp: chain.options?.[0]?.expirationDate ?? null,
      };

      if (kvUrl && kvToken) {
        fetch(`${kvUrl}/pipeline`, {
          method: "POST", headers: kvHdr,
          body: JSON.stringify([["SET", cacheKey, JSON.stringify(result)], ["EXPIRE", cacheKey, 300]]),
        }).catch(() => {});
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Historical daily closes mode ─────────────────────────────────────────
  const syms = (req.query.symbols || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 30);
  const from  = req.query.from || "";

  if (!syms.length) return res.status(400).json({ error: "no symbols" });

  const fromTs = from ? Math.floor(new Date(from).getTime() / 1000) : Math.floor(Date.now() / 1000) - 86400 * 400;
  const toTs   = Math.floor(Date.now() / 1000) + 86400;

  const results = {};
  const volumeResults = {};

  await Promise.all(syms.map(async sym => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
        `?interval=1d&period1=${fromTs}&period2=${toTs}`;
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "application/json",
        }
      });
      if (!r.ok) return;
      const data = await r.json();
      const chart = data?.chart?.result?.[0];
      if (!chart) return;
      const timestamps = chart.timestamp || [];
      const closes     = chart.indicators?.quote?.[0]?.close || [];
      const volumes    = chart.indicators?.quote?.[0]?.volume || [];
      const prices     = {};
      const vols       = {};
      timestamps.forEach((ts, i) => {
        if (closes[i] == null) return;
        const d = new Date(ts * 1000).toISOString().slice(0, 10);
        prices[d] = closes[i];
        if (volumes[i] != null) vols[d] = volumes[i];
      });
      if (Object.keys(prices).length) {
        results[sym] = prices;
        volumeResults[sym] = vols;
      }
    } catch (_) {}
  }));

  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  res.json({ results, volumeResults });
}
