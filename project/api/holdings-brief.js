// GET /api/holdings-brief
// Analyses current holdings with company news + market context via Claude Sonnet.
// Cached per 2-hour slot + holdings fingerprint (sorted sym list).

// ── Helper: build market context block ───────────────────────────────────────
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
    const label = v > 30 ? "高波动/恐慌" : v >= 20 ? "中等波动" : "低波动/平稳";
    const trend = q.vixTrend === "up" ? " ↑" : q.vixTrend === "down" ? " ↓" : "";
    lines.push(`VIX ${v}${trend}（${label}）`);
  }

  // Fear & Greed
  if (q.fg != null) {
    const f = parseInt(q.fg);
    const label = f <= 25 ? "极度恐惧" : f <= 45 ? "恐惧" : f <= 55 ? "中性" : f <= 75 ? "贪婪" : "极度贪婪";
    lines.push(`恐惧贪婪指数 ${f}（${label}）`);
  }

  // Regime
  if (q.regime) lines.push(`市场状态：${q.regime}`);

  // Top sectors
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
      const bot = sorted.slice(-2).reverse().map(s =>
        `${s.zh}(${s.sym})${s.daily != null ? (s.daily >= 0 ? " +" : " ") + s.daily + "%" : ""}`
      ).join("、");
      lines.push(`板块强势：${top}`);
      lines.push(`板块弱势：${bot}`);
    }
  }

  return lines.join("\n");
}

// ── Helper: fetch recent company news from Finnhub ────────────────────────────
async function fetchCompanyNews(sym, token, days = 4) {
  const to   = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${from}&to=${to}&token=${token}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!r.ok) return [];
    const articles = await r.json();
    if (!Array.isArray(articles)) return [];
    return articles
      .filter(a => a.headline && a.headline.length > 10)
      .slice(0, 2)
      .map(a => a.headline.trim());
  } catch (_) {
    return [];
  }
}

export default async function handler(req, res) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const finnhubKey   = process.env.FINNHUB_API_KEY;
  const kvUrl        = process.env.KV_REST_API_URL;
  const kvToken      = process.env.KV_REST_API_TOKEN;

  if (!anthropicKey)
    return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });

  const holdingsStr = req.query.h || "";
  if (!holdingsStr)
    return res.status(400).json({ error: "No holdings data provided" });

  const force     = req.query.force === "1";
  const now       = new Date();
  const today     = now.toISOString().slice(0, 10);
  const slot      = Math.floor(now.getUTCHours() / 2);
  // Cache key: date + 2hr slot + sorted symbols (busts when portfolio changes)
  const syms      = holdingsStr.split(",").map(s => s.split(":")[0]).sort().join("-");
  const cacheKey  = `trendo:holdings_brief:${today}:${slot}:${syms.slice(0, 40)}`;
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
        res.setHeader("Cache-Control", "s-maxage=7200");
        return res.json({ ...JSON.parse(result), cached: true });
      }
    } catch (_) {}
  }

  // ── 2. Parse holdings ─────────────────────────────────────────────────────
  // Format: sym:pnlPct:rMult:days:status:earningsDate
  const holdings = holdingsStr.split(",").map(s => {
    const [sym, pnl, r, days, status, earn] = s.split(":");
    return {
      sym,
      pnlPct:   pnl  != null ? parseFloat(pnl)  : null,
      rMult:    r    != null ? parseFloat(r)     : null,
      days:     days != null ? parseInt(days)    : null,
      status:   status || "ok",
      earnings: earn && earn !== "" ? earn : null,
    };
  }).filter(h => h.sym);

  if (!holdings.length)
    return res.status(400).json({ error: "No valid holdings parsed" });

  // ── 3. Fetch company news in parallel (if Finnhub key available) ──────────
  const newsMap = {};
  if (finnhubKey) {
    const results = await Promise.allSettled(
      holdings.map(h => fetchCompanyNews(h.sym, finnhubKey, 4))
    );
    holdings.forEach((h, i) => {
      if (results[i].status === "fulfilled" && results[i].value.length) {
        newsMap[h.sym] = results[i].value;
      }
    });
  }

  // ── 4. Build prompt ───────────────────────────────────────────────────────
  const statusMap = {
    ok:       "正常",
    warn:     "注意",
    danger:   "近止损",
    target:   "近目标",
    trim:     "考虑减仓",
    earnings: "财报风险",
  };

  const marketBlock = buildMarketBlock(req.query);
  const hasNews = Object.keys(newsMap).length > 0;

  const holdingsText = holdings.map(h => {
    const pnlStr  = h.pnlPct  != null ? (h.pnlPct  >= 0 ? `+${h.pnlPct.toFixed(1)}%`  : `${h.pnlPct.toFixed(1)}%`)  : "N/A";
    const rStr    = h.rMult   != null ? (h.rMult   >= 0 ? `+${h.rMult.toFixed(1)}R`   : `${h.rMult.toFixed(1)}R`)   : "N/A";
    const daysStr = h.days    != null ? `持仓${h.days}天` : "";
    const stStr   = statusMap[h.status] || h.status;
    const earnStr = h.earnings ? ` [财报${h.earnings}]` : "";
    const newsLines = newsMap[h.sym]?.length
      ? `\n      近期动态：${newsMap[h.sym].join("；")}`
      : "";
    return `  ${h.sym}：${pnlStr} / ${rStr} / ${daysStr} · ${stStr}${earnStr}${newsLines}`;
  }).join("\n");

  const prompt =
`你是一位专业的美股波段交易员助手。请结合当前市场环境${hasNews ? "、最新个股动态" : ""}和持仓数据，给出今日持仓分析。

${marketBlock ? `【当前市场环境】\n${marketBlock}\n\n` : ""}【当前持仓（${holdings.length}只）】
${holdingsText}

请严格按以下格式输出，不加Markdown符号：

【持仓概览】
（一句话：整体盈亏状态、盈亏比分布、与当前市场环境的匹配度）

【重点关注】
（列出2-3个需关注的持仓，重点分析：持仓时间是否合理、盈利/亏损相对于持仓天数的效率、有无近期利空/利好消息、财报风险）

【今日操作建议】
（1-2条具体可执行建议：结合市场状态和个股动态，明确说哪只应止盈/减仓/持有/止损，给出数据驱动的理由）

语言直接专业，数据驱动，总字数180字以内，不废话。`;

  // ── 5. Claude Sonnet ──────────────────────────────────────────────────────
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
        max_tokens: 500,
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

  // ── 6. Cache & return ─────────────────────────────────────────────────────
  const result = {
    summary,
    count:     holdings.length,
    hasNews:   hasNews,
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

  res.setHeader("Cache-Control", "s-maxage=7200");
  res.json({ ...result, cached: false });
}
