// GET /api/market-summary
// Fetches market news, enriches with real market data, summarises with Claude Sonnet.
// Cached in Upstash Redis per 2-hour slot.

// ── Helper: parse RSS XML items ───────────────────────────────────────────────
function parseRssItems(xml, limit = 12) {
  const items = [];
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
  for (const block of itemBlocks) {
    const extract = tag => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`));
      return m ? m[1].trim() : "";
    };
    const title = extract("title");
    const desc  = extract("description") || title;
    if (title && title.length > 5)
      items.push({ title, summary: desc.replace(/<[^>]+>/g, "").slice(0, 300) });
    if (items.length >= limit) break;
  }
  return items;
}

// ── Helper: Yahoo Finance RSS fallback ────────────────────────────────────────
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
      const items = parseRssItems(await r.text(), 12);
      if (items.length >= 3) return items;
    } catch (_) {}
  }
  return [];
}

// ── Helper: build market data context block ───────────────────────────────────
function buildMarketBlock(q) {
  const lines = [];

  // Indices
  if (q.idx) {
    const pairs = q.idx.split(",").map(s => {
      const [sym, val] = s.split(":");
      const v = parseFloat(val);
      return isNaN(v) ? null : `${sym} ${v >= 0 ? "+" : ""}${v}%`;
    }).filter(Boolean);
    if (pairs.length) lines.push(`大盘指数：${pairs.join(" | ")}`);
  }

  // VIX
  if (q.vix != null) {
    const v = parseFloat(q.vix);
    const label = v > 30 ? "（高波动/恐慌）" : v >= 20 ? "（中等波动）" : "（低波动/平稳）";
    const trend = q.vixTrend === "up" ? " ↑上升趋势" : q.vixTrend === "down" ? " ↓下降趋势" : "";
    lines.push(`VIX：${v}${label}${trend}`);
  }

  // Fear & Greed
  if (q.fg != null) {
    const f = parseInt(q.fg);
    const label = f <= 25 ? "极度恐惧" : f <= 45 ? "恐惧" : f <= 55 ? "中性" : f <= 75 ? "贪婪" : "极度贪婪";
    lines.push(`恐惧贪婪指数：${f}（${label}）`);
  }

  // RSI
  if (q.rsi != null) {
    const r = parseFloat(q.rsi);
    const label = r >= 70 ? "超买区" : r <= 30 ? "超卖区" : "正常区间";
    lines.push(`VOO RSI(14)：${r}（${label}）`);
  }

  // Regime
  if (q.regime) lines.push(`当前市场状态：${q.regime}`);

  // Sectors
  if (q.sect) {
    const sectors = q.sect.split(",").map(s => {
      const [symName, score, daily] = s.split(":");
      const [sym, zh] = symName.split("|");
      const sc = parseFloat(score);
      const dc = daily !== "" && daily != null ? parseFloat(daily) : null;
      return { sym, zh: zh || sym, score: sc, daily: dc };
    }).filter(s => !isNaN(s.score));

    if (sectors.length) {
      const sorted = [...sectors].sort((a, b) => b.score - a.score);
      const top = sorted.slice(0, 3).map(s =>
        `${s.zh}(${s.sym})${s.daily != null ? (s.daily >= 0 ? " +" : " ") + s.daily + "%" : ""}`
      ).join("、");
      const bot = sorted.slice(-3).reverse().map(s =>
        `${s.zh}(${s.sym})${s.daily != null ? (s.daily >= 0 ? " +" : " ") + s.daily + "%" : ""}`
      ).join("、");
      lines.push(`板块领涨：${top}`);
      lines.push(`板块领跌：${bot}`);
    }
  }

  return lines.length ? lines.join("\n") : "";
}

export default async function handler(req, res) {
  const finnhubKey   = process.env.FINNHUB_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const kvUrl        = process.env.KV_REST_API_URL;
  const kvToken      = process.env.KV_REST_API_TOKEN;

  if (!anthropicKey)
    return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });

  const now      = new Date();
  const today    = now.toISOString().slice(0, 10);
  const slot     = Math.floor(now.getUTCHours() / 2);
  const cacheKey = `trendo:market_brief:${today}:${slot}`;
  const force    = req.query.force === "1";
  const kvHeaders = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };

  // ── 1. Redis cache ────────────────────────────────────────────────────────
  if (!force && kvUrl && kvToken) {
    try {
      const r = await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvHeaders,
        body: JSON.stringify([["GET", cacheKey]]),
      });
      const [{ result }] = await r.json();
      if (result) {
        res.setHeader("Cache-Control", "s-maxage=7200, stale-while-revalidate=3600");
        return res.json({ ...JSON.parse(result), cached: true });
      }
    } catch (_) {}
  }

  // ── 2. Fetch news: Finnhub → Yahoo RSS fallback ───────────────────────────
  let headlines = [], source = "none";

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
          .map(a => ({ title: a.headline, summary: (a.summary || a.headline).slice(0, 300) }))
          .filter(a => a.summary.length > 10)
          .slice(0, 12);
        if (headlines.length) source = "finnhub";
      }
    } catch (_) {}
  }

  if (!headlines.length) {
    headlines = await fetchYahooNews().catch(() => []);
    if (headlines.length) source = "yahoo";
  }

  if (!headlines.length)
    return res.status(502).json({ error: "No news available (Finnhub + Yahoo both failed)" });

  // ── 3. Build prompt ───────────────────────────────────────────────────────
  const marketBlock = buildMarketBlock(req.query);
  const newsText = headlines
    .map((h, i) => `${i + 1}. ${h.title}\n   ${h.summary}`)
    .join("\n\n");

  const prompt = `你是一位专业的美股波段交易员助手，擅长数据驱动的市场分析。
请综合以下实时市场数据和今日新闻，生成一份结构化的美股日报。

${marketBlock ? `【实时市场数据】\n${marketBlock}\n\n` : ""}【今日新闻要点】
${newsText}

请严格按照以下格式输出，每个板块之间空一行，不要加 Markdown 符号：

【今日总结】
（用2-3句话：大盘方向 + 主要驱动因素 + 资金风险偏好 risk-on/off）
今日市场状态：[一句判断，例：指数强、宽度弱，AI硬件主导，短线拥挤度上升]

【驱动因素】
（2-3句：结合数据和新闻，说明今日涨跌的核心驱动，宏观/利率/财报/AI/地缘等）

【板块与资金】
（基于板块数据，1-2句：领涨/领跌板块、资金轮动方向，是防御还是进攻）

【风险与机会】
风险：（1-2个具体风险点）
机会：（1-2个值得关注的板块或主线机会）

语言直接专业，融合具体数字，避免废话，总字数控制在300字以内。`;

  // ── 4. Claude Sonnet ──────────────────────────────────────────────────────
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
        model:      "claude-sonnet-4-6",
        max_tokens: 700,
        messages:   [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
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

  // ── 5. Cache and return ───────────────────────────────────────────────────
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
          ["EXPIRE", cacheKey, 7200],
        ]),
      });
    } catch (_) {}
  }

  res.setHeader("Cache-Control", "s-maxage=7200, stale-while-revalidate=3600");
  res.json({ ...result, cached: false });
}
