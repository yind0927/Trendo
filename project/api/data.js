// Vercel serverless function — cross-device sync via Upstash Redis
// GET  /api/data?key=xxxx  → { data: { holdings, closed, ... } | null }
// POST /api/data?key=xxxx  → { ok: true }  (body = data payload)

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
  simOptions: [],
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
  const headers  = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  if (req.method === "GET") {
    try {
      const r = await fetch(`${url}/pipeline`, {
        method: "POST", headers,
        body: JSON.stringify([["GET", redisKey]])
      });
      const [{ result }] = await r.json();
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
      const r = await fetch(`${url}/pipeline`, {
        method: "POST", headers,
        body: JSON.stringify([
          ["SET", redisKey, JSON.stringify(body)],
          ["EXPIRE", redisKey, 31536000],   // 1 year TTL
          [hasPending ? "SADD" : "SREM", "trendo:order_keys", syncKey]
        ])
      });
      const results = await r.json();
      const ok = results[0]?.result === "OK";
      return res.status(ok ? 200 : 500).json({ ok });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
