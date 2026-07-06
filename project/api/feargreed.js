// Vercel serverless — CNN Fear & Greed Index proxy (avoids browser CORS).
// Optional ?gex=1 also returns SPY Dealer Gamma Exposure computed from Polygon's
// options snapshot (per-contract gamma × open interest). ?gex=debug adds diag.
//
// GEX scope: near-term expirations (the 3 nearest, ≤~5 weeks out) within ±10% of
// spot — this is where dealer gamma concentrates and drives daily hedging. Net
// GEX>0 → dealers long gamma → suppresses volatility (mean-reverting); Net GEX<0
// → dealers short gamma → amplifies moves (trending / spiky).

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// ── GEX helpers ───────────────────────────────────────────────────────────────
function accumulate(contracts, spot, acc) {
  for (const c of contracts) {
    const g   = c.greeks?.gamma;
    const oi  = c.open_interest;
    const type = c.details?.contract_type;
    const strike = c.details?.strike_price;
    if (!g || !oi || !strike || (type !== "call" && type !== "put")) continue;
    const mult = c.details?.shares_per_contract || 100;
    const dollarGamma = g * oi * mult * spot;
    if (type === "call") {
      acc.callSum += dollarGamma; acc.callCount++;
      acc.byStrike[strike] = (acc.byStrike[strike] || 0) + dollarGamma;
    } else {
      acc.putSum += dollarGamma; acc.putCount++;
      acc.byStrike[strike] = (acc.byStrike[strike] || 0) - dollarGamma;
    }
  }
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

// SPY previous close as a cheap, robust anchor for the ±10% strike window.
async function fetchSpyPrevClose(pgKey) {
  try {
    const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/SPY/prev?adjusted=true&apiKey=${pgKey}`,
      { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.results?.[0]?.c ?? null;
  } catch (_) { return null; }
}

// Pull the options snapshot, bounded to strikes near `anchor` and the nearest
// expirations from today. Paginates up to `maxPages` (rate-limit safe).
async function fetchOptionsSnapshot(pgKey, anchor, diag, maxPages = 3) {
  const today = new Date().toISOString().slice(0, 10);
  const lo = Math.floor(anchor * 0.90), hi = Math.ceil(anchor * 1.10);
  let url = `https://api.polygon.io/v3/snapshot/options/SPY` +
    `?strike_price.gte=${lo}&strike_price.lte=${hi}` +
    `&expiration_date.gte=${today}` +
    `&order=asc&sort=expiration_date&limit=250&apiKey=${pgKey}`;

  const all = [];
  let httpNote = "";
  for (let page = 0; page < maxPages && url; page++) {
    let r;
    try {
      r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    } catch (e) { httpNote = `fetch_err:${e.message}`; break; }
    if (!r.ok) { httpNote = `http_${r.status}`; break; }
    const d = await r.json();
    if (Array.isArray(d.results)) all.push(...d.results);
    url = d.next_url ? `${d.next_url}&apiKey=${pgKey}` : null;
  }
  diag.push(`snapshot pages_pulled contracts=${all.length}${httpNote ? " " + httpNote : ""}`);
  return all;
}

async function calcGex(pgKey, kvUrl, kvToken, force, debugMode) {
  const now      = new Date();
  const cacheKey = `trendo:gex_v2:${now.toISOString().slice(0, 13)}`; // v2 = Polygon source
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

  if (!pgKey) { if (debugMode) return { _debug: true, error: "no_polygon_key" }; return null; }

  if (!force && !debugMode) {
    const cached = await kvGet(cacheKey);
    if (cached) return { ...cached, _src: "cache" };
  }

  // Anchor for strike window
  diag.push("fetching_prev_close");
  const anchor = await fetchSpyPrevClose(pgKey);
  if (!anchor) {
    if (debugMode) return { _debug: true, diag, error: "no_anchor_price" };
    return null;
  }
  diag.push(`anchor=${anchor}`);

  // Snapshot
  const contracts = await fetchOptionsSnapshot(pgKey, anchor, diag);
  if (!contracts.length) {
    if (debugMode) return { _debug: true, diag, error: "no_contracts (check Polygon options entitlement)" };
    return null;
  }

  // Keep only the 3 nearest expiration dates
  const expDates = [...new Set(contracts.map(c => c.details?.expiration_date).filter(Boolean))].sort();
  const keepExps = new Set(expDates.slice(0, 3));
  const kept = contracts.filter(c => keepExps.has(c.details?.expiration_date));
  diag.push(`exps=${[...keepExps].join(",")} kept=${kept.length}`);

  // Live-ish spot from the snapshot's underlying asset, else the anchor
  const spot = kept.find(c => c.underlying_asset?.price > 0)?.underlying_asset.price || anchor;

  const acc = { callSum: 0, putSum: 0, callCount: 0, putCount: 0, byStrike: {} };
  accumulate(kept, spot, acc);
  diag.push(`calls_with_gamma=${acc.callCount} puts_with_gamma=${acc.putCount}`);

  if (acc.callCount === 0 && acc.putCount === 0) {
    if (debugMode) return { _debug: true, diag, error: "no_gamma_data (Polygon plan may not include options greeks)", spot };
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
      ? calcGex(process.env.POLYGON_API_KEY, process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN, force, debugGex)
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
