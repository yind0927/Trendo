// Vercel serverless — CNN Fear & Greed Index proxy (avoids browser CORS).
// Optional ?gex=1 also returns SPY Dealer Gamma Exposure from Yahoo Finance options.
// ?gex=debug returns step-by-step diagnostic info to identify auth failures.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── Yahoo crumb authentication ────────────────────────────────────────────────
async function getYahooCrumb() {
  try {
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    const rawCookie = cookieRes.headers.get("set-cookie") || "";
    // Yahoo returns A3 (not A1) as the session cookie — match any A1/A2/A3
    const cm = rawCookie.match(/\b(A[123])=([^;]+?)(?:;|$)/);
    if (!cm) return { ok: false, reason: "no_a1_cookie", rawCookie: rawCookie.slice(0, 100) };
    const cookieStr = `${cm[1]}=${cm[2].trim()}`;

    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, "Accept": "text/plain, */*", "Cookie": cookieStr, "Referer": "https://finance.yahoo.com/" },
      signal: AbortSignal.timeout(5000),
    });
    const crumbText = (await crumbRes.text()).trim();
    if (!crumbRes.ok || !crumbText || crumbText.startsWith("<") || crumbText.startsWith("{"))
      return { ok: false, reason: "crumb_bad_response", status: crumbRes.status, crumbText: crumbText.slice(0, 80) };

    return { ok: true, cookieStr, crumb: crumbText };
  } catch (e) { return { ok: false, reason: "exception", msg: e.message }; }
}

// ── Options chain fetch: try without crumb first, then with crumb ─────────────
async function fetchChain(sym, dateTs, auth) {
  // Try multiple host/crumb combinations in order
  const attempts = [
    // 1. Cookie + crumb, query1 (primary path)
    ...(auth?.ok ? [{ host: "query1", useCrumb: true }] : []),
    // 2. Cookie + crumb, query2
    ...(auth?.ok ? [{ host: "query2", useCrumb: true }] : []),
    // 3. Cookie only, no crumb (older fallback)
    ...(auth?.ok ? [{ host: "query2", useCrumb: false }] : []),
    // 4. No cookie, no crumb (last resort)
    { host: "query2", useCrumb: false, noAuth: true },
    { host: "query1", useCrumb: false, noAuth: true },
  ];

  for (const { host, useCrumb, noAuth } of attempts) {
    const base = `https://${host}.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}`;
    let url = dateTs ? `${base}?date=${dateTs}` : base;
    if (useCrumb) url += (dateTs ? "&" : "?") + `crumb=${encodeURIComponent(auth.crumb)}`;
    try {
      const headers = { "User-Agent": UA, "Accept": "application/json", "Referer": "https://finance.yahoo.com/" };
      if (!noAuth && auth?.cookieStr) headers["Cookie"] = auth.cookieStr;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const d = await r.json();
      const result = d?.optionChain?.result?.[0];
      if (result) return { result, attempt: `${host}${useCrumb ? "+crumb" : ""}` };
    } catch (_) {}
  }
  return null;
}

// ── GEX calculation ───────────────────────────────────────────────────────────
function accumulate(opts, spot, acc) {
  for (const c of (opts.calls || [])) {
    if (!c.gamma || !c.openInterest) continue;
    const g = c.gamma * c.openInterest * 100 * spot;
    acc.callSum += g; acc.callCount++;
    acc.byStrike[c.strike] = (acc.byStrike[c.strike] || 0) + g;
  }
  for (const p of (opts.puts || [])) {
    if (!p.gamma || !p.openInterest) continue;
    const g = p.gamma * p.openInterest * 100 * spot;
    acc.putSum += g; acc.putCount++;
    acc.byStrike[p.strike] = (acc.byStrike[p.strike] || 0) - g;
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

async function calcGex(kvUrl, kvToken, force, debugMode) {
  const now      = new Date();
  const cacheKey = `trendo:gex_v1:${now.toISOString().slice(0, 13)}`;
  const kvHdrs   = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };
  const diag     = [];  // diagnostic steps for debug mode

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

  // Get crumb auth
  diag.push("getting_crumb");
  const auth = await getYahooCrumb();
  diag.push(auth.ok ? `crumb_ok` : `crumb_fail:${auth.reason}`);

  // Fetch front-month chain
  diag.push("fetching_front_chain");
  const frontResult = await fetchChain("SPY", null, auth);
  if (!frontResult) {
    if (debugMode) return { _debug: true, diag, error: "all_chain_attempts_failed", authDetail: auth };
    return null;
  }
  diag.push(`front_ok:${frontResult.attempt}`);

  const front = frontResult.result;
  const spot  = front.quote?.regularMarketPrice;
  if (!spot || spot < 1) {
    if (debugMode) return { _debug: true, diag, error: "no_spot_price" };
    return null;
  }

  // Fetch 2 additional expirations in parallel
  const extraExps   = (front.expirationDates || []).slice(1, 3);
  const extraChains = await Promise.all(extraExps.map(ts => fetchChain("SPY", ts, auth)));
  diag.push(`extra_chains:${extraChains.filter(Boolean).length}/${extraExps.length}`);

  const acc = { callSum: 0, putSum: 0, callCount: 0, putCount: 0, byStrike: {} };
  if (front.options?.[0]) accumulate(front.options[0], spot, acc);
  for (const ch of extraChains) if (ch?.result?.options?.[0]) accumulate(ch.result.options[0], spot, acc);

  diag.push(`calls_with_gamma:${acc.callCount}  puts_with_gamma:${acc.putCount}`);

  if (acc.callSum === 0 && acc.putSum === 0) {
    if (debugMode) return { _debug: true, diag, error: "no_gamma_data", spot, callCount: acc.callCount, putCount: acc.putCount };
    return null;
  }

  const netGex    = acc.callSum - acc.putSum;
  const gexBn     = +(netGex / 1e9).toFixed(2);
  const zeroGamma = findZeroGamma(acc.byStrike, spot);
  const opEx      = nextMonthlyOpEx();
  const daysToOpEx = Math.max(0, Math.round((opEx.getTime() - now.getTime()) / 86400000));

  const payload = {
    spot: +spot.toFixed(2), gexBn, isPositive: netGex >= 0,
    callGexBn: +(acc.callSum / 1e9).toFixed(2), putGexBn: +(acc.putSum / 1e9).toFixed(2),
    zeroGamma: zeroGamma != null ? +zeroGamma.toFixed(0) : null,
    daysToOpEx, nextOpEx: opEx.toISOString().slice(0, 10),
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

  if (wantGex) response.gex = gexResult.status === "fulfilled" ? gexResult.value : null;

  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  res.json(response);
}
