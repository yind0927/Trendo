// Vercel serverless function — background execution of sim pending orders.
// Triggered every minute during US market hours by Vercel Cron (see vercel.json),
// or by any external pinger (cron-job.org etc.) hitting GET /api/order-check.
//
// Why: the client only checks pending orders while the page is open. This worker
// reads each user's cloud-sync blob from Redis, executes any sim pending orders
// whose conditions are met (mirroring the client logic in fetchPrices exactly),
// and writes the updated blob back with a fresh savedAt — so the next page load /
// visibility-change pull picks up the fills automatically.
//
// Registry: api/data.js maintains the Redis set `trendo:order_keys` — a sync key
// is a member iff its last pushed blob contains pending orders. This worker scans
// only those keys and prunes ones whose queues have emptied.
//
// Conflict model: last-write-wins, plain blob overwrite (no compare-and-swap) — same
// as device↔device sync. If the page is open and active it fills the order itself
// within 30s and its push wins; whichever write lands last in Redis is final. The
// client's syncOnStartup() "local is newer" merge path used to be able to resurrect
// a position this cron (or another device) had just closed — by re-adding it from a
// stale cloud snapshot read before the close landed — causing the client to auto-close
// it a second time and record a duplicate. Fixed by excluding cloud simHoldings/
// simClosePending entries that match an already-closed local SIM_CLOSED record.

export default async function handler(req, res) {
  const url    = process.env.KV_REST_API_URL;
  const token  = process.env.KV_REST_API_TOKEN;
  const fhKey  = process.env.FINNHUB_API_KEY;
  const pgKey  = process.env.POLYGON_API_KEY;
  if (!url || !token) return res.status(503).json({ error: "Storage not configured" });

  const redis = async cmds => {
    const r = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmds),
    });
    return r.json();
  };

  // Same gate as the client's isUSMarketOpen(): Mon–Fri, UTC 13:30–21:00
  const now  = new Date();
  const day  = now.getUTCDay();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const marketOpen = day >= 1 && day <= 5 && mins >= 13 * 60 + 30 && mins < 21 * 60;
  if (!marketOpen) return res.status(200).json({ ok: true, skipped: "market closed" });

  const [{ result: keys }] = await redis([["SMEMBERS", "trendo:order_keys"]]);
  if (!keys || !keys.length) return res.status(200).json({ ok: true, checked: 0 });

  const summary = [];
  for (const syncKey of keys.slice(0, 10)) {
    try {
      const filled = await processKey(syncKey, redis, fhKey, pgKey);
      summary.push({ key: syncKey.slice(0, 4) + "…", filled });
    } catch (e) {
      summary.push({ key: syncKey.slice(0, 4) + "…", error: e.message });
    }
  }
  res.status(200).json({ ok: true, results: summary });
}

async function processKey(syncKey, redis, fhKey, pgKey) {
  const redisKey = `trendo:${syncKey}`;
  const [{ result: raw }] = await redis([["GET", redisKey]]);
  if (!raw) { await redis([["SREM", "trendo:order_keys", syncKey]]); return 0; }

  const data = JSON.parse(raw);
  const pendingOpen  = Array.isArray(data.simPending)      ? data.simPending      : [];
  const pendingClose = Array.isArray(data.simClosePending) ? data.simClosePending : [];
  if (!pendingOpen.length && !pendingClose.length) {
    await redis([["SREM", "trendo:order_keys", syncKey]]);
    return 0;
  }

  const simHoldings = Array.isArray(data.simHoldings) ? data.simHoldings : [];
  const simClosed   = Array.isArray(data.simClosed)   ? data.simClosed   : [];
  const simNotional = data.simNotional > 0 ? data.simNotional : 100000;

  // Real-time last price per pending symbol (Finnhub for stocks, Polygon for crypto)
  const orders = [...pendingOpen, ...pendingClose];
  const prices = await fetchLastPrices(orders, fhKey, pgKey);

  const todayStr = new Date().toISOString().slice(0, 10);
  let fills = 0;

  // ── Open orders (mirror of client fetchPrices) ────────────────────
  for (const order of [...pendingOpen]) {
    const last = prices[order.sym];
    if (!(last > 0)) continue;
    const shouldExecute = order.orderType === "market" ||
      (order.orderType === "limit" && last <= order.limitPrice);
    if (!shouldExecute) continue;
    if (simHoldings.find(h => h.sym === order.sym)) continue; // already open

    const entryDate = new Date(order.entryDate + "T00:00:00");
    const today0    = new Date(); today0.setUTCHours(0, 0, 0, 0);
    const daysHeld  = Math.max(1, Math.round((today0 - entryDate) / 86400000) + 1);

    const actualStop = order.stopMode === "pct" && order.stopPct > 0
      ? last * (1 - order.stopPct / 100)
      : (order.stop || 0);
    simHoldings.push({
      sym: order.sym, name: order.name || order.sym, kind: order.kind,
      qty: order.qty, cost: last, last, prevClose: null,
      stop: actualStop, target: order.target,
      entry: order.entryDate,
      size: simNotional > 0 ? (order.qty * last / simNotional) * 100 : 2.5,
      earnings: order.earnings, holdEarn: false,
      setup: order.orderType === "market" ? "市价单" : `限价单 @${order.limitPrice}`,
      thesis: "",
      status: "ok", pnlPct: 0, pnlDollar: 0,
      risk1R: actualStop ? last - actualStop : 0,
      rMult: 0, days: daysHeld, spark: [last],
      bx: order.bx,
    });
    pendingOpen.splice(pendingOpen.indexOf(order), 1);
    fills++;
  }

  // ── Close orders (mirror of client closePosition) ─────────────────
  for (const order of [...pendingClose]) {
    const last = prices[order.sym];
    if (!(last > 0)) continue;
    const shouldClose = order.orderType === "market" ||
      (order.orderType === "limit" && last >= order.limitPrice);
    if (!shouldClose) continue;
    const pos = simHoldings.find(h => h.sym === order.sym);
    if (!pos) { pendingClose.splice(pendingClose.indexOf(order), 1); continue; }

    const qty = (order.qty > 0 && order.qty < pos.qty) ? order.qty : pos.qty;
    const ccNet = (pos.cc || []).reduce((s, c) => s + (c.total || 0), 0);

    if (qty < pos.qty) {
      // Partial close — CC premium stays on the remaining open position
      simClosed.push({ ...pos, qty, closedAt: todayStr, closePrice: last,
        cc: undefined,
        days: calcTradingDays(pos.entry, todayStr),
        pnlDollar: Math.round((last - pos.cost) * qty),
        pnlPct: pos.cost > 0 ? (last - pos.cost) / pos.cost : 0,
        pnlFinal: Math.round((last - pos.cost) * qty),
        rMult: pos.risk1R > 0 ? (last - pos.cost) / pos.risk1R : 0,
        exitReason: "partial" });
      pos.qty -= qty;
      pos.size = simNotional > 0 ? (pos.qty * pos.cost / simNotional) * 100 : pos.size;
      pos.pnlDollar = Math.round(((pos.last || last) - pos.cost) * pos.qty + ccNet);
    } else {
      // Full close — accumulated CC premium settles into the final P&L
      pos.closedAt = todayStr;
      pos.closePrice = last;
      pos.days = calcTradingDays(pos.entry, todayStr);
      pos.pnlDollar = Math.round((last - pos.cost) * pos.qty + ccNet);
      pos.pnlPct = (pos.cost > 0 && pos.qty > 0) ? pos.pnlDollar / (pos.cost * pos.qty) : 0;
      pos.rMult = pos.risk1R > 0 ? (last - pos.cost) / pos.risk1R : 0;
      pos.pnlFinal = pos.pnlDollar;
      pos.exitReason = "manual";
      simHoldings.splice(simHoldings.indexOf(pos), 1);
      simClosed.push(pos);
    }
    pendingClose.splice(pendingClose.indexOf(order), 1);
    fills++;
  }

  if (!fills) return 0;

  data.simHoldings      = simHoldings;
  data.simClosed        = simClosed;
  data.simPending       = pendingOpen;
  data.simClosePending  = pendingClose;
  data.savedAt          = new Date().toISOString();

  const cmds = [
    ["SET", redisKey, JSON.stringify(data)],
    ["EXPIRE", redisKey, 31536000],
  ];
  if (!pendingOpen.length && !pendingClose.length)
    cmds.push(["SREM", "trendo:order_keys", syncKey]);
  await redis(cmds);
  return fills;
}

// ── Price fetch: Finnhub last for stocks, Polygon snapshot for crypto ──
async function fetchLastPrices(orders, fhKey, pgKey) {
  const prices = {};
  const stockSyms  = [...new Set(orders.filter(o => (o.kind || "equity") !== "crypto").map(o => o.sym))];
  const cryptoSyms = [...new Set(orders.filter(o => (o.kind || "equity") === "crypto").map(o => o.sym))];

  await Promise.all([
    ...stockSyms.slice(0, 30).map(async sym => {
      // Finnhub real-time, Yahoo fallback
      if (fhKey) {
        try {
          const r = await fetch(
            `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${fhKey}`,
            { signal: AbortSignal.timeout(3500) });
          const d = await r.json();
          if (d.c > 0) { prices[sym] = d.c; return; }
        } catch (_) {}
      }
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
          { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(3500) });
        const d = await r.json();
        const p = d.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (p > 0) prices[sym] = p;
      } catch (_) {}
    }),
    (async () => {
      if (!cryptoSyms.length || !pgKey) return;
      try {
        const tickers = cryptoSyms.map(s => `X:${s}USD`).join(",");
        const r = await fetch(
          `https://api.polygon.io/v2/snapshot/locale/global/markets/crypto/tickers?tickers=${tickers}&apiKey=${pgKey}`,
          { signal: AbortSignal.timeout(5000) });
        const d = await r.json();
        (d.tickers || []).forEach(t => {
          const sym = t.ticker.replace(/^X:/, "").replace(/USD$/, "");
          const p = t.min?.c ?? t.day?.c ?? t.lastTrade?.p;
          if (p > 0) prices[sym] = p;
        });
      } catch (_) {}
    })(),
  ]);
  return prices;
}

// ── US trading-day calculator (port of desk.js calcTradingDays) ────────
function usMarketHolidays(y) {
  const f = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const obs = (m, day) => {
    const d = new Date(y, m-1, day);
    if (d.getDay()===6) d.setDate(day-1); else if (d.getDay()===0) d.setDate(day+1);
    return f(d);
  };
  const nth = (m, dow, n) => {
    const d = new Date(y, m-1, 1); let c = 0;
    while (c < n) { if (d.getDay()===dow) c++; if (c < n) d.setDate(d.getDate()+1); }
    return f(d);
  };
  const lastMon = m => {
    const d = new Date(y, m, 0);
    while (d.getDay()!==1) d.setDate(d.getDate()-1);
    return f(d);
  };
  const goodFriday = () => {
    const a=y%19,b=Math.floor(y/100),c=y%100,d2=Math.floor(b/4),e=b%4,
          g=Math.floor((b-Math.floor((b+8)/25)+1)/3),
          h2=(19*a+b-d2-g+15)%30,i=Math.floor(c/4),k=c%4,
          l=(32+2*e+2*i-h2-k)%7,m2=Math.floor((a+11*h2+22*l)/451),
          mo=Math.floor((h2+l-7*m2+114)/31),dy=(h2+l-7*m2+114)%31+1;
    const d = new Date(y, mo-1, dy-2);
    return f(d);
  };
  return [
    obs(1,1), nth(1,1,3), nth(2,1,3), goodFriday(),
    lastMon(5), ...(y>=2022?[obs(6,19)]:[]),
    obs(7,4), nth(9,1,1), nth(11,4,4), obs(12,25)
  ];
}

function calcTradingDays(entryStr, endStr) {
  if (!entryStr) return 0;
  const f = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const start = new Date(entryStr + 'T00:00:00');
  start.setDate(start.getDate() + 1);
  const end = new Date(endStr + 'T00:00:00');
  if (start > end) return 0;
  const hols = new Set();
  for (let yr = start.getFullYear(); yr <= end.getFullYear(); yr++)
    usMarketHolidays(yr).forEach(h => hols.add(h));
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !hols.has(f(d))) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}
