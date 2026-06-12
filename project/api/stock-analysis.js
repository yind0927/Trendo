// GET /api/stock-analysis?sym=AAPL[&force=1]
// Five-axis AI stock analysis: technical + valuation + growth + health + sentiment
// Data: Finnhub profile2 + metric/all + news + earnings calendar + Yahoo 400-day history
// Scores computed server-side; Claude produces narrative + recommendation.
// Redis cache: trendo:stock_analysis:SYM:YYYY-MM-DD (TTL 28800s / 8h)

// ── Technical indicator helpers ───────────────────────────────────────────────
function calcMA(closes, n) {
  if (closes.length < n) return null;
  const s = closes.slice(-n);
  return s.reduce((a, b) => a + b, 0) / n;
}

function calcRSI(closes, n = 14) {
  if (closes.length < n + 1) return null;
  const recent = closes.slice(-(n + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < recent.length; i++) {
    const d = recent[i] - recent[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const ag = gains / n, al = losses / n;
  if (al === 0) return 100;
  return Math.round((100 - 100 / (1 + ag / al)) * 10) / 10;
}

// Normalize Finnhub percentage-style fields:
// Finnhub returns margins/ROE/growth as raw percentages (26.4 = 26.4%)
// but occasionally as ratios (0.264 = 26.4%). Heuristic: |v| < 2 → multiply by 100.
function normPct(v) {
  if (v == null || !isFinite(v)) return null;
  if (Math.abs(v) > 500) return null; // sanity cap
  return Math.abs(v) < 2 ? parseFloat((v * 100).toFixed(2)) : parseFloat(v.toFixed(2));
}

// ── Five-axis scoring ─────────────────────────────────────────────────────────
function scoreTrend({ price, ma50, ma200, rsi, wk52High, wk52Low }) {
  if (!price) return null;
  let s = 50;
  if (ma50 && ma200) {
    if (price > ma50 && ma50 > ma200) s += 35;       // perfect bull
    else if (price > ma50)            s += 15;        // above 50
    else if (price > ma200)           s += 5;         // above 200, below 50
    else                              s -= 20;        // below 200
  }
  if (rsi != null) {
    if      (rsi >= 45 && rsi <= 65) s += 15;
    else if (rsi >  65 && rsi <= 75) s += 5;
    else if (rsi >  75)              s -= 12;
    else if (rsi >= 35 && rsi <  45) s += 5;
    else if (rsi <  35)              s -= 5;
  }
  if (wk52High && wk52Low && wk52High > wk52Low) {
    const pos = (price - wk52Low) / (wk52High - wk52Low);
    if (pos > 0.75) s += 5; else if (pos < 0.25) s -= 5;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

function scoreValuation({ pe, peg, ps }) {
  let s = 65;
  if (peg != null && peg > 0) {
    if      (peg < 0.75) s += 25;
    else if (peg < 1.2)  s += 15;
    else if (peg < 2.0)  s +=  0;
    else if (peg < 3.0)  s -= 15;
    else                 s -= 25;
  } else if (pe != null) {
    if      (pe < 0)   s -= 10;
    else if (pe < 15)  s += 20;
    else if (pe < 22)  s += 12;
    else if (pe < 30)  s +=  0;
    else if (pe < 45)  s -= 15;
    else               s -= 25;
  }
  if (ps != null) {
    if      (ps <  1.5) s +=  5;
    else if (ps > 20)   s -= 10;
    else if (ps > 10)   s -=  5;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

// revGrowth / epsGrowth in normalized percentage points (e.g. 6.5 = 6.5%)
function scoreGrowth({ revGrowth, epsGrowth }) {
  let s = 50;
  if (revGrowth != null) {
    if      (revGrowth > 30) s += 38;
    else if (revGrowth > 20) s += 28;
    else if (revGrowth > 10) s += 18;
    else if (revGrowth >  3) s +=  8;
    else if (revGrowth >  0) s +=  2;
    else if (revGrowth > -10) s -= 12;
    else                      s -= 25;
  }
  if (epsGrowth != null) {
    if      (epsGrowth > 25) s += 15;
    else if (epsGrowth > 10) s +=  8;
    else if (epsGrowth >  0) s +=  3;
    else if (epsGrowth < -15) s -= 10;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

// netMargin / roe in normalized percentage points
function scoreHealth({ netMargin, grossMargin, roe, deRatio, currentRatio }) {
  let s = 55;
  if (netMargin != null) {
    if      (netMargin > 20) s += 20;
    else if (netMargin > 10) s += 12;
    else if (netMargin >  3) s +=  5;
    else if (netMargin <  0) s -= 20;
  }
  if (roe != null) {
    if      (roe > 30) s += 12;
    else if (roe > 15) s +=  6;
    else if (roe <  0) s -=  8;
  }
  if (deRatio != null) {
    if      (deRatio < 0.3) s +=  5;
    else if (deRatio > 3.0) s -= 12;
    else if (deRatio > 2.0) s -=  6;
  }
  if (currentRatio != null) {
    if      (currentRatio >= 2) s +=  5;
    else if (currentRatio <  1) s -=  8;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

function gradeFrom(score) {
  if (score >= 88) return "A";
  if (score >= 82) return "A-";
  if (score >= 76) return "B+";
  if (score >= 70) return "B";
  if (score >= 64) return "B-";
  if (score >= 58) return "C+";
  if (score >= 50) return "C";
  return "D";
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const sym     = (req.query.sym || "").toUpperCase().replace(/[^A-Z0-9.\-^]/g, "").slice(0, 10);
  const force   = req.query.force === "1";
  const fhKey   = process.env.FINNHUB_API_KEY;
  const aiKey   = process.env.ANTHROPIC_API_KEY;
  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!sym) return res.status(400).json({ error: "sym required" });
  if (!aiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });

  const today     = new Date().toISOString().slice(0, 10);
  const cacheKey  = `trendo:stock_analysis:${sym}:${today}`;
  const kvH       = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };

  // ── 1. Redis cache ─────────────────────────────────────────────────────────
  if (!force && kvUrl && kvToken) {
    try {
      const r = await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvH,
        body: JSON.stringify([["GET", cacheKey]]),
      });
      const [{ result }] = await r.json();
      if (result) {
        res.setHeader("Cache-Control", "s-maxage=28800");
        return res.json({ ...JSON.parse(result), cached: true });
      }
    } catch (_) {}
  }

  // ── 2. Parallel fetches ────────────────────────────────────────────────────
  const [profileR, metricsR, newsR, historyR, earningsR] = await Promise.allSettled([

    // Finnhub company profile
    fhKey ? fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${fhKey}`,
      { signal: AbortSignal.timeout(5000) }
    ).then(r => r.json()).catch(() => null) : Promise.resolve(null),

    // Finnhub financial metrics
    fhKey ? fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${sym}&metric=all&token=${fhKey}`,
      { signal: AbortSignal.timeout(5000) }
    ).then(r => r.json()).catch(() => null) : Promise.resolve(null),

    // Finnhub company news (7 days, top 8 headlines)
    fhKey ? (async () => {
      const to   = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const r = await fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${from}&to=${to}&token=${fhKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const a = await r.json();
      return Array.isArray(a) ? a.filter(x => x.headline?.length > 10).slice(0, 8).map(x => x.headline.trim()) : [];
    })().catch(() => []) : Promise.resolve([]),

    // Yahoo Finance 400-day daily closes
    (async () => {
      const fromTs = Math.floor(Date.now() / 1000) - 400 * 86400;
      const toTs   = Math.floor(Date.now() / 1000) + 86400;
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
        `?interval=1d&period1=${fromTs}&period2=${toTs}`,
        { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(7000) }
      );
      if (!r.ok) return null;
      const d = await r.json();
      const chart = d?.chart?.result?.[0];
      if (!chart) return null;
      const closes = (chart.indicators?.quote?.[0]?.close ?? []).filter(c => c != null);
      return { closes, meta: chart.meta };
    })().catch(() => null),

    // Finnhub next earnings date
    fhKey ? (async () => {
      const to   = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
      const from = new Date().toISOString().slice(0, 10);
      const r = await fetch(
        `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${sym}&token=${fhKey}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const d = await r.json();
      return d?.earningsCalendar?.[0]?.date ?? null;
    })().catch(() => null) : Promise.resolve(null),
  ]);

  const profile      = profileR.status  === "fulfilled" ? profileR.value  : null;
  const rawM         = metricsR.status  === "fulfilled" ? (metricsR.value?.metric ?? {}) : {};
  const news         = newsR.status     === "fulfilled" ? (newsR.value ?? []) : [];
  const history      = historyR.status  === "fulfilled" ? historyR.value : null;
  const nextEarnings = earningsR.status === "fulfilled" ? earningsR.value : null;

  // ── 3. Extract and normalize values ───────────────────────────────────────
  const closes    = history?.closes ?? [];
  const price     = history?.meta?.regularMarketPrice ?? closes[closes.length - 1] ?? null;
  const name      = profile?.name ?? sym;
  const industry  = profile?.finnhubIndustry ?? null;
  const exchange  = profile?.exchange ?? null;
  const marketCap = profile?.marketCapitalization ?? null; // millions USD
  const ipoYear   = profile?.ipo?.slice(0, 4) ?? null;

  // Technical
  const ma50    = calcMA(closes, 50);
  const ma200   = calcMA(closes, 200);
  const rsi     = calcRSI(closes, 14);
  const wk52H   = rawM["52WeekHigh"]  ?? null;
  const wk52L   = rawM["52WeekLow"]   ?? null;
  const wk52Pos = (price && wk52H && wk52L && wk52H > wk52L)
    ? Math.round((price - wk52L) / (wk52H - wk52L) * 100) : null;

  // Financial metrics (normalized to %)
  const m = {
    pe:          rawM.peNormalizedAnnual  ?? rawM.peExclExtraTTM ?? null,
    ps:          rawM.psTTM               ?? rawM.psAnnual        ?? null,
    pb:          rawM.pbAnnual            ?? rawM.pbQuarterly     ?? null,
    peg:         null, // computed below
    revGrowth:   normPct(rawM.revenueGrowthTTMYoy ?? rawM.revenueGrowth3Y ?? null),
    epsGrowth:   normPct(rawM.epsGrowthTTMYoy ?? rawM.epsGrowth3Y ?? null),
    grossMargin: normPct(rawM.grossMarginTTM   ?? rawM.grossMarginAnnual  ?? null),
    opMargin:    normPct(rawM.operatingMarginTTM ?? rawM.operatingMarginAnnual ?? null),
    netMargin:   normPct(rawM.netMarginTTM      ?? rawM.netMarginAnnual   ?? null),
    roe:         normPct(rawM.roeTTM   ?? rawM.roe5Y ?? null),
    roa:         normPct(rawM.roaTTM   ?? null),
    deRatio:     rawM["totalDebt/equityAnnual"]    ?? rawM["totalDebt/equityQuarterly"] ?? null,
    currentRatio: rawM.currentRatioQuarterly ?? rawM.currentRatioAnnual ?? null,
    beta:        rawM.beta ?? null,
    divYield:    rawM.dividendYieldIndicatedAnnual ?? null,
  };

  // Derive PEG if not directly available
  if (m.peg == null && m.pe != null && m.pe > 0 && m.epsGrowth != null && m.epsGrowth > 0) {
    m.peg = parseFloat((m.pe / m.epsGrowth).toFixed(2));
  }

  // ── 4. Compute five-axis scores ────────────────────────────────────────────
  const scores = {
    trend:     scoreTrend({ price, ma50, ma200, rsi, wk52High: wk52H, wk52Low: wk52L }),
    valuation: scoreValuation({ pe: m.pe, peg: m.peg, ps: m.ps }),
    growth:    scoreGrowth({ revGrowth: m.revGrowth, epsGrowth: m.epsGrowth }),
    health:    scoreHealth({ netMargin: m.netMargin, grossMargin: m.grossMargin, roe: m.roe, deRatio: m.deRatio, currentRatio: m.currentRatio }),
  };
  const overall = Math.round(
    (scores.trend     ?? 50) * 0.30 +
    (scores.valuation ?? 50) * 0.25 +
    (scores.growth    ?? 50) * 0.25 +
    (scores.health    ?? 50) * 0.20
  );
  scores.overall = overall;
  scores.grade   = gradeFrom(overall);

  // Earnings timing
  const daysToEarnings = nextEarnings
    ? Math.round((new Date(nextEarnings) - new Date()) / 86400000) : null;
  const earningsRisk = daysToEarnings != null
    ? (daysToEarnings <= 14 ? "high" : daysToEarnings <= 30 ? "moderate" : "low") : null;

  // ── 5. Build Claude prompt ─────────────────────────────────────────────────
  const fmtV = (v, d = 1, s = "x") => v != null ? `${parseFloat(v.toFixed(d))}${s}` : "N/A";
  const fmtP = v => v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : "N/A";

  const mcStr = marketCap
    ? marketCap > 200000 ? `$${(marketCap / 1e6).toFixed(1)}万亿`
    : marketCap > 10000  ? `$${(marketCap / 1000).toFixed(0)}亿`
    : `$${marketCap.toFixed(0)}百万` : "N/A";

  const trendStr = price && ma50 && ma200
    ? price > ma50 && ma50 > ma200 ? "多头排列 price>MA50>MA200"
    : price > ma50                  ? "价格在MA50之上，MA50≤MA200"
    : price > ma200                 ? "价格在MA200之上但低于MA50"
    : "价格低于MA200（空头区域）" : "数据不足";

  const prompt = `你是资深美股分析师助手。请对以下股票做全面分析。

【基本信息】
代码：${sym} | 公司：${name} | 行业：${industry ?? "未知"}
交易所：${exchange ?? "US"} | 市值：${mcStr} | 上市年份：${ipoYear ?? "N/A"}

【技术面】
价格 $${price?.toFixed(2) ?? "N/A"} | MA50 $${ma50?.toFixed(2) ?? "N/A"} | MA200 $${ma200?.toFixed(2) ?? "N/A"}
RSI(14) ${rsi?.toFixed(1) ?? "N/A"} | 52周区间 $${wk52L?.toFixed(1) ?? "N/A"}~$${wk52H?.toFixed(1) ?? "N/A"} | 当前处于52周${wk52Pos ?? "N/A"}%分位
趋势结构：${trendStr}

【财务估值】
PE ${fmtV(m.pe)} | PS ${fmtV(m.ps)} | PB ${fmtV(m.pb)} | PEG ${fmtV(m.peg)}

【成长性】
收入增速(TTM YoY) ${fmtP(m.revGrowth)} | EPS增速(TTM YoY) ${fmtP(m.epsGrowth)}

【盈利质量】
毛利率 ${fmtP(m.grossMargin)} | 营业利润率 ${fmtP(m.opMargin)} | 净利率 ${fmtP(m.netMargin)}
ROE ${fmtP(m.roe)} | ROA ${fmtP(m.roa)}

【财务健康】
D/E比率 ${m.deRatio?.toFixed(2) ?? "N/A"} | 流动比率 ${m.currentRatio?.toFixed(2) ?? "N/A"}
Beta ${m.beta?.toFixed(2) ?? "N/A"} | 股息率 ${m.divYield?.toFixed(2) ?? "N/A"}%

【系统评分（供参考）】
技术面 ${scores.trend ?? "N/A"}/100 | 估值 ${scores.valuation}/100 | 成长性 ${scores.growth}/100 | 财务健康 ${scores.health}/100 | 综合 ${overall}/100（${scores.grade}级）

【近期新闻（最多8条）】
${news.length ? news.join("\n") : "暂无近期新闻"}

${nextEarnings ? `【财报日历】下次财报约 ${nextEarnings}（${daysToEarnings}天后），风险等级：${earningsRisk === "high" ? "高（两周内）" : earningsRisk === "moderate" ? "中（一个月内）" : "低"}` : ""}

请按以下格式输出，每段标题用【】，不加Markdown：

【公司简介】
（3句话：①核心业务和主要收入来源；②行业地位和核心竞争优势；③近期战略重点或业务亮点。直接描述实质，不要重复上面的数据。）

【估值分析】
（当前PE/PEG是否合理？与行业或历史比较视角？高估/低估/合理的判断依据。1-2句核心结论。）

【成长性】
（收入/EPS增速趋势：是加速还是减速？主要成长驱动力。未来12个月预期方向。1-2句核心判断。）

【财务健康】
（盈利质量（净利率/ROE）是否强劲？负债结构安全吗？有无现金流风险？1-2句核心判断。）

【技术面】
（趋势结构、RSI动量、关键支撑/阻力价位。是否处于合理入场窗口？需要等什么信号？1-2句明确判断。）

【综合建议】
（一句话总结 + 操作思路：建议入场区域（如有）、潜在止损思路、主要风险警示。财报风险需特别说明。）

RECOMMENDATION:{"action":"watch","label":"可以关注","entry":"${ma50 ? '回调至MA50($' + ma50.toFixed(0) + ')区域' : '等待技术信号'}"}

注意：最后一行必须是RECOMMENDATION:，JSON格式，action只能是 immediate/watch/wait/avoid，label对应：立即关注/可以关注/等待信号/建议回避。请根据综合分析自主判断。总字数≤500字。`;

  // ── 6. Call Claude ─────────────────────────────────────────────────────────
  let rawText = "";
  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": aiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(28000),
    });
    if (!aiRes.ok) {
      const err = await aiRes.text();
      return res.status(502).json({ error: `Claude error: ${err.slice(0, 200)}` });
    }
    const aiData = await aiRes.json();
    rawText = aiData.content?.[0]?.text?.trim() ?? "";
  } catch (e) {
    return res.status(500).json({ error: `AI request failed: ${e.message}` });
  }

  if (!rawText) return res.status(500).json({ error: "Empty AI response" });

  // Parse recommendation JSON
  let recommendation = { action: "watch", label: "可以关注", entry: "" };
  const recMatch = rawText.match(/RECOMMENDATION:\s*(\{[^}]+\})/);
  if (recMatch) {
    try { recommendation = JSON.parse(recMatch[1]); } catch (_) {}
  }
  const summary = rawText.replace(/RECOMMENDATION:.*$/m, "").trim();

  // ── 7. Assemble and cache ──────────────────────────────────────────────────
  const result = {
    sym, name, industry, exchange, marketCap, marketCapStr: mcStr, ipoYear,
    price, wk52High: wk52H, wk52Low: wk52L, wk52Pos,
    ma50: ma50 != null ? parseFloat(ma50.toFixed(2)) : null,
    ma200: ma200 != null ? parseFloat(ma200.toFixed(2)) : null,
    rsi: rsi != null ? parseFloat(rsi.toFixed(1)) : null,
    scores, metrics: m,
    nextEarnings, daysToEarnings, earningsRisk,
    recommendation, summary,
    newsCount: news.length,
    updatedAt: new Date().toISOString(),
  };

  if (kvUrl && kvToken) {
    try {
      await fetch(`${kvUrl}/pipeline`, {
        method: "POST", headers: kvH,
        body: JSON.stringify([
          ["SET",    cacheKey, JSON.stringify(result)],
          ["EXPIRE", cacheKey, 28800],
        ]),
      });
    } catch (_) {}
  }

  res.setHeader("Cache-Control", "s-maxage=28800");
  res.json({ ...result, cached: false });
}
