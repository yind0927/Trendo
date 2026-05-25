// GET /api/market-summary?force=1
// Fetches general market news from Finnhub (primary) or Yahoo Finance RSS (fallback).
// Summarises with Claude Haiku. Cached in Upstash Redis for 1 hour.

// ── Helper: parse RSS XML items ───────────────────────────────────────────────
function parseRssItems(xml, limit = 10) {
  const items = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
  for (const block of itemBlocks) {
    const extract = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`));
      return m ? m[1].trim() : "";
    };
    const title = extract("title");
    const desc  = extract("description") || title;
    if (title && title.length > 5) {
      items.push({ title, summary: desc.replace(/<[^>]+>/g, "").slice(0, 250) });
    }
    if (items.length >= limit) break;
  }
  return items;
}

// ── Helper: fetch Yahoo Finance RSS (no key needed) ───────────────────────────
async function fetchYahooNews() {
  const feeds = [
    "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EDJI,%5EIXIC&region=US&lang=en-US",
    "https://finance.yahoo.com/news/rssindex",
  ];
  for (const url of feeds) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) continue;
      const xml = await r.text();
      const items = parseRssItems(xml, 10);
      if (items.length >= 3) return items;
    } catch (_) { /* try next */ }
  }
  return [];
}

export default async function handler(req, res) {
  const finnhubKey   = process.env.FINNHUB_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const kvUrl        = process.env.KV_REST_API_URL;
  const kvToken      = process.env.KV_REST_API_TOKEN;

  if (!anthropicKey) {
    return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const today     = new Date().toISOString().slice(0, 10);
  const cacheKey  = `trendo:market_brief:${today}`; // one per calendar day
  const force     = req.query.force === "1";
  const kvHeaders = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };

  // ── 1. Check Redis cache ──────────────────────────────────────────────────
  if (!force && kvUrl && kvToken) {
    try {
      const r = await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvHeaders,
        body: JSON.stringify([["GET", cacheKey]]),
      });
      const [{ result }] = await r.json();
      if (result) {
        res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
        return res.json({ ...JSON.parse(result), cached: true });
      }
    } catch (_) { /* ignore, proceed */ }
  }

  // ── 2. Fetch news: Finnhub → Yahoo Finance RSS fallback ───────────────────
  let headlines = [];
  let source = "none";

  // 2a. Try Finnhub first (if key available)
  if (finnhubKey) {
    try {
      const r = await fetch(
        `https://finnhub.io/api/v1/news?category=general&minId=0&token=${finnhubKey}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const articles = await r.json();
        headlines = articles
          .filter(a => a.headline)
          .slice(0, 15)
          .map(a => ({ title: a.headline, summary: (a.summary || a.headline).slice(0, 250) }))
          .filter(a => a.summary.length > 10)
          .slice(0, 10);
        if (headlines.length) source = "finnhub";
      }
    } catch (_) { /* fall through */ }
  }

  // 2b. Fallback to Yahoo Finance RSS
  if (!headlines.length) {
    try {
      headlines = await fetchYahooNews();
      if (headlines.length) source = "yahoo";
    } catch (_) { /* fall through */ }
  }

  if (!headlines.length) {
    return res.status(502).json({ error: "No news available (Finnhub + Yahoo both failed)" });
  }

  // ── 3. Build Claude prompt ────────────────────────────────────────────────
  const vix    = req.query.vix    ? parseFloat(req.query.vix)   : null;
  const fg     = req.query.fg     ? parseInt(req.query.fg)      : null;
  const rsi    = req.query.rsi    ? parseFloat(req.query.rsi)   : null;
  const regime = req.query.regime || null;

  const mktBlock = (vix != null || fg != null || rsi != null) ? `
实时市场数据：
- VIX（波动率指数）: ${vix ?? "N/A"}${vix != null ? (vix >= 30 ? "（高波动，市场恐慌）" : vix >= 20 ? "（中等波动）" : "（低波动，市场平稳）") : ""}
- 恐惧贪婪指数 (Fear & Greed): ${fg ?? "N/A"}${fg != null ? (fg <= 25 ? "（极度恐惧）" : fg <= 45 ? "（恐惧）" : fg <= 55 ? "（中性）" : fg <= 75 ? "（贪婪）" : "（极度贪婪）") : ""}
- VOO RSI (14): ${rsi ?? "N/A"}${rsi != null ? (rsi >= 70 ? "（超买）" : rsi <= 30 ? "（超卖）" : "（正常区间）") : ""}
- 当前市场状态: ${regime ?? "N/A"}

` : "";

  const newsText = headlines
    .map((h, i) => `${i + 1}. ${h.title}\n${h.summary}`)
    .join("\n\n");

  const prompt =
    `你是一位专业的美股波段交易员助手。请综合分析以下实时市场数据和今日新闻，` +
    `用2-3句简洁的中文给出对交易者最有价值的判断，重点关注：` +
    `①结合数据和新闻的市场整体情绪与方向，②主要风险因素，③值得关注的板块机会。` +
    `语言直接专业，融合数字与事件，不要加任何前缀或标题，直接输出总结。\n\n` +
    `${mktBlock}新闻内容：\n${newsText}`;

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
      return res.status(502).json({ error: `Claude API error: ${err.slice(0, 200)}` });
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
    source,
    updatedAt: new Date().toISOString(),
  };

  if (kvUrl && kvToken) {
    try {
      await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvHeaders,
        body: JSON.stringify([
          ["SET",    cacheKey, JSON.stringify(result)],
          ["EXPIRE", cacheKey, 3600],
        ]),
      });
    } catch (_) { /* non-fatal */ }
  }

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  res.json({ ...result, cached: false });
}
