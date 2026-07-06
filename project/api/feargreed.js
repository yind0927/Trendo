// Vercel serverless — CNN Fear & Greed Index proxy (avoids browser CORS).
// Optional ?gex=1 also returns SPY Dealer Gamma Exposure from Yahoo Finance options.
// Yahoo Finance options require crumb auth (added ~2024): fetch cookie → exchange for
// crumb token → include crumb in options requests.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── Yahoo crumb authentication ────────────────────────────────────────────────
// Yahoo requires: (1) A1 cookie from fc.yahoo.com, (2) crumb from getcrumb endpoint.
// The crumb must be appended to options API calls as ?crumb=XXX with matching Cookie header.
async function getYahooCrumb() {
  try {
    // Step 1: get A1 session cookie
    const cookieRes = await fetch("https://fc.yahoo.com", {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    const rawCookie = cookieRes.headers.get("set-cookie") || "";
    const a1 = rawCookie.match(/\bA1=([^;,\s]+)/)?.[1];
    if (!a1) return null;
    const cookieStr = `A1=${a1}`;

    // Step 2: exchange cookie for crumb
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": UA,
        "Accept": "text/plain, */*",
        "Cookie": cookieStr,
        "Referer": "https://finance.yahoo.com/",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!crumbRes.ok) return null;
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.length < 3 || crumb.startsWith("<") || crumb.startsWith("{")) return null;

    return { cookieStr, crumb };
  } catch (_) { return null; }
}

// ── GEX helpers ───────────────────────────────────────────────────────────────
async function fetchChain(sym, dateTs, auth) {
  const base = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(sym)}`;
  let url = dateTs ? `${base}?date=${dateTs}` : base;
  if (auth?.crumb) url += (dateTs ? "&" : "?") + `crumb=${encodeURIComponent(auth.crumb)}`;
  try {
    const headers = {
      "User-Agent": UA,
      "Accept": "application/json",
      "Referer": "https://finance.yahoo.com/",
    };
    if (auth?.cookieStr) headers["Cookie"] = auth.cookieStr;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.optionChain?.result?.[0] || null;
  } catch (_) { return null; }
}

function accumulate(opts, spot, acc) {
  for (const c of (opts.calls || [])) {
    if (!c.gamma || !c.openInterest) continue;
    const g = c.gamma * c.openInterest * 100 * spot;
    acc.callSum += g;
    acc.byStrike[c.strike] = (acc.byStrike[c.strike] || 0) + g;
  }
  for (const p of (opts.puts || [])) {
    if (!p.gamma || !p.openInterest) continue;
    const g = p.gamma * p.openInterest * 100 * spot;
    acc.putSum += g;
    acc.byStrike[p.strike] = (acc.byStrike[p.strike] || 0) - g;
  }
}

function findZeroGamma(byStrike, spot) {
  const near = Object.keys(byStrike)
    .map(Number)
    .filter(s => s >= spot * 0.88 && s <= spot * 1.12)
    .sort((a, b) => a - b);
  if (near.length < 2) return null;
  let cum = 0;
  for (let i = 0; i < near.length; i++) {
    const prev = cum;
    cum += byStrike[near[i]] || 0;
    if (i > 0 && ((prev <= 0 && cum > 0) || (prev >= 0 && cum < 0))) return near[i];
  }
  return near.reduce((best, s) => Math.abs(byStrike[s] || 0) > Math.abs(byStrike[best] || 0) ? s : best, near[0]);
}

function nextMonthlyOpEx() {
  const now = new Date();
  let y = now.getUTCFullYear(), m = now.getUTCMonth();
  for (let attempt = 0; attempt < 4; attempt++) {
    const d = new Date(Date.UTC(y, m, 1));
    let fri = 0;
    while (fri < 3) { if (d.getUTCDay() === 5) fri++; if (fri < 3) d.setUTCDate(d.getUTCDate() + 1); }
    if (d.getTime() > now.getTime() + 43200000) return d;
    if (++m > 11) { m = 0; y++; }
  }
  return new Date(Date.UTC(y, m, 15));
}

async function calcGex(kvUrl, kvToken, force) {
  const now      = new Date();
  const cacheKey = `trendo:gex_v1:${now.toISOString().slice(0, 13)}`;
  const kvHdrs   = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };

  const kvGet = async key => {
    if (!kvUrl || !kvToken) return null;
    try {
      const r = await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvHdrs, body: JSON.stringify([["GET", key]]),
      });
      const [{ result }] = await r.json();
      return result ? JSON.parse(result) : null;
    } catch (_) { return null; }
  };
  const kvSet = async (key, val, ttl = 3600) => {
    if (!kvUrl || !kvToken) return;
    try {
      await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvHdrs,
        body: JSON.stringify([["SET", key, JSON.stringify(val)], ["EXPIRE", key, ttl]]),
      });
    } catch (_) {}
  };

  if (!force) {
    const cached = await kvGet(cacheKey);
    if (cached) return cached;
  }

  // Get Yahoo crumb auth before fetching options
  const auth = await getYahooCrumb();

  const front = await fetchChain("SPY", null, auth);
  if (!front) return null;
  const spot = front.quote?.regularMarketPrice;
  if (!spot || spot < 1) return null;

  const extraExps   = (front.expirationDates || []).slice(1, 3);
  const extraChains = await Promise.all(extraExps.map(ts => fetchChain("SPY", ts, auth)));

  const acc = { callSum: 0, putSum: 0, byStrike: {} };
  if (front.options?.[0]) accumulate(front.options[0], spot, acc);
  for (const ch of extraChains) if (ch?.options?.[0]) accumulate(ch.options[0], spot, acc);

  // If no gamma data returned, don't cache a zero result
  if (acc.callSum === 0 && acc.putSum === 0) return null;

  const netGex    = acc.callSum - acc.putSum;
  const gexBn     = +(netGex / 1e9).toFixed(2);
  const zeroGamma = findZeroGamma(acc.byStrike, spot);
  const opEx      = nextMonthlyOpEx();
  const daysToOpEx = Math.max(0, Math.round((opEx.getTime() - now.getTime()) / 86400000));

  const payload = {
    spot: +spot.toFixed(2),
    gexBn,
    isPositive: netGex >= 0,
    callGexBn: +(acc.callSum / 1e9).toFixed(2),
    putGexBn:  +(acc.putSum  / 1e9).toFixed(2),
    zeroGamma: zeroGamma != null ? +zeroGamma.toFixed(0) : null,
    daysToOpEx,
    nextOpEx: opEx.toISOString().slice(0, 10),
  };

  await kvSet(cacheKey, payload);
  return payload;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const wantGex = req.query.gex === "1";
  const force   = req.query.force === "1";

  const [fgResult, gexResult] = await Promise.allSettled([
    (async () => {
      const r = await fetch(
        "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
        {
          headers: {
            "User-Agent": UA,
            "Referer": "https://www.cnn.com/markets/fear-and-greed",
            "Accept": "application/json",
          },
          signal: AbortSignal.timeout(6000),
        }
      );
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      return r.json();
    })(),
    wantGex
      ? calcGex(process.env.KV_REST_API_URL, process.env.KV_REST_API_TOKEN, force)
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
