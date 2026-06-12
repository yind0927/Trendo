// GET /api/stock-analysis?sym=AAPL[&force=1]
// Five-axis AI stock analysis: technical + valuation + growth + health + analyst
// Data: Yahoo quoteSummary (primary) + Finnhub profile/news/earnings + Yahoo 400d chart
// Redis cache: trendo:stock_analysis:SYM:YYYY-MM-DD (TTL 28800s / 8h)

function calcMA(closes, n) {
  if (closes.length < n) return null;
  return closes.slice(-n).reduce((a, b) => a + b, 0) / n;
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

// Normalize Finnhub-style percentage fields (some return 0.264, some return 26.4)
function normPct(v) {
  if (v == null || !isFinite(v)) return null;
  if (Math.abs(v) > 500) return null;
  return Math.abs(v) < 2 ? parseFloat((v * 100).toFixed(2)) : parseFloat(v.toFixed(2));
}

// ── Five-axis scoring ─────────────────────────────────────────────────────────
function scoreTrend({ price, ma50, ma200, rsi, wk52High, wk52Low }) {
  if (!price) return null;
  let s = 50;
  if (ma50 && ma200) {
    if (price > ma50 && ma50 > ma200) s += 35;
    else if (price > ma50)            s += 15;
    else if (price > ma200)           s += 5;
    else                              s -= 20;
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

function scoreValuation({ pe, forwardPE, peg, ps }) {
  let s = 65;
  // Prefer forward PE when it's lower and reasonable
  const effPE = (forwardPE != null && forwardPE > 0 && (pe == null || forwardPE < pe)) ? forwardPE : pe;
  if (peg != null && peg > 0) {
    if      (peg < 0.75) s += 25;
    else if (peg < 1.2)  s += 15;
    else if (peg < 2.0)  s +=  0;
    else if (peg < 3.0)  s -= 15;
    else                 s -= 25;
  } else if (effPE != null) {
    if      (effPE < 0)   s -= 10;
    else if (effPE < 15)  s += 20;
    else if (effPE < 22)  s += 12;
    else if (effPE < 30)  s +=  0;
    else if (effPE < 45)  s -= 15;
    else                  s -= 25;
  }
  if (ps != null) {
    if      (ps <  1.5) s +=  5;
    else if (ps > 20)   s -= 10;
    else if (ps > 10)   s -=  5;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

function scoreGrowth({ revGrowth, epsGrowth }) {
  let s = 50;
  if (revGrowth != null) {
    if      (revGrowth > 30)  s += 38;
    else if (revGrowth > 20)  s += 28;
    else if (revGrowth > 10)  s += 18;
    else if (revGrowth >  3)  s +=  8;
    else if (revGrowth >  0)  s +=  2;
    else if (revGrowth > -10) s -= 12;
    else                      s -= 25;
  }
  if (epsGrowth != null) {
    if      (epsGrowth > 25)  s += 15;
    else if (epsGrowth > 10)  s +=  8;
    else if (epsGrowth >  0)  s +=  3;
    else if (epsGrowth < -15) s -= 10;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

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

// Analyst consensus axis
function scoreAnalyst({ targetUpside, recKey, analystCount }) {
  if (recKey == null && targetUpside == null) return null;
  let s = 50;
  if (recKey) {
    const map = { strongBuy: 30, buy: 18, hold: 0, underperform: -18, sell: -30 };
    s += map[recKey] ?? 0;
  }
  if (targetUpside != null) {
    if      (targetUpside > 40)  s += 15;
    else if (targetUpside > 20)  s += 10;
    else if (targetUpside > 10)  s +=  5;
    else if (targetUpside >  0)  s +=  2;
    else if (targetUpside < -10) s -= 15;
    else if (targetUpside <  0)  s -=  5;
  }
  if (analystCount != null && analystCount >= 10) s += 3;
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

  const today    = new Date().toISOString().slice(0, 10);
  const cacheKey = `trendo:stock_analysis:${sym}:${today}`;
  const kvH      = { Authorization: `Bearer ${kvToken}`, "Content-Type": "application/json" };

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
  const yHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const [profileR, yqsR, metricsR, newsR, historyR, earningsR] = await Promise.allSettled([

    // Finnhub company profile
    fhKey ? fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${fhKey}`,
      { signal: AbortSignal.timeout(5000) }
    ).then(r => r.json()).catch(() => null) : Promise.resolve(null),

    // Yahoo Finance quoteSummary — primary financial data source
    fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}` +
      `?modules=summaryDetail%2CdefaultKeyStatistics%2CfinancialData%2Cearnings`,
      { headers: yHeaders, signal: AbortSignal.timeout(9000) }
    ).then(r => r.ok ? r.json() : null).catch(() =>
      // Fallback to query2
      fetch(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}` +
        `?modules=summaryDetail%2CdefaultKeyStatistics%2CfinancialData%2Cearnings`,
        { headers: yHeaders, signal: AbortSignal.timeout(9000) }
      ).then(r => r.ok ? r.json() : null).catch(() => null)
    ),

    // Finnhub financial metrics (fallback for any Yahoo gaps)
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
        { headers: yHeaders, signal: AbortSignal.timeout(7000) }
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
  const yqs          = yqsR.status      === "fulfilled" ? yqsR.value      : null;
  const rawM         = metricsR.status  === "fulfilled" ? (metricsR.value?.metric ?? {}) : {};
  const news         = newsR.status     === "fulfilled" ? (newsR.value ?? []) : [];
  const history      = historyR.status  === "fulfilled" ? historyR.value : null;
  const nextEarnings = earningsR.status === "fulfilled" ? earningsR.value : null;

  // ── 3. Unpack Yahoo quoteSummary ──────────────────────────────────────────
  const ys = yqs?.quoteSummary?.result?.[0] ?? {};
  const yD = ys.summaryDetail        ?? {};
  const yK = ys.defaultKeyStatistics ?? {};
  const yF = ys.financialData        ?? {};
  const yE = ys.earnings             ?? null;

  // ── 4. Technical data (from Yahoo chart) ─────────────────────────────────
  const closes    = history?.closes ?? [];
  const price     = history?.meta?.regularMarketPrice ?? closes[closes.length - 1] ?? null;
  const name      = profile?.name ?? sym;
  const industry  = profile?.finnhubIndustry ?? null;
  const exchange  = profile?.exchange ?? null;
  const ipoYear   = profile?.ipo?.slice(0, 4) ?? null;

  // Market cap: prefer Finnhub (millions USD), fallback Yahoo (raw bytes)
  const marketCap = profile?.marketCapitalization ??
    (yD.marketCap?.raw != null ? yD.marketCap.raw / 1e6 : null);

  const ma50    = calcMA(closes, 50);
  const ma200   = calcMA(closes, 200);
  const rsi     = calcRSI(closes, 14);
  const wk52H   = yD.fiftyTwoWeekHigh?.raw ?? rawM["52WeekHigh"] ?? null;
  const wk52L   = yD.fiftyTwoWeekLow?.raw  ?? rawM["52WeekLow"]  ?? null;
  const wk52Pos = (price && wk52H && wk52L && wk52H > wk52L)
    ? Math.round((price - wk52L) / (wk52H - wk52L) * 100) : null;

  // ── 5. Merge financial metrics (Yahoo primary, Finnhub fallback) ──────────
  // Yahoo returns margins as decimals (0.264), Finnhub as % (26.4) or decimal — normalize
  const yPct = v => v != null ? parseFloat((v * 100).toFixed(2)) : null;

  const m = {
    pe:          yD.trailingPE?.raw                  ?? rawM.peNormalizedAnnual ?? rawM.peExclExtraTTM ?? null,
    forwardPE:   yD.forwardPE?.raw                   ?? null,
    ps:          yD.priceToSalesTrailing12Months?.raw ?? rawM.psTTM ?? rawM.psAnnual ?? null,
    pb:          yD.priceToBook?.raw                  ?? rawM.pbAnnual ?? rawM.pbQuarterly ?? null,
    peg:         yK.pegRatio?.raw                     ?? null,
    evEbitda:    yK.enterpriseToEbitda?.raw           ?? null,
    revGrowth:   yF.revenueGrowth?.raw != null  ? yPct(yF.revenueGrowth.raw)  : normPct(rawM.revenueGrowthTTMYoy ?? rawM.revenueGrowth3Y ?? null),
    epsGrowth:   yF.earningsGrowth?.raw != null ? yPct(yF.earningsGrowth.raw) : normPct(rawM.epsGrowthTTMYoy ?? rawM.epsGrowth3Y ?? null),
    grossMargin: yF.grossMargins?.raw != null    ? yPct(yF.grossMargins.raw)   : normPct(rawM.grossMarginTTM ?? rawM.grossMarginAnnual ?? null),
    opMargin:    yF.operatingMargins?.raw != null ? yPct(yF.operatingMargins.raw) : normPct(rawM.operatingMarginTTM ?? rawM.operatingMarginAnnual ?? null),
    netMargin:   yF.profitMargins?.raw != null   ? yPct(yF.profitMargins.raw)  : normPct(rawM.netMarginTTM ?? rawM.netMarginAnnual ?? null),
    roe:         yF.returnOnEquity?.raw != null  ? yPct(yF.returnOnEquity.raw) : normPct(rawM.roeTTM ?? rawM.roe5Y ?? null),
    roa:         yF.returnOnAssets?.raw != null  ? yPct(yF.returnOnAssets.raw) : normPct(rawM.roaTTM ?? null),
    // Yahoo D/E is in % form (e.g. 164 = 1.64x), Finnhub is ratio
    deRatio:     yF.debtToEquity?.raw != null    ? parseFloat((yF.debtToEquity.raw / 100).toFixed(2)) : (rawM["totalDebt/equityAnnual"] ?? rawM["totalDebt/equityQuarterly"] ?? null),
    currentRatio: yF.currentRatio?.raw           ?? rawM.currentRatioQuarterly ?? rawM.currentRatioAnnual ?? null,
    quickRatio:  yF.quickRatio?.raw              ?? null,
    freeCashflow: yF.freeCashflow?.raw != null   ? parseFloat((yF.freeCashflow.raw / 1e9).toFixed(2)) : null,
    operatingCashflow: yF.operatingCashflow?.raw != null ? parseFloat((yF.operatingCashflow.raw / 1e9).toFixed(2)) : null,
    revenueActual: yF.totalRevenue?.raw != null  ? parseFloat((yF.totalRevenue.raw / 1e9).toFixed(2)) : null,
    beta:        yD.beta?.raw                    ?? rawM.beta ?? null,
    divYield:    yD.dividendYield?.raw != null   ? yPct(yD.dividendYield.raw) : (rawM.dividendYieldIndicatedAnnual ?? null),
  };

  // Derive PEG if missing
  if (m.peg == null && m.pe != null && m.pe > 0 && m.epsGrowth != null && m.epsGrowth > 0) {
    m.peg = parseFloat((m.pe / m.epsGrowth).toFixed(2));
  }

  // ── 6. Analyst consensus ──────────────────────────────────────────────────
  const recKeyRaw = yF.recommendationKey ?? null;
  const recLabelMap = { strongBuy: "强烈买入", buy: "买入", hold: "持有", underperform: "低配", sell: "卖出" };
  const targetMean  = yF.targetMeanPrice?.raw ?? null;
  const targetHigh  = yF.targetHighPrice?.raw ?? null;
  const targetLow   = yF.targetLowPrice?.raw  ?? null;
  const analystCount = yF.numberOfAnalystOpinions?.raw ?? null;
  const targetUpside = (targetMean && price)
    ? parseFloat(((targetMean / price - 1) * 100).toFixed(1)) : null;

  const analyst = {
    recKey:   recKeyRaw,
    recLabel: recLabelMap[recKeyRaw] ?? null,
    analystCount,
    targetMean,
    targetHigh,
    targetLow,
    targetUpside,
  };

  // ── 7. Quarterly EPS history (last 4 quarters) ────────────────────────────
  const quarterlyEPS = (yE?.earningsChart?.quarterly ?? []).slice(-4).map(q => ({
    period:   q.date ?? "",
    actual:   q.actual?.raw   ?? null,
    estimate: q.estimate?.raw ?? null,
    beat:     (q.actual?.raw != null && q.estimate?.raw != null) ? q.actual.raw >= q.estimate.raw : null,
  }));

  // ── 8. Five-axis scoring ───────────────────────────────────────────────────
  const scores = {
    trend:     scoreTrend({ price, ma50, ma200, rsi, wk52High: wk52H, wk52Low: wk52L }),
    valuation: scoreValuation({ pe: m.pe, forwardPE: m.forwardPE, peg: m.peg, ps: m.ps }),
    growth:    scoreGrowth({ revGrowth: m.revGrowth, epsGrowth: m.epsGrowth }),
    health:    scoreHealth({ netMargin: m.netMargin, grossMargin: m.grossMargin, roe: m.roe, deRatio: m.deRatio, currentRatio: m.currentRatio }),
    analyst:   scoreAnalyst({ targetUpside, recKey: recKeyRaw, analystCount }),
  };

  // Weighted: trend 25%, valuation 20%, growth 20%, health 15%, analyst 20%
  const overall = Math.round(
    (scores.trend     ?? 50) * 0.25 +
    (scores.valuation ?? 50) * 0.20 +
    (scores.growth    ?? 50) * 0.20 +
    (scores.health    ?? 50) * 0.15 +
    (scores.analyst   ?? 50) * 0.20
  );
  scores.overall = overall;
  scores.grade   = gradeFrom(overall);

  // Earnings timing
  const daysToEarnings = nextEarnings
    ? Math.round((new Date(nextEarnings) - new Date()) / 86400000) : null;
  const earningsRisk = daysToEarnings != null
    ? (daysToEarnings <= 14 ? "high" : daysToEarnings <= 30 ? "moderate" : "low") : null;

  // ── 9. Build Claude prompt ─────────────────────────────────────────────────
  const fmtV = (v, d = 1, s = "x") => v != null ? `${parseFloat(v.toFixed(d))}${s}` : "N/A";
  const fmtP = v => v != null ? `${v >= 0 ? "+" : ""}${parseFloat(v.toFixed(1))}%` : "N/A";

  const mcStr = marketCap
    ? marketCap > 200000 ? `$${(marketCap / 1e6).toFixed(1)}万亿`
    : marketCap > 10000  ? `$${(marketCap / 1000).toFixed(0)}亿`
    : `$${marketCap.toFixed(0)}百万` : "N/A";

  const trendStr = price && ma50 && ma200
    ? price > ma50 && ma50 > ma200 ? "多头排列 price>MA50>MA200"
    : price > ma50                  ? "价格在MA50之上，MA50≤MA200"
    : price > ma200                 ? "价格在MA200之上但低于MA50"
    : "价格低于MA200（空头区域）" : "数据不足";

  const analystStr = analyst.recLabel
    ? `${analyst.recLabel}（${analystCount ?? "?"}位分析师）| 目标均价 $${targetMean?.toFixed(1) ?? "N/A"}（${targetUpside != null ? (targetUpside >= 0 ? "+" : "") + targetUpside + "%" : "N/A"}上涨空间）| 区间 $${targetLow?.toFixed(0) ?? "N/A"}~$${targetHigh?.toFixed(0) ?? "N/A"}`
    : "暂无华尔街分析师数据";

  const qepsStr = quarterlyEPS.length
    ? quarterlyEPS.map(q =>
        `${q.period}: 实$${q.actual?.toFixed(2) ?? "N/A"} 预$${q.estimate?.toFixed(2) ?? "N/A"} ${q.beat != null ? (q.beat ? "✓超预期" : "✗未达预期") : ""}`
      ).join(" | ")
    : "暂无季度数据";

  const fcfStr = m.freeCashflow != null
    ? `FCF ${m.freeCashflow >= 0 ? "$" : "-$"}${Math.abs(m.freeCashflow).toFixed(1)}B | OCF $${m.operatingCashflow?.toFixed(1) ?? "N/A"}B`
    : "现金流数据不可用";

  const prompt = `你是顶级美股分析师。请对以下股票做深度、全面、有见地的分析，避免泛泛而谈。

【基本信息】
代码：${sym} | 公司：${name} | 行业：${industry ?? "未知"}
交易所：${exchange ?? "US"} | 市值：${mcStr} | 上市年份：${ipoYear ?? "N/A"}

【技术面数据】
价格 $${price?.toFixed(2) ?? "N/A"} | MA50 $${ma50?.toFixed(2) ?? "N/A"} | MA200 $${ma200?.toFixed(2) ?? "N/A"}
RSI(14) ${rsi?.toFixed(1) ?? "N/A"} | 52周区间 $${wk52L?.toFixed(1) ?? "N/A"}~$${wk52H?.toFixed(1) ?? "N/A"} | 当前处于52周${wk52Pos ?? "N/A"}%分位
趋势结构：${trendStr}

【估值指标】
PE(TTM) ${fmtV(m.pe)} | 远期PE ${fmtV(m.forwardPE)} | PEG ${fmtV(m.peg)} | EV/EBITDA ${fmtV(m.evEbitda)}
PS ${fmtV(m.ps)} | PB ${fmtV(m.pb)}

【成长性】
收入增速(YoY) ${fmtP(m.revGrowth)} | EPS增速(YoY) ${fmtP(m.epsGrowth)}${m.revenueActual != null ? ` | TTM营收 $${m.revenueActual.toFixed(1)}B` : ""}

【盈利质量】
毛利率 ${m.grossMargin != null ? m.grossMargin.toFixed(1) + "%" : "N/A"} | 营业利润率 ${m.opMargin != null ? m.opMargin.toFixed(1) + "%" : "N/A"} | 净利率 ${m.netMargin != null ? m.netMargin.toFixed(1) + "%" : "N/A"}
ROE ${m.roe != null ? m.roe.toFixed(1) + "%" : "N/A"} | ROA ${m.roa != null ? m.roa.toFixed(1) + "%" : "N/A"}
${fcfStr}

【财务健康】
D/E比率 ${m.deRatio?.toFixed(2) ?? "N/A"} | 流动比率 ${m.currentRatio?.toFixed(2) ?? "N/A"} | 速动比率 ${m.quickRatio?.toFixed(2) ?? "N/A"}
Beta ${m.beta?.toFixed(2) ?? "N/A"} | 股息率 ${m.divYield?.toFixed(2) ?? "N/A"}%

【季度EPS趋势（最近4季）】
${qepsStr}

【华尔街分析师共识】
${analystStr}

【近期新闻（最多8条）】
${news.length ? news.join("\n") : "暂无近期新闻"}

${nextEarnings ? `【财报日历】下次财报约 ${nextEarnings}（${daysToEarnings}天后），风险等级：${earningsRisk === "high" ? "高（两周内）" : earningsRisk === "moderate" ? "中（一个月内）" : "低"}` : ""}

【系统量化评分（供参考）】
技术面 ${scores.trend ?? "N/A"}/100 | 估值 ${scores.valuation}/100 | 成长性 ${scores.growth}/100 | 财务健康 ${scores.health}/100 | 分析师 ${scores.analyst ?? "N/A"}/100 | 综合 ${overall}/100（${scores.grade}级）

请按以下7段格式做深度分析，每段标题用【】，不加Markdown，不重复数字，总字数≤800字：

【公司简介】
（核心业务和主要收入来源；行业地位和护城河；近期最重要的战略变化或催化剂。直接揭示本质，3-4句。）

【估值分析】
（TTM PE与远期PE差异说明了什么？PEG/EV-EBITDA是否合理？与行业或主要竞争对手相比估值偏高/低/合理？分析师目标价隐含的上涨空间是否可信？2-3句核心判断。）

【成长性】
（收入/EPS增速趋势：加速or减速？近4季度EPS超预期/未达预期比例反映什么？主要增长驱动力和未来12个月预期方向。2-3句。）

【盈利与现金流】
（利润率水平及近期趋势；FCF是否充裕（正/负/改善）；FCF与净利润差异是否有隐患；ROE资本回报质量判断。2-3句。）

【财务健康】
（资产负债表健康度：负债水平合理吗？流动性/速动比率是否安全？有无偿债或再融资风险？2句核心判断。）

【技术面】
（当前趋势结构的意义；RSI动量是过热/超卖/中性？关键支撑位/阻力位各在哪里；建议等什么技术信号才适合入场。2句明确判断。）

【综合建议】
（将量化评分与华尔街分析师共识综合——是否一致？若分歧原因是什么？具体操作思路：建议入场区域、止损参考位、最值得警惕的1-2个风险点。如有财报风险需特别说明。3-4句。）

RECOMMENDATION:{"action":"watch","label":"可以关注","entry":"${ma50 ? '回调至MA50($' + ma50.toFixed(0) + ')区域' : '等待技术信号'}"}

注意：最后一行必须是RECOMMENDATION:，JSON格式，action只能是 immediate/watch/wait/avoid，label对应：立即关注/可以关注/等待信号/建议回避。请根据综合分析自主判断。`;

  // ── 10. Call Claude Opus 4.8 for deep analysis ────────────────────────────
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
        model: "claude-opus-4-8",
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(55000),
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

  // ── 11. Assemble result ────────────────────────────────────────────────────
  const result = {
    sym, name, industry, exchange, marketCap, marketCapStr: mcStr, ipoYear,
    price, wk52High: wk52H, wk52Low: wk52L, wk52Pos,
    ma50:  ma50  != null ? parseFloat(ma50.toFixed(2))  : null,
    ma200: ma200 != null ? parseFloat(ma200.toFixed(2)) : null,
    rsi:   rsi   != null ? parseFloat(rsi.toFixed(1))   : null,
    scores, metrics: m,
    analyst, quarterlyEPS,
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
