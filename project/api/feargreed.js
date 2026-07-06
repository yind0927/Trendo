// Vercel serverless — CNN Fear & Greed Index proxy (avoids browser CORS).
// Optional ?gex=1 also returns SPX Dealer Gamma Exposure from CBOE's free
// delayed options quotes. ?gex=debug adds diagnostics.
//
// Scope: SPX (+ SPXW weeklies), 0–30 DTE, strikes within ±15% of index spot.
// Per contract dollar-gamma per 1% move = γ × OI × 100 × spot² × 0.01. Calls add,
// puts subtract → Net GEX. Net>0 → dealers long gamma → suppress vol (mean-revert);
// Net<0 → dealers short gamma → amplify moves (trend/spiky). We also derive the
// Gamma Flip (net-gamma zero-cross level), Call/Put Walls (max gamma strikes),
// per-DTE-bucket GEX, distances, and a position-sizing correction factor.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// ── GEX helpers ───────────────────────────────────────────────────────────────
// CBOE OCC symbol: ROOT(SPX|SPXW) + YYMMDD + [C|P] + strike×1000 (8 digits).
function parseOcc(sym) {
  const m = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym || "");
  if (!m) return null;
  const [, , yy, mm, dd, cp, strike8] = m;
  return { exp: `20${yy}-${mm}-${dd}`, type: cp === "C" ? "call" : "put", strike: parseInt(strike8, 10) / 1000 };
}

// Fetch SPX option chain (greeks + OI) from CBOE's public delayed-quote CDN.
// _SPX includes both SPX (AM) and SPXW (PM/0DTE) series.
async function fetchCboeChain(diag) {
  const urls = [
    "https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json",
    "https://www.cboe.com/api/global/delayed_quotes/options/_SPX.json",
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

// Gamma flip: sweep a hypothetical spot across strikes; the level where the
// running net-gamma profile crosses zero is where dealer gamma flips sign.
function findGammaFlip(netByStrike, spot) {
  const strikes = Object.keys(netByStrike).map(Number).sort((a, b) => a - b);
  if (strikes.length < 2) return null;
  let cum = 0, prevStrike = null, prevCum = 0;
  for (const s of strikes) {
    const next = cum + netByStrike[s];
    if (prevStrike != null && ((cum <= 0 && next > 0) || (cum >= 0 && next < 0))) {
      // linear-interpolate the crossing between prevStrike and s
      const frac = Math.abs(cum) / (Math.abs(cum) + Math.abs(next) || 1);
      return prevStrike + (s - prevStrike) * frac;
    }
    prevStrike = s; prevCum = cum; cum = next;
  }
  // No crossing: flip is off-range; approximate with the strike nearest spot
  return strikes.reduce((b, s) => Math.abs(s - spot) < Math.abs(b - spot) ? s : b, strikes[0]);
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

// Regime + position-sizing factor from distance-to-flip (% of spot).
// >0 = spot above flip (positive gamma); <0 = below (negative gamma).
function gexRegime(distFlipPct) {
  if (distFlipPct == null)      return { regime: "unknown", posFactor: 1.0 };
  if (distFlipPct >  2)         return { regime: "positive", posFactor: 1.15 }; // deep positive: vol suppressed
  if (distFlipPct >  0.3)       return { regime: "positive", posFactor: 1.0 };
  if (distFlipPct >= -0.3)      return { regime: "neutral",  posFactor: 0.75 }; // straddling flip
  if (distFlipPct >= -2)        return { regime: "negative", posFactor: 0.6 };
  return { regime: "negative", posFactor: 0.4 };                                 // deep negative: vol amplified
}

async function calcGex(kvUrl, kvToken, force, debugMode) {
  const now      = new Date();
  const cacheKey = `trendo:gex_v5:${now.toISOString().slice(0, 13)}`; // v5 = adds swing/history (v4 payloads lack swingGexBn)
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

  diag.push("fetching_cboe_spx");
  const chain = await fetchCboeChain(diag);
  if (!chain) {
    if (debugMode) return { _debug: true, diag, error: "cboe_unavailable" };
    return null;
  }
  const spot = chain.spot;
  diag.push(`spot=${spot} raw_options=${chain.options.length}`);

  // Filter: strikes within ±15% of spot, expirations 0–30 DTE
  const today0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const lo = spot * 0.85, hi = spot * 1.15;
  const GEX_UNIT = 100 * spot * spot * 0.01; // $-gamma per 1% move, per unit γ×OI

  // Accumulators
  let netTotal = 0, callTotal = 0, putTotal = 0, contribCount = 0;
  const netByStrike  = {};   // signed $ gamma
  const callByStrike = {};   // call $ gamma (for call wall)
  const putByStrike  = {};   // put  $ gamma (for put wall)
  const dte = { d0: 0, d1_7: 0, d8_30: 0 };

  for (const o of chain.options) {
    const p = parseOcc(o.option);
    if (!p || p.strike < lo || p.strike > hi) continue;
    const g = o.gamma, oi = o.open_interest;
    if (!g || !oi) continue;
    const dteDays = Math.round((new Date(p.exp + "T00:00:00Z").getTime() - today0.getTime()) / 86400000);
    if (dteDays < 0 || dteDays > 30) continue;

    const dollarGamma = g * oi * GEX_UNIT;
    const signed = p.type === "call" ? dollarGamma : -dollarGamma;
    netTotal += signed; contribCount++;
    netByStrike[p.strike] = (netByStrike[p.strike] || 0) + signed;
    if (p.type === "call") { callTotal += dollarGamma; callByStrike[p.strike] = (callByStrike[p.strike] || 0) + dollarGamma; }
    else                   { putTotal  += dollarGamma; putByStrike[p.strike]  = (putByStrike[p.strike]  || 0) + dollarGamma; }

    if (dteDays === 0)      dte.d0   += signed;
    else if (dteDays <= 7)  dte.d1_7 += signed;
    else                    dte.d8_30 += signed;
  }
  diag.push(`contribs=${contribCount} net=${(netTotal/1e9).toFixed(2)}B`);

  if (!contribCount) {
    if (debugMode) return { _debug: true, diag, error: "no_gamma_data", spot, sample: chain.options[0]?.option };
    return null;
  }

  const argmax = obj => {
    const ks = Object.keys(obj);
    if (!ks.length) return null;
    return +ks.reduce((b, k) => obj[k] > obj[b] ? k : b, ks[0]);
  };
  const callWall = argmax(callByStrike);
  const putWall  = argmax(putByStrike);
  const flip     = findGammaFlip(netByStrike, spot);

  const distFlipPct = flip     != null ? +((spot - flip)     / spot * 100).toFixed(2) : null;
  const distCallPct = callWall != null ? +((callWall - spot) / spot * 100).toFixed(2) : null;
  const distPutPct  = putWall  != null ? +((putWall  - spot) / spot * 100).toFixed(2) : null;
  const { regime, posFactor } = gexRegime(distFlipPct);

  const opEx       = nextMonthlyOpEx();
  const daysToOpEx = Math.max(0, Math.round((opEx.getTime() - now.getTime()) / 86400000));

  const bn = x => +(x / 1e9).toFixed(2);
  const payload = {
    source: "SPX", spot: +spot.toFixed(0),
    netGexBn: bn(netTotal), callGexBn: bn(callTotal), putGexBn: bn(-putTotal),
    // Swing reading: 0DTE gamma vanishes at today's close — for multi-day holds
    // only the 1-30D structure persists. Net minus the 0DTE bucket.
    swingGexBn: bn(netTotal - dte.d0),
    regime, posFactor,
    flip: flip != null ? +flip.toFixed(0) : null,
    callWall, putWall,
    distFlipPct, distCallPct, distPutPct,
    dte: { d0: bn(dte.d0), d1_7: bn(dte.d1_7), d8_30: bn(dte.d8_30) },
    daysToOpEx, nextOpEx: opEx.toISOString().slice(0, 10),
    // legacy fields kept so older cached clients don't break
    gexBn: bn(netTotal), isPositive: netTotal >= 0, zeroGamma: flip != null ? +flip.toFixed(0) : null,
  };

  // ── Daily snapshot history → day-over-day change + percentile ──────────────
  // GEX scales with spot² and OI growth, so absolute thresholds go stale; the
  // percentile vs recent history is the stable way to read "high or low".
  try {
    const histKey  = "trendo:gex_hist_v1";
    const hist     = (await kvGet(histKey)) || {};
    const todayStr = now.toISOString().slice(0, 10);
    hist[todayStr] = { net: payload.netGexBn, swing: payload.swingGexBn, flip: payload.flip, spot: payload.spot };
    const dates = Object.keys(hist).sort();
    while (dates.length > 120) delete hist[dates.shift()];
    const prevDate = dates.filter(d => d < todayStr).pop();
    if (prevDate) {
      payload.prevNetGexBn = hist[prevDate].net;
      payload.netChgBn = +(payload.netGexBn - hist[prevDate].net).toFixed(2);
    }
    const nets = dates.map(d => hist[d].net);
    payload.histDays = nets.length;
    if (nets.length >= 5)
      payload.pctile = Math.round(nets.filter(v => v <= payload.netGexBn).length / nets.length * 100);
    await kvSet(histKey, hist, 86400 * 200);
  } catch (_) {}

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
