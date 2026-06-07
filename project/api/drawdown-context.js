// GET /api/drawdown-context
// Historical single-day drawdown analogs for VOO & QQQ (last ~15 years):
// for every day that dropped beyond a tier threshold, measure the forward
// 5/10/20/60-trading-day return, then aggregate median / win-rate / tail.
// Optionally adds a Claude interpretation of today's drop in current context.
// Cached in Upstash Redis per day.

const TIERS = [
  { id: "normal",      label: "普通回调", lo: -3,   hi: -2 },  // -2% ~ -3%
  { id: "significant", label: "显著下跌", lo: -5,   hi: -3 },  // -3% ~ -5%
  { id: "sharp",       label: "急跌",     lo: -8,   hi: -5 },  // -5% ~ -8%
  { id: "crash",       label: "崩跌",     lo: -100, hi: -8 },  // <= -8%
];
const HORIZONS = [5, 10, 20, 60];

const pct = (a, b) => (a - b) / b * 100;

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined
    ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

async function fetchHistory(sym, years = 15) {
  const period1 = Math.floor(Date.now() / 1000) - years * 365 * 86400;
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
    `?interval=1d&period1=${period1}&period2=${period2}`;
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const chart = data?.chart?.result?.[0];
    if (!chart) return null;
    return (chart.indicators?.quote?.[0]?.close || []).filter(c => c != null);
  } catch (_) { return null; }
}

function analyze(closes) {
  const buckets = {};
  for (const t of TIERS) {
    buckets[t.id] = { count: 0, fwd: {} };
    for (const h of HORIZONS) buckets[t.id].fwd[h] = [];
  }
  for (let i = 1; i < closes.length; i++) {
    const ret = pct(closes[i], closes[i - 1]);
    if (ret > -2) continue;
    const tier = TIERS.find(t => ret > t.lo && ret <= t.hi);
    if (!tier) continue;
    buckets[tier.id].count++;
    for (const h of HORIZONS) {
      if (i + h < closes.length) buckets[tier.id].fwd[h].push(pct(closes[i + h], closes[i]));
    }
  }
  const result = {};
  for (const t of TIERS) {
    const b = buckets[t.id];
    const fwd = {};
    for (const h of HORIZONS) {
      const arr = b.fwd[h].slice().sort((a, b) => a - b);
      fwd[h] = arr.length ? {
        median: +quantile(arr, 0.5).toFixed(1),
        win:    Math.round(arr.filter(x => x > 0).length / arr.length * 100),
        p10:    +quantile(arr, 0.1).toFixed(1),
        p90:    +quantile(arr, 0.9).toFixed(1),
        n:      arr.length,
      } : null;
    }
    result[t.id] = { label: t.label, count: b.count, fwd };
  }
  return result;
}

function matchTier(drop) {
  if (drop == null || drop > -2) return null;
  return TIERS.find(t => drop > t.lo && drop <= t.hi) || TIERS[TIERS.length - 1];
}

function buildAiPrompt(q, matched, stats) {
  const t = stats[matched.tierId];
  const f = t.fwd;
  const fwdLine = HORIZONS
    .map(h => f[h] ? `${h}日 中位${f[h].median >= 0 ? "+" : ""}${f[h].median}% 胜率${f[h].win}% 最差${f[h].p10}%` : null)
    .filter(Boolean).join("；");
  const ctx = [];
  if (q.vix)    ctx.push(`VIX ${q.vix}`);
  if (q.dir)    ctx.push(`方向轴 ${q.dir}`);
  if (q.senti)  ctx.push(`情绪轴 ${q.senti}`);
  if (q.regime) ctx.push(`综合建议 ${q.regime}`);
  return `你是美股波段交易员助手。今日 ${matched.bench} 单日下跌 ${matched.drop}%，归入「${matched.label}」级别。
近15年该级别（${matched.bench}，样本数据）后续走势统计：${fwdLine}。
当前市场环境：${ctx.join(" · ") || "暂无"}。

请用中文输出，不要 Markdown 符号，总字数≤180字，严格按以下三段：

【历史规律】
（1句：该级别下跌后历史上通常如何修复——胜率、节奏）

【本次异同】
（1-2句：结合当前 VIX / 方向轴 / 情绪轴，判断这次更像哪类历史样本——V型快速反弹 还是 阴跌二次探底，关键区别点）

【操作建议】
（1句：分批进 / 等确认 / 减仓防守 中给出明确倾向，并说触发条件）`;
}

export default async function handler(req, res) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const kvUrl        = process.env.KV_REST_API_URL;
  const kvToken      = process.env.KV_REST_API_TOKEN;
  const force        = req.query.force === "1";
  const wantAi       = req.query.gen === "1";

  const today    = new Date().toISOString().slice(0, 10);
  const statsKey = `trendo:drawdown_stats:${today}`;
  const aiKey    = `trendo:drawdown_ai:${today}`;
  const kvHeaders = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };

  const kvGet = async key => {
    if (!kvUrl || !kvToken) return null;
    try {
      const r = await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvHeaders, body: JSON.stringify([["GET", key]]),
      });
      const [{ result }] = await r.json();
      return result ? JSON.parse(result) : null;
    } catch (_) { return null; }
  };
  const kvSet = async (key, val, ttl = 86400) => {
    if (!kvUrl || !kvToken) return;
    try {
      await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvHeaders,
        body: JSON.stringify([["SET", key, JSON.stringify(val)], ["EXPIRE", key, ttl]]),
      });
    } catch (_) {}
  };

  // ── 1. Stats (Redis-cached daily; history doesn't change intraday) ──────────
  let payload = force ? null : await kvGet(statsKey);
  if (!payload) {
    const [vooCloses, qqqCloses] = await Promise.all([fetchHistory("VOO"), fetchHistory("QQQ")]);
    if (!vooCloses && !qqqCloses)
      return res.status(502).json({ error: "Yahoo history unavailable for VOO/QQQ" });

    const stats = {
      VOO: vooCloses ? analyze(vooCloses) : null,
      QQQ: qqqCloses ? analyze(qqqCloses) : null,
    };
    const todayDrop = {
      VOO: vooCloses && vooCloses.length > 1 ? +pct(vooCloses.at(-1), vooCloses.at(-2)).toFixed(2) : null,
      QQQ: qqqCloses && qqqCloses.length > 1 ? +pct(qqqCloses.at(-1), qqqCloses.at(-2)).toFixed(2) : null,
    };
    // Match on the more severe of the two
    let matched = null;
    const worst = Math.min(
      todayDrop.VOO != null ? todayDrop.VOO : 0,
      todayDrop.QQQ != null ? todayDrop.QQQ : 0,
    );
    const wt = matchTier(worst);
    if (wt) {
      const bench = (todayDrop.VOO ?? 0) <= (todayDrop.QQQ ?? 0) ? "VOO" : "QQQ";
      matched = { tierId: wt.id, label: wt.label, bench, drop: todayDrop[bench] };
    }
    payload = { asOf: today, todayDrop, matched, stats, updatedAt: new Date().toISOString() };
    await kvSet(statsKey, payload);
  }

  // ── 2. Optional Claude interpretation (only when there's a drop today) ───────
  if (wantAi) {
    if (!payload.matched) {
      payload.summary = `今日无显著单日下跌（VOO ${payload.todayDrop.VOO ?? "—"}% · QQQ ${payload.todayDrop.QQQ ?? "—"}%）。下表为历史各级别单日回撤后的走势参考。`;
      payload.aiSource = "template";
    } else if (!anthropicKey) {
      payload.summary = "未配置 ANTHROPIC_API_KEY，仅显示历史统计。";
      payload.aiSource = "none";
    } else {
      let cached = force ? null : await kvGet(aiKey);
      if (cached?.summary) {
        payload.summary = cached.summary;
        payload.aiSource = "cache";
      } else {
        const benchStats = payload.stats[payload.matched.bench] || payload.stats.VOO || payload.stats.QQQ;
        const prompt = buildAiPrompt(req.query, payload.matched, benchStats);
        try {
          const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 500,
              messages: [{ role: "user", content: prompt }],
            }),
            signal: AbortSignal.timeout(30000),
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            payload.summary = aiData.content?.[0]?.text?.trim() || "";
            payload.aiSource = "claude";
            if (payload.summary) await kvSet(aiKey, { summary: payload.summary });
          } else {
            payload.summary = "";
            payload.aiSource = "error";
          }
        } catch (_) {
          payload.summary = "";
          payload.aiSource = "error";
        }
      }
    }
  }

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  res.json(payload);
}
