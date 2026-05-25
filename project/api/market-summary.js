// GET /api/market-summary?force=1
// Fetches general market news from Finnhub, summarises with Claude Haiku.
// Result cached in Upstash Redis for 1 hour (per calendar day key).
// force=1 bypasses the cache and regenerates.

export default async function handler(req, res) {
  const finnhubKey  = process.env.FINNHUB_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const kvUrl       = process.env.KV_REST_API_URL;
  const kvToken     = process.env.KV_REST_API_TOKEN;

  if (!anthropicKey) {
    return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const today    = new Date().toISOString().slice(0, 10);
  const cacheKey = `trendo:market_brief:${today}`;
  const force    = req.query.force === "1";
  const kvHeaders = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };

  // ── 1. Check Redis cache ──────────────────────────────────────────────────
  if (!force && kvUrl && kvToken) {
    try {
      const r = await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvHeaders,
        body: JSON.stringify([["GET", cacheKey]])
      });
      const [{ result }] = await r.json();
      if (result) {
        res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
        return res.json({ ...JSON.parse(result), cached: true });
      }
    } catch (_) { /* ignore cache errors, proceed to generate */ }
  }

  // ── 2. Fetch Finnhub general market news ─────────────────────────────────
  let headlines = [];
  if (finnhubKey) {
    try {
      const newsRes = await fetch(
        `https://finnhub.io/api/v1/news?category=general&minId=0&token=${finnhubKey}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (newsRes.ok) {
        const articles = await newsRes.json();
        headlines = articles
          .filter(a => a.headline)
          .slice(0, 15)
          .map(a => ({
            title:   a.headline,
            summary: (a.summary || a.headline).slice(0, 250),
          }))
          .filter(a => a.summary.length > 10)
          .slice(0, 10);
      }
    } catch (_) { /* fall through with empty headlines */ }
  }

  if (!headlines.length) {
    return res.status(502).json({ error: "No news available from Finnhub" });
  }

  // ── 3. Build Claude prompt ────────────────────────────────────────────────
  const newsText = headlines
    .map((h, i) => `${i + 1}. ${h.title}\n${h.summary}`)
    .join("\n\n");

  const prompt =
    `你是一位专业的美股波段交易员助手。请分析以下今日市场新闻，` +
    `用2-3句简洁的中文总结对交易者最重要的信息，重点关注：` +
    `①市场整体情绪与方向，②主要风险因素，③值得关注的板块机会。` +
    `语言直接专业，不要加任何前缀或标题，直接输出总结。\n\n` +
    `新闻内容：\n${newsText}`;

  // ── 4. Call Claude Haiku ──────────────────────────────────────────────────
  let summary = "";
  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 350,
        messages:   [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!aiRes.ok) {
      const err = await aiRes.text();
      return res.status(502).json({ error: `Claude API error: ${err.slice(0, 120)}` });
    }
    const aiData = await aiRes.json();
    summary = aiData.content?.[0]?.text?.trim() || "";
  } catch (e) {
    return res.status(500).json({ error: `AI request failed: ${e.message}` });
  }

  if (!summary) return res.status(500).json({ error: "Empty AI response" });

  // ── 5. Build result and cache ─────────────────────────────────────────────
  const result = {
    summary,
    headlines: headlines.slice(0, 3).map(h => h.title),
    updatedAt: new Date().toISOString(),
  };

  if (kvUrl && kvToken) {
    try {
      await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvHeaders,
        body: JSON.stringify([
          ["SET",    cacheKey, JSON.stringify(result)],
          ["EXPIRE", cacheKey, 3600],   // 1 hour
        ])
      });
    } catch (_) { /* non-fatal */ }
  }

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  res.json({ ...result, cached: false });
}
// force-redeploy Mon May 25 05:06:34 UTC 2026
