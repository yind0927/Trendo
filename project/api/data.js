// Vercel serverless function — cross-device sync via Upstash Redis
// GET  /api/data?key=xxxx  → { data: { holdings, closed, ... } | null }
// POST /api/data?key=xxxx  → { ok: true }  (body = data payload)

export default async function handler(req, res) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return res.status(503).json({ error: "Storage not configured" });

  const syncKey = (req.query.key || "").trim();
  if (!syncKey || syncKey.length < 8) return res.status(400).json({ error: "Invalid key" });

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
      const r = await fetch(`${url}/pipeline`, {
        method: "POST", headers,
        body: JSON.stringify([
          ["SET", redisKey, JSON.stringify(req.body)],
          ["EXPIRE", redisKey, 31536000]   // 1 year TTL
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
