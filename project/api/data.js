// Vercel serverless function — cross-device sync via Upstash Redis
// GET  /api/data?key=xxxx          → { data: { holdings, closed, ... } | null }
// GET  /api/data?key=xxxx&snaps=1  → { snaps: [{ i, savedAt, counts }] }  每日快照目录
// GET  /api/data?key=xxxx&snap=N   → { data: <第 N 个快照> }
// POST /api/data?key=xxxx          → { ok: true, rev }  (body = data payload)
//
// **冲突判定用的是服务端维护的 `rev`（单调整数），不是墙上时钟。**
// 客户端在载荷里带 `_baseRev` = 它这份内容所基于的云端版本号：
//   · `_baseRev === 云端 rev` → 接受，`rev++`（它确实是在当前云端版本上改的）
//   · 不相等                  → 409 { stale, rev, cloudSavedAt }，**一个字都不写**
// 为什么不能用 savedAt：那是各设备自己的墙上时钟，而且**纯拉取也会刷新它**——于是一台
// 只是打开过 app、内容还是旧的平板（时钟还偏快）会显得"更新"，它的旧快照就能合法盖掉
// 另一台刚写进来的记录。实测复现：电脑新增的期权记录在平板打开后从云端消失。
// 不带 `_baseRev` 的推送（缓存里还是旧 JS 的设备）**一律不许盖掉一个已经有 rev 的
// blob**：savedAt 那套判定已经被证明挡不住「几天没开的设备一打开就顶上去」——它的时钟
// 可能偏快、它的旧代码还会在纯拉取时刷新 savedAt。宁可让那台设备这一次存不上（刷新后
// 拿到新 JS 就正常了），也不能让它把另外两台刚写进来的记录抹掉。
// 云端还没有 rev（v839 之前的老 blob）时才退回 savedAt 判，并额外加一道「记录数不许
// 变少」的闸门，使这个过渡窗口里同样不可能发生整块抹除。

// Demo key: read-only, returns hardcoded example data, writes are silently dropped.
const DEMO_KEY = "trendo-demo-2026";

const DEMO_BLOB = {
  _demo: true,
  savedAt: "2026-09-01T20:00:00.000Z",
  notional: 80000,
  simNotional: 100000,
  holdings: [
    {
      sym: "NVDA", name: "NVIDIA Corp", kind: "equity",
      cost: 98.5, qty: 120, size: 14.8,
      stop: 88.0, target: 145.0,
      entry: "2026-04-15",
      setup: "AI infrastructure cycle, data center supercycle",
      thesis: "Leading GPU supplier for AI training. Strong pricing power, expanding TAM.",
      bx: { dailyBars: "2-5", weekly: 2, monthly: 2,
            sector: { name: "XLK", color: "#6366f1", score: 4.2, slope: 0.18, slopeDir: "up" },
            overall: { score: 4.1, slope: 0.15, slopeDir: "up" },
            entryBxGrade: "A+", entryFinalGrade: "A+",
            entryRsResult: { score: 17, max: 20, vsVOO: 11.2, vsSect: 6.8, sectVsVOO: 4.1, volRatio: 68, volScore: 5 } },
    },
    {
      sym: "MSFT", name: "Microsoft Corp", kind: "equity",
      cost: 388.0, qty: 15, size: 7.3,
      stop: 360.0, target: 460.0,
      entry: "2026-06-02",
      setup: "Cloud + Copilot upsell cycle",
      thesis: "Azure share gains + AI Copilot monetization just beginning. Sticky enterprise base.",
      bx: { dailyBars: "1-4", weekly: 1, monthly: 2,
            sector: { name: "XLK", color: "#6366f1", score: 3.5, slope: 0.09, slopeDir: "up" },
            overall: { score: 3.4, slope: 0.08, slopeDir: "up" },
            entryBxGrade: "B+", entryFinalGrade: "A-",
            entryRsResult: { score: 14, max: 20, vsVOO: 5.8, vsSect: 3.2, sectVsVOO: 4.1, volRatio: 58, volScore: 4 } },
    },
    {
      sym: "META", name: "Meta Platforms", kind: "equity",
      cost: 520.0, qty: 10, size: 6.5,
      stop: 475.0, target: 640.0,
      entry: "2026-07-10",
      setup: "Ad recovery + Llama moat",
      thesis: "Ad revenue re-accelerating, Reality Labs losses stabilizing. Open-source AI strategy builds ecosystem.",
      bx: { dailyBars: "0-3", weekly: 0, monthly: 1,
            sector: { name: "XLK", color: "#6366f1", score: 2.1, slope: -0.04, slopeDir: "flat" },
            overall: { score: 2.0, slope: -0.05, slopeDir: "flat" },
            entryBxGrade: "B-", entryFinalGrade: "B-",
            entryRsResult: { score: 9, max: 20, vsVOO: 1.2, vsSect: -0.8, sectVsVOO: 4.1, volRatio: 47, volScore: 3 } },
    },
  ],
  closed: [
    {
      sym: "AMZN", name: "Amazon.com", kind: "equity",
      cost: 178.0, qty: 25, size: 5.6,
      stop: 162.0, target: 220.0,
      entry: "2026-02-10", closedAt: "2026-05-18", closePrice: 214.5,
      pnlFinal: 912.5, setup: "AWS re-acceleration",
      bx: { entryFinalGrade: "A" },
    },
    {
      sym: "AMD", name: "Advanced Micro Devices", kind: "equity",
      cost: 155.0, qty: 30, size: 5.8,
      stop: 138.0, target: 195.0,
      entry: "2026-03-01", closedAt: "2026-04-20", closePrice: 141.0,
      pnlFinal: -420.0, setup: "AI GPU challenger play",
      bx: { entryFinalGrade: "B" },
    },
  ],
  watchlist: [
    { sym: "AAPL",  name: "Apple Inc" },
    { sym: "GOOG",  name: "Alphabet Inc" },
    { sym: "TSLA",  name: "Tesla Inc" },
    { sym: "AVGO",  name: "Broadcom Inc" },
    { sym: "CRM",   name: "Salesforce Inc" },
  ],
  simHoldings: [
    {
      sym: "AAPL", name: "Apple Inc", kind: "equity",
      cost: 212.0, qty: 50, size: 10.6,
      stop: 195.0, target: 255.0,
      entry: "2026-05-20",
      setup: "iPhone 18 supercycle + India expansion",
      bx: { dailyBars: "1-4", weekly: 1, monthly: 1,
            entryBxGrade: "B", entryFinalGrade: "B",
            entryRsResult: { score: 10, max: 20, vsVOO: 3.1, vsSect: 1.4, sectVsVOO: 4.1, volRatio: 52, volScore: 3 } },
    },
    {
      sym: "GOOGL", name: "Alphabet Inc", kind: "equity",
      cost: 175.0, qty: 40, size: 7.0,
      stop: 158.0, target: 215.0,
      entry: "2026-06-15",
      setup: "Search moat + Gemini integration",
      bx: { dailyBars: "2-4", weekly: 1, monthly: 2,
            entryBxGrade: "A-", entryFinalGrade: "A-",
            entryRsResult: { score: 13, max: 20, vsVOO: 6.5, vsSect: 2.8, sectVsVOO: 4.1, volRatio: 61, volScore: 4 } },
    },
    {
      sym: "TSLA", name: "Tesla Inc", kind: "equity",
      cost: 248.0, qty: 35, size: 8.7,
      stop: 215.0, target: 320.0,
      entry: "2026-07-22",
      setup: "FSD robotaxi launch + energy storage",
      bx: { dailyBars: "-1-3", weekly: 0, monthly: 1,
            entryBxGrade: "C+", entryFinalGrade: "C+",
            entryRsResult: { score: 7, max: 20, vsVOO: -1.5, vsSect: -2.1, sectVsVOO: 4.1, volRatio: 44, volScore: 1 } },
    },
  ],
  simClosed: [
    {
      sym: "NFLX", name: "Netflix Inc", kind: "equity",
      cost: 620.0, qty: 10, size: 6.2,
      stop: 575.0, target: 740.0,
      entry: "2026-01-15", closedAt: "2026-04-02", closePrice: 695.0,
      pnlFinal: 750.0,
      bx: { entryFinalGrade: "B+" },
    },
    {
      sym: "COIN", name: "Coinbase Global", kind: "equity",
      cost: 195.0, qty: 20, size: 3.9,
      stop: 170.0, target: 250.0,
      entry: "2026-03-10", closedAt: "2026-05-05", closePrice: 182.0,
      pnlFinal: -260.0,
      bx: { entryFinalGrade: "B-" },
    },
  ],
  simPending: [],
  simClosePending: [],
  realOptions: [],
};

export default async function handler(req, res) {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return res.status(503).json({ error: "Storage not configured" });

  const syncKey = (req.query.key || "").trim();
  if (!syncKey || syncKey.length < 8) return res.status(400).json({ error: "Invalid key" });

  // Demo key: return hardcoded example data, silently ignore writes
  if (syncKey === DEMO_KEY) {
    if (req.method === "GET") return res.status(200).json({ data: DEMO_BLOB });
    if (req.method === "POST") return res.status(200).json({ ok: true });
    return res.status(405).json({ error: "Method not allowed" });
  }

  const redisKey = `trendo:${syncKey}`;
  const snapKey  = `trendo:snap:${syncKey}`;
  const headers  = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const redis    = async cmds => {
    const r = await fetch(`${url}/pipeline`, { method: "POST", headers, body: JSON.stringify(cmds) });
    return r.json();
  };
  const SNAP_KEEP = 5;           // 保留最近 5 份（按北京自然日去重，≈最近 5 个有改动的日子）
  const SNAP_TTL  = 90 * 86400;  // 90 天后整串过期
  // 留档按**北京自然日**去重（用户在北京时区看这份列表；按 UTC 去重会把北京的晚上
  // 切成第二天，同一个晚上的两次写入各留一份、而白天的改动反而被合并掉）。
  const bjDay = ts => {
    const t = ts ? new Date(ts) : null;
    return t && !isNaN(t) ? t.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }) : "";
  };

  if (req.method === "GET") {
    try {
      // 快照目录：只回元信息（时间戳 + 各数组条数），避免把 5 份完整 blob 一次吐出来。
      if (req.query.snaps) {
        const [{ result }] = await redis([["LRANGE", snapKey, 0, SNAP_KEEP - 1]]);
        const snaps = (result || []).map((s, i) => {
          try {
            const d = JSON.parse(s);
            const n = a => (Array.isArray(d[a]) ? d[a].length : 0);
            // savedAt = 这份内容自己最后被改动的时刻；snapAt = 它被覆盖、因此留档的时刻。
            return { i, savedAt: d.savedAt || null, snapAt: d._snapAt || null, counts: {
              holdings: n("holdings"), closed: n("closed"), simHoldings: n("simHoldings"),
              simClosed: n("simClosed"), watchlist: n("watchlist"), realOptions: n("realOptions") } };
          } catch (_) { return { i, savedAt: null, counts: null }; }
        });
        return res.status(200).json({ snaps });
      }
      if (req.query.snap != null) {
        const idx = parseInt(req.query.snap, 10);
        if (!(idx >= 0 && idx < SNAP_KEEP)) return res.status(400).json({ error: "Bad snapshot index" });
        const [{ result }] = await redis([["LINDEX", snapKey, idx]]);
        return res.status(200).json({ data: result ? JSON.parse(result) : null });
      }
      const [{ result }] = await redis([["GET", redisKey]]);
      return res.status(200).json({ data: result ? JSON.parse(result) : null });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === "POST") {
    try {
      // Registry for the background order worker (api/order-check.js): keep this
      // sync key in `trendo:order_keys` iff the pushed blob has pending sim orders,
      // so the every-minute cron only scans accounts that actually need checking.
      const body = req.body || {};
      const hasPending =
        (Array.isArray(body.simPending)      && body.simPending.length      > 0) ||
        (Array.isArray(body.simClosePending) && body.simClosePending.length > 0);

      // 先读现有快照：①比它更旧的推送一律拒收（整块覆盖 = 不可逆的数据丢失，宁可让这
      // 台设备先把云端拉下来）；②跨天的第一次写入前，把旧快照留一份进历史，供用户回滚。
      const [{ result: prevRaw }] = await redis([["GET", redisKey]]);
      let prev = null;
      try { prev = prevRaw ? JSON.parse(prevRaw) : null; } catch (_) {}
      const storedRev = Number.isFinite(prev?.rev) ? prev.rev : 0;
      const baseRev   = body?._baseRev;
      if (baseRev != null) {
        // 乐观并发：只接受「基于当前云端版本」的写入，与各设备的时钟完全无关。
        if (Number(baseRev) !== storedRev) {
          return res.status(409).json({ stale: true, rev: storedRev, cloudSavedAt: prev?.savedAt || null });
        }
      } else if (storedRev > 0) {
        // 云端已经由新版客户端写过（有 rev），而这次推送不带 `_baseRev` = 发起方还在跑
        // 缓存里的旧 JS。**直接拒收**：它没法证明自己是基于当前云端版本改的，而这正是
        // 「A/B 已更新，C 几天没开、一打开就把两边顶掉」的唯一剩余路径。
        return res.status(409).json({
          stale: true, needsRefresh: true, rev: storedRev, cloudSavedAt: prev?.savedAt || null });
      } else {
        // 云端还没有 rev（v839 之前的老 blob）：退回 savedAt 判，并加一道记录数闸门——
        // 任何会让某个集合**变少**的 rev-less 推送都拒收，整块抹除在这个过渡窗口里同样
        // 不可能发生（真要删记录，刷新一次拿到新 JS 就能正常删）。
        const prevAt = prev?.savedAt ? new Date(prev.savedAt).getTime() : 0;
        const bodyAt = body?.savedAt ? new Date(body.savedAt).getTime() : 0;
        if (prevAt && bodyAt && bodyAt < prevAt) {
          return res.status(409).json({ stale: true, rev: storedRev, cloudSavedAt: prev.savedAt });
        }
        if (prev) {
          const KEYED = ["holdings", "closed", "simHoldings", "simClosed",
                         "watchlist", "realOptions", "modelPicks"];
          const shrunk = KEYED.find(k =>
            Array.isArray(prev[k]) && Array.isArray(body[k]) && body[k].length < prev[k].length);
          if (shrunk) {
            return res.status(409).json({
              stale: true, needsRefresh: true, shrink: shrunk,
              rev: storedRev, cloudSavedAt: prev.savedAt || null });
          }
        }
      }
      // `_baseRev` 只是请求参数，不入库；入库的是服务端自己递增的 `rev`。
      const toStore = { ...body };
      delete toStore._baseRev;
      toStore.rev = storedRev + 1;

      const cmds = [];
      // 留档的是**被覆盖的那一份**（更新前的内容），不是这次写进去的新内容——它存在的
      // 意义就是「万一这次写入是错的，能回到上一版」。跨北京自然日的第一次写入才留。
      if (prevRaw && bjDay(prev?.savedAt) !== bjDay(toStore?.savedAt)) {
        // 快照里剥掉 analysisHistory 的 _fullData（整份分析正文，占 blob 绝大部分体积，
        // 且服务端另有 30 天缓存可重建），只留回滚真正需要的持仓/交易记录。
        const lean = { ...prev, _snapAt: new Date().toISOString() };
        if (Array.isArray(lean.analysisHistory))
          lean.analysisHistory = lean.analysisHistory.map(e => { const c = { ...e }; delete c._fullData; return c; });
        cmds.push(["LPUSH", snapKey, JSON.stringify(lean)],
                  ["LTRIM", snapKey, 0, SNAP_KEEP - 1],
                  ["EXPIRE", snapKey, SNAP_TTL]);
      }
      cmds.push(["SET", redisKey, JSON.stringify(toStore)],
                ["EXPIRE", redisKey, 31536000],   // 1 year TTL
                [hasPending ? "SADD" : "SREM", "trendo:order_keys", syncKey]);
      const results = await redis(cmds);
      const ok = results[results.length - 3]?.result === "OK";
      return res.status(ok ? 200 : 500).json({ ok, rev: toStore.rev });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
