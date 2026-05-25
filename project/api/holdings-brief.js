// GET /api/holdings-brief
// Analyses current real holdings with Claude Sonnet.
// Cached per hour + holdings fingerprint (sym list).

export default async function handler(req, res) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
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
  const hour      = now.getUTCHours();
  // Fingerprint = sorted sym list, so cache busts when portfolio changes
  const syms      = holdingsStr.split(",").map(s => s.split(":")[0]).sort().join("-");
  const cacheKey  = `trendo:holdings_brief:${today}:${hour}:${syms.slice(0, 40)}`;
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
        res.setHeader("Cache-Control", "s-maxage=3600");
        return res.json({ ...JSON.parse(result), cached: true });
      }
    } catch (_) {}
  }

  // ── 2. Parse holdings ─────────────────────────────────────────────────────
  // Format: sym:pnlPct:rMult:days:status:bxScore:earningsDate
  const holdings = holdingsStr.split(",").map(s => {
    const [sym, pnl, r, days, status, bx, earn] = s.split(":");
    return {
      sym,
      pnlPct:   pnl  != null ? parseFloat(pnl)  : null,
      rMult:    r    != null ? parseFloat(r)     : null,
      days:     days != null ? parseInt(days)    : null,
      status:   status || "ok",
      bxScore:  bx   && bx !== "" ? parseFloat(bx) : null,
      earnings: earn && earn !== "" ? earn : null,
    };
  }).filter(h => h.sym);

  if (!holdings.length)
    return res.status(400).json({ error: "No valid holdings parsed" });

  // ── 3. Build prompt ───────────────────────────────────────────────────────
  const statusMap = {
    ok: "正常", warn: "注意", danger: "近止损", target: "近目标",
    trim: "考虑减仓", earnings: "财报风险",
  };

  const holdingsText = holdings.map(h => {
    const pnlStr  = h.pnlPct  != null ? (h.pnlPct  >= 0 ? `+${h.pnlPct.toFixed(1)}%`  : `${h.pnlPct.toFixed(1)}%`)  : "N/A";
    const rStr    = h.rMult   != null ? (h.rMult   >= 0 ? `+${h.rMult.toFixed(1)}R`   : `${h.rMult.toFixed(1)}R`)   : "N/A";
    const daysStr = h.days    != null ? `${h.days}天`  : "";
    const bxStr   = h.bxScore != null ? ` BX${h.bxScore.toFixed(1)}` : "";
    const earnStr = h.earnings ? ` [财报${h.earnings}]` : "";
    const stStr   = statusMap[h.status] || h.status;
    return `  ${h.sym}: ${pnlStr} / ${rStr} / 持仓${daysStr}${bxStr} · ${stStr}${earnStr}`;
  }).join("\n");

  const prompt =
    `你是一位专业的美股波段交易员助手。请分析以下我的当前实盘持仓，给出今日持仓概要和操作建议。

当前持仓（${holdings.length}只）：
${holdingsText}

请严格按以下格式输出，不加Markdown符号：

【持仓概览】
（一句话：整体盈亏状态、R倍数分布、仓位健康度）

【需要关注】
（列出2-3个需要重点关注的持仓：近止损/近目标/持仓过长/有财报风险）

【今日操作建议】
（1-2条具体、可执行的建议：哪只考虑止盈/止损/持有/减仓，给出理由）

语言直接专业，数据驱动，总字数150字以内，不废话。`;

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
        max_tokens: 400,
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

  // ── 5. Cache & return ─────────────────────────────────────────────────────
  const result = { summary, count: holdings.length, updatedAt: new Date().toISOString() };

  if (kvUrl && kvToken) {
    try {
      await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvHeaders,
        body: JSON.stringify([
          ["SET",    cacheKey, JSON.stringify(result)],
          ["EXPIRE", cacheKey, 3600],
        ]),
      });
    } catch (_) {}
  }

  res.setHeader("Cache-Control", "s-maxage=3600");
  res.json({ ...result, cached: false });
}
