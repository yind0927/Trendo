// api/options.js — options chain proxy (Yahoo Finance v7, 5min Redis cache)
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const sym    = (req.query.sym || "").toUpperCase();
  const expiry = req.query.expiry || ""; // optional Unix timestamp string
  if (!sym) return res.status(400).json({ error: "sym required" });

  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const kvHdr   = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };
  const cacheKey = `trendo:opts:${sym}:${expiry || "0"}`;

  // ── Redis cache (5 min) ───────────────────────────────────────────────────
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

  // ── Fetch Yahoo Finance v7 options chain ──────────────────────────────────
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
      strike: o.strike,
      bid:    o.bid       ?? 0,
      ask:    o.ask       ?? 0,
      last:   o.lastPrice ?? 0,
      iv:     o.impliedVolatility ?? 0,
      volume: o.volume    ?? 0,
      oi:     o.openInterest ?? 0,
      expiry: o.expiration,
      itm:    o.inTheMoney ?? false,
    });

    const result = {
      sym,
      spot:        chain.quote?.regularMarketPrice ?? 0,
      expirations: chain.expirationDates ?? [],
      calls:       (chain.options?.[0]?.calls ?? []).map(mapOpt),
      puts:        (chain.options?.[0]?.puts  ?? []).map(mapOpt),
      selectedExp: chain.options?.[0]?.expirationDate ?? null,
    };

    // ── Write cache ─────────────────────────────────────────────────────────
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
