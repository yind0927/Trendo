// GET /api/market-summary
// Fetches market news, enriches with real market data, summarises with Claude Sonnet.
// Cached in Upstash Redis per 12-hour slot.

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

  // Three-axis model: direction (trend) / risk capacity (VIX posMax) / sentiment tilt
  if (q.dir || q.posmax != null || q.senti) {
    const parts = [];
    if (q.dir)          parts.push(`方向轴=${q.dir}`);
    if (q.posmax != null) parts.push(`风险容量=${q.posmax}%上限`);
    if (q.senti)        parts.push(`情绪轴=${q.senti}`);
    lines.push(`三轴模型：${parts.join(" · ")}`);
  }

  // Regime (combined recommendation from the three-axis model)
  if (q.regime) lines.push(`综合操作建议：${q.regime}`);

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
  const force    = req.query.force === "1";
  const isCron   = req.query.cron === "1";
  const kvHeaders = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };

  // Slot aligned to Beijing 09:30 / 21:30 (UTC+8)
  // am = 09:30–21:29 BJ · pm = 21:30–09:29 BJ next day
  function bjSlotKey(d) {
    const bjMs  = d.getTime() + 8 * 3600 * 1000;
    const bj    = new Date(bjMs);
    const h = bj.getUTCHours(), m = bj.getUTCMinutes();
    const eve = h > 21 || (h === 21 && m >= 30);
    const mor = !eve && (h > 9  || (h === 9  && m >= 30));
    if (eve) return `${bj.toISOString().slice(0, 10)}:pm`;
    if (mor) return `${bj.toISOString().slice(0, 10)}:am`;
    return `${new Date(bjMs - 86400000).toISOString().slice(0, 10)}:pm`; // before 09:30 → prev pm
  }
  const cacheKey = `trendo:market_brief_bj:${bjSlotKey(now)}`;

  // ── 1. Redis cache ────────────────────────────────────────────────────────
  if (!force && kvUrl && kvToken) {
    try {
      const r = await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvHeaders,
        body: JSON.stringify([["GET", cacheKey]]),
      });
      const [{ result }] = await r.json();
      if (result) {
        res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=7200");
        return res.json({ ...JSON.parse(result), cached: true });
      }
    } catch (_) {}
  }

  // ── 1b. Cron self-enrichment: fetch VIX + FGI when called without market ctx ─
  if (isCron && !req.query.vix) {
    try {
      const [vixRes, fgRes] = await Promise.allSettled([
        fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=2d", {
          headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
          signal: AbortSignal.timeout(6000),
        }).then(r => r.json()),
        fetch("https://production.dataviz.cnn.io/index/feargreed/graphdata", {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(6000),
        }).then(r => r.json()),
      ]);
      if (vixRes.status === "fulfilled") {
        const closes = vixRes.value?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(Boolean) || [];
        if (closes.length) req.query.vix = closes.at(-1).toFixed(2);
      }
      if (fgRes.status === "fulfilled") {
        const score = fgRes.value?.fear_and_greed?.score;
        if (score != null) req.query.fg = Math.round(score);
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
风险：（1-2个具体风险点，结合当前数据说明触发条件）
机会：（1-2个相对冷门、市场还未充分定价的潜力赛道或细分方向——避免泛泛的"科技/AI"等大板块，优先挖掘：受益于宏观变化但关注度不高的细分行业、政策催化下的特定标的方向、资金刚开始轮动但尚未拥挤的板块、或当前新闻中被忽视的结构性机会。每条给出赛道名称 + 一句逻辑）

分析时请遵循三轴框架：VIX 只决定仓位大小（多少），趋势方向决定能否做多，情绪极端（FGI/RSI）决定何时止盈或反向——低 VIX + 情绪过热时应提示止盈而非追高，方向逆风时无论 VIX 多低都不建议新多单。
语言直接专业，融合具体数字，避免废话，总字数控制在400字以内。`;

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
        max_tokens: 1200,
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
          ["EXPIRE", cacheKey, 43200],
        ]),
      });
    } catch (_) {}
  }

  res.setHeader("Cache-Control", "s-maxage=43200, stale-while-revalidate=7200");
  res.json({ ...result, cached: false });
}
