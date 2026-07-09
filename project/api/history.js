// Vercel serverless function — historical daily closes + options chain
// History: ?symbols=AAPL,BTC-USD&from=2024-01-01
// Options: ?opts=1&sym=QQQ[&expiry=<unix_ts>]
//   Source: CBOE free delayed-quote CDN — the only free options source reachable
//   from Vercel egress IPs (Yahoo crumb → 429/500, Nasdaq/Polygon → 403; same
//   conclusion as the GEX module in api/feargreed.js). One fetch returns ALL
//   expirations; we prune to ≤120 DTE and strikes within ±25% of spot, cache the
//   pruned chain per symbol in Redis (5 min), and filter to the requested expiry.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// OCC symbol: ROOT + YYMMDD + [C|P] + strike×1000 (8 digits), e.g. QQQ260918C00480000
function parseOccOpt(sym) {
  const m = /^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym || "");
  if (!m) return null;
  const [, , yy, mm, dd, cp, strike8] = m;
  return { exp: `20${yy}-${mm}-${dd}`, type: cp === "C" ? "call" : "put", strike: parseInt(strike8, 10) / 1000 };
}

// Fetch + prune the full CBOE chain for one underlying.
async function fetchCboeOptions(sym) {
  const urls = [
    `https://cdn.cboe.com/api/global/delayed_quotes/options/${sym}.json`,
    `https://www.cboe.com/api/global/delayed_quotes/options/${sym}.json`,
  ];
  let lastErr = "unreachable";
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" }, signal: AbortSignal.timeout(9000) });
      if (!r.ok) { lastErr = `cboe_${r.status}`; continue; }
      const d = await r.json();
      const spot = d?.data?.current_price ?? d?.data?.close ?? d?.data?.prev_day_close ?? 0;
      const raw  = d?.data?.options;
      if (!(spot > 0) || !Array.isArray(raw) || !raw.length) { lastErr = "empty_chain"; continue; }

      const todayMs = Date.now();
      const lo = spot * 0.75, hi = spot * 1.25;
      const byExp = {}; // { "YYYY-MM-DD": { calls: [], puts: [] } }

      for (const o of raw) {
        const p = parseOccOpt(o.option);
        if (!p || p.strike < lo || p.strike > hi) continue;
        const expMs = new Date(p.exp + "T21:00:00Z").getTime();
        const dte = (expMs - todayMs) / 86400000;
        if (dte < -0.5 || dte > 120) continue;

        const row = {
          strike: p.strike,
          expiry: Math.floor(expMs / 1000),
          bid:    o.bid ?? 0,
          ask:    o.ask ?? 0,
          last:   o.last_trade_price ?? 0,
          iv:     o.iv ?? 0,
          volume: o.volume ?? 0,
          oi:     o.open_interest ?? 0,
          delta:  o.delta ?? null,
          theta:  o.theta ?? null,
          itm:    p.type === "call" ? p.strike < spot : p.strike > spot,
        };
        (byExp[p.exp] ||= { calls: [], puts: [] })[p.type === "call" ? "calls" : "puts"].push(row);
      }

      const exps = Object.keys(byExp).sort();
      if (!exps.length) { lastErr = "no_contracts_in_range"; continue; }
      for (const e of exps) {
        byExp[e].calls.sort((a, b) => a.strike - b.strike);
        byExp[e].puts.sort((a, b) => a.strike - b.strike);
      }
      return { spot, byExp, exps };
    } catch (e) { lastErr = e.message; }
  }
  throw new Error(lastErr);
}

export default async function handler(req, res) {
  // ── Options chain mode (?opts=1) ─────────────────────────────────────────
  if (req.query.opts === "1") {
    const sym      = (req.query.sym || "").toUpperCase();
    const expiryTs = parseInt(req.query.expiry || "0", 10) || 0;
    if (!sym) return res.status(400).json({ error: "sym required" });

    const kvUrl   = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const kvHdr   = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };
    const cacheKey = `trendo:opts3:${sym}`; // whole pruned chain per symbol

    let chain = null;
    if (kvUrl && kvToken) {
      try {
        const r = await fetch(`${kvUrl}/pipeline`, {
          method: "POST", headers: kvHdr,
          body: JSON.stringify([["GET", cacheKey]]),
        });
        const [{ result }] = await r.json();
        if (result) chain = JSON.parse(result);
      } catch (_) {}
    }

    try {
      if (!chain) {
        chain = await fetchCboeOptions(sym);
        if (kvUrl && kvToken) {
          fetch(`${kvUrl}/pipeline`, {
            method: "POST", headers: kvHdr,
            body: JSON.stringify([["SET", cacheKey, JSON.stringify(chain)], ["EXPIRE", cacheKey, 300]]),
          }).catch(() => {});
        }
      }

      // Pick requested expiry (match by date), else nearest upcoming
      const wantDate = expiryTs ? new Date(expiryTs * 1000).toISOString().slice(0, 10) : null;
      const expKey = (wantDate && chain.byExp[wantDate]) ? wantDate : chain.exps[0];
      const sel = chain.byExp[expKey];

      return res.json({
        sym,
        spot: chain.spot,
        expirations: chain.exps.map(e => Math.floor(new Date(e + "T21:00:00Z").getTime() / 1000)),
        calls: sel.calls,
        puts:  sel.puts,
        selectedExp: Math.floor(new Date(expKey + "T21:00:00Z").getTime() / 1000),
      });
    } catch (err) {
      return res.status(502).json({ error: `期权数据源不可用 (${err.message})` });
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
          // Keep the exact original short UA — Yahoo's edge throttles fuller
          // Chrome UAs from datacenter IPs (VOO/VIX went missing on v253's UA change)
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
