// Vercel serverless — CNN Fear & Greed Index proxy (avoids browser CORS).
// Optional ?gex=1 also returns SPY Dealer Gamma Exposure computed from CBOE's
// free delayed options quotes (per-contract gamma × open interest). ?gex=debug adds diag.
//
// GEX scope: near-term expirations (the 3 nearest) within ±10% of spot — where
// dealer gamma concentrates and drives daily hedging. Net GEX>0 → dealers long
// gamma → suppresses volatility (mean-reverting); Net GEX<0 → dealers short
// gamma → amplifies moves (trending / spiky).

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// ── GEX helpers ───────────────────────────────────────────────────────────────
// CBOE OCC symbol: ROOT + YYMMDD + [C|P] + strike×1000 (8 digits).
function parseOcc(sym) {
  const m = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym || "");
  if (!m) return null;
  const [, , yy, mm, dd, cp, strike8] = m;
  return { exp: `20${yy}-${mm}-${dd}`, type: cp === "C" ? "call" : "put", strike: parseInt(strike8, 10) / 1000 };
}

// Fetch SPY option chain (with greeks + OI) from CBOE's public delayed-quote CDN.
async function fetchCboeChain(diag) {
  const urls = [
    "https://cdn.cboe.com/api/global/delayed_quotes/options/SPY.json",
    "https://www.cboe.com/api/global/delayed_quotes/options/SPY.json",
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" }, signal: AbortSignal.timeout(9000) });
      if (!r.ok) { diag.push(`cboe http_${r.status}`); continue; }
      const d = await r.json();
      const spot = d?.data?.current_price ?? d?.data?.close ?? d?.data?.prev_day_close;
      const options = d?.data?.options;
      if (spot > 0 && Array.isArray(options) && options.length) return { spot, options };
      diag.push("cboe empty_body");
    } catch (e) { diag.push(`cboe err:${e.message}`); }
  }
  return null;
}

function findZeroGamma(byStrike, spot) {
  const near = Object.keys(byStrike).map(Number)
    .filter(s => s >= spot * 0.88 && s <= spot * 1.12).sort((a, b) => a - b);
  if (near.length < 2) return null;
  let cum = 0;
  for (let i = 0; i < near.length; i++) {
    const prev = cum; cum += byStrike[near[i]] || 0;
    if (i > 0 && ((prev <= 0 && cum > 0) || (prev >= 0 && cum < 0))) return near[i];
  }
  return near.reduce((best, s) => Math.abs(byStrike[s] || 0) > Math.abs(byStrike[best] || 0) ? s : best, near[0]);
}

function nextMonthlyOpEx() {
  const now = new Date(); let y = now.getUTCFullYear(), m = now.getUTCMonth();
  for (let i = 0; i < 4; i++) {
    const d = new Date(Date.UTC(y, m, 1)); let fri = 0;
    while (fri < 3) { if (d.getUTCDay() === 5) fri++; if (fri < 3) d.setUTCDate(d.getUTCDate() + 1); }
    if (d.getTime() > now.getTime() + 43200000) return d;
    if (++m > 11) { m = 0; y++; }
  }
  return new Date(Date.UTC(y, m, 15));
}

async function calcGex(kvUrl, kvToken, force, debugMode) {
  const now      = new Date();
  const cacheKey = `trendo:gex_v3:${now.toISOString().slice(0, 13)}`; // v3 = CBOE source
  const kvHdrs   = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };
  const diag     = [];

  const kvGet = async key => {
    if (!kvUrl || !kvToken) return null;
    try {
      const r = await fetch(`${kvUrl}/pipeline`, { method: "POST", headers: kvHdrs, body: JSON.stringify([["GET", key]]) });
      const [{ result }] = await r.json();
      return result ? JSON.parse(result) : null;
    } catch (_) { return null; }
  };
  const kvSet = async (key, val, ttl = 3600) => {
    if (!kvUrl || !kvToken) return;
    try { await fetch(`${kvUrl}/pipeline`, { method: "POST", headers: kvHdrs, body: JSON.stringify([["SET", key, JSON.stringify(val)], ["EXPIRE", key, ttl]]) }); }
    catch (_) {}
  };

  if (!force && !debugMode) {
    const cached = await kvGet(cacheKey);
    if (cached) return { ...cached, _src: "cache" };
  }

  // Fetch full SPY chain from CBOE
  diag.push("fetching_cboe");
  const chain = await fetchCboeChain(diag);
  if (!chain) {
    if (debugMode) return { _debug: true, diag, error: "cboe_unavailable" };
    return null;
  }
  const spot = chain.spot;
  diag.push(`spot=${spot} raw_options=${chain.options.length}`);

  // Parse OCC symbols, keep strikes within ±10% of spot
  const lo = spot * 0.90, hi = spot * 1.10;
  const parsed = [];
  for (const o of chain.options) {
    const p = parseOcc(o.option);
    if (!p || p.strike < lo || p.strike > hi) continue;
    parsed.push({ ...p, gamma: o.gamma, oi: o.open_interest });
  }
  if (!parsed.length) {
    if (debugMode) return { _debug: true, diag, error: "no_parsable_contracts", sample: chain.options[0]?.option };
    return null;
  }

  // Keep only the 3 nearest expiration dates
  const expDates = [...new Set(parsed.map(p => p.exp))].sort();
  const keepExps = new Set(expDates.slice(0, 3));
  const kept = parsed.filter(p => keepExps.has(p.exp));
  diag.push(`exps=${[...keepExps].join(",")} kept=${kept.length}`);

  const acc = { callSum: 0, putSum: 0, callCount: 0, putCount: 0, byStrike: {} };
  for (const c of kept) {
    if (!c.gamma || !c.oi) continue;
    const dollarGamma = c.gamma * c.oi * 100 * spot;
    if (c.type === "call") {
      acc.callSum += dollarGamma; acc.callCount++;
      acc.byStrike[c.strike] = (acc.byStrike[c.strike] || 0) + dollarGamma;
    } else {
      acc.putSum += dollarGamma; acc.putCount++;
      acc.byStrike[c.strike] = (acc.byStrike[c.strike] || 0) - dollarGamma;
    }
  }
  diag.push(`calls_with_gamma=${acc.callCount} puts_with_gamma=${acc.putCount}`);

  if (acc.callCount === 0 && acc.putCount === 0) {
    if (debugMode) return { _debug: true, diag, error: "no_gamma_data", spot };
    return null;
  }

  const netGex     = acc.callSum - acc.putSum;
  const gexBn      = +(netGex / 1e9).toFixed(2);
  const zeroGamma  = findZeroGamma(acc.byStrike, spot);
  const opEx       = nextMonthlyOpEx();
  const daysToOpEx = Math.max(0, Math.round((opEx.getTime() - now.getTime()) / 86400000));

  const payload = {
    spot: +spot.toFixed(2), gexBn, isPositive: netGex >= 0,
    callGexBn: +(acc.callSum / 1e9).toFixed(2), putGexBn: +(acc.putSum / 1e9).toFixed(2),
    zeroGamma: zeroGamma != null ? +zeroGamma.toFixed(0) : null,
    daysToOpEx, nextOpEx: opEx.toISOString().slice(0, 10),
    expsUsed: keepExps.size,
  };
  if (debugMode) return { _debug: true, diag, ...payload };

  await kvSet(cacheKey, payload);
  return { ...payload, _src: "fresh" };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const gexParam = req.query.gex;           // "1" = return GEX, "debug" = diagnostic
  const wantGex  = gexParam === "1" || gexParam === "debug";
  const debugGex = gexParam === "debug";
  const force    = req.query.force === "1";

  const [fgResult, gexResult] = await Promise.allSettled([
    (async () => {
      const r = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
        headers: { "User-Agent": UA, "Referer": "https://www.cnn.com/markets/fear-and-greed", "Accept": "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      return r.json();
    })(),
    wantGex
      ? calcGex(process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN, force, debugGex)
      : Promise.resolve(null),
  ]);

  if (fgResult.status === "rejected")
    return res.status(502).json({ error: fgResult.reason?.message || "F&G unavailable" });

  const data = fgResult.value;
  const fg   = data?.fear_and_greed;
  if (!fg) return res.status(502).json({ error: "unexpected format" });

  const prevScore = fg.previous_close != null ? Math.round(fg.previous_close) : null;
  const response  = { score: Math.round(fg.score), rating: fg.rating, prevScore };

  if (wantGex) response.gex = gexResult.status === "fulfilled" ? gexResult.value
                            : (debugGex ? { _debug: true, error: "calc_threw", msg: gexResult.reason?.message } : null);

  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  res.json(response);
}
