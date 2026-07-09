// Vercel serverless function — historical daily closes + options chain
// History: ?symbols=AAPL,BTC-USD&from=2024-01-01
// Options: ?opts=1&sym=QQQ[&expiry=<unix_ts>]   ← Nasdaq.com free API, no auth

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Parse Nasdaq number strings: "3.45", "1,234", "18.50%", "--" → number
function _nNum(s) {
  if (!s || s === "--" || s === "N/A") return 0;
  return parseFloat(String(s).replace(/[%$,]/g, "")) || 0;
}

// Nasdaq.com options API — no auth required.
// expiryDate: ISO date string "YYYY-MM-DD", or null for nearest expiry.
async function fetchNasdaqOptions(sym, expiryDate) {
  const expParam = expiryDate || "undefined";
  const url = `https://api.nasdaq.com/api/quote/${sym}/option-chain` +
    `?assetclass=etf&limit=600&offset=0&fromdate=undefined&todate=undefined` +
    `&expiryDate=${expParam}&type=all`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": `https://www.nasdaq.com/market-activity/funds-and-etfs/${sym.toLowerCase()}/option-chain`,
    },
  });
  if (!resp.ok) throw new Error(`Nasdaq ${resp.status}`);
  const data = await resp.json();

  const rows  = data?.data?.table?.rows;
  const dates = data?.data?.expiryDates?.dates ?? []; // ["2025-07-18", ...]
  if (!rows?.length) throw new Error("No option rows");

  const calls = [], puts = [];
  let curExpiry = null;
  for (const row of rows) {
    // expirygroup is set on the first row of each new expiry ("Jul 18, 2025"), empty on subsequent rows
    if (row.expirygroup?.trim()) {
      try { curExpiry = new Date(row.expirygroup + " UTC").toISOString().slice(0, 10); } catch (_) {}
    }
    if (!curExpiry) continue;
    const strike = _nNum(row.strike);
    if (!strike) continue;
    const expTs = Math.floor(new Date(curExpiry + "T21:00:00Z").getTime() / 1000);

    calls.push({ strike, expiry: expTs, bid: _nNum(row.c_Bid), ask: _nNum(row.c_Ask),
      last: _nNum(row.c_Last), iv: _nNum(row.c_IV) / 100,
      volume: Math.round(_nNum(row.c_Volume)), oi: Math.round(_nNum(row.c_OI)), itm: false });
    puts.push({ strike, expiry: expTs, bid: _nNum(row.p_Bid), ask: _nNum(row.p_Ask),
      last: _nNum(row.p_Last), iv: _nNum(row.p_IV) / 100,
      volume: Math.round(_nNum(row.p_Volume)), oi: Math.round(_nNum(row.p_OI)), itm: false });
  }

  const expirations = dates.map(d => Math.floor(new Date(d + "T21:00:00Z").getTime() / 1000));
  const selectedExp = calls[0]?.expiry ?? (expirations[0] ?? null);
  return { calls, puts, expirations, selectedExp };
}

export default async function handler(req, res) {
  // ── Options chain mode (?opts=1) ─────────────────────────────────────────
  if (req.query.opts === "1") {
    const sym     = (req.query.sym || "").toUpperCase();
    const expiryTs = req.query.expiry || ""; // Unix timestamp string from client
    if (!sym) return res.status(400).json({ error: "sym required" });

    // Convert Unix ts → ISO date for Nasdaq API
    const expiryDate = expiryTs
      ? new Date(parseInt(expiryTs, 10) * 1000).toISOString().slice(0, 10)
      : null;

    const kvUrl   = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const kvHdr   = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };
    const cacheKey = `trendo:opts2:${sym}:${expiryDate || "0"}`;

    // Redis cache (5 min)
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
      // Fetch options chain + spot price in parallel
      const [chainData, spotResp] = await Promise.all([
        fetchNasdaqOptions(sym, expiryDate),
        fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
          { headers: { "User-Agent": UA } }),
      ]);

      let spot = 0;
      try { spot = (await spotResp.json())?.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0; } catch (_) {}

      // Mark ITM
      const calls = chainData.calls.map(c => ({ ...c, itm: spot > 0 && c.strike < spot }));
      const puts  = chainData.puts.map(p  => ({ ...p, itm: spot > 0 && p.strike > spot }));

      const result = { sym, spot, expirations: chainData.expirations, calls, puts,
                       selectedExp: chainData.selectedExp };

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
          "User-Agent": UA,
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
