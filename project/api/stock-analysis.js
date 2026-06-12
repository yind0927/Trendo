// GET /api/stock-analysis?sym=AAPL[&force=1]
// Five-axis AI stock analysis: technical(EMA) + valuation + growth + health + analyst
// Data: Yahoo v7 quote (primary, no-auth) + Yahoo quoteSummary (crumb) + Finnhub fallback
// Redis cache: trendo:stock_analysis:SYM:YYYY-MM-DD (TTL 28800s / 8h)

// ── Technical helpers ─────────────────────────────────────────────────────────
function calcEMA(closes, n) {
  if (closes.length < n) return null;
  const k = 2 / (n + 1);
  let ema = closes.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
  return ema;
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

function normPct(v) {
  if (v == null || !isFinite(v)) return null;
  if (Math.abs(v) > 500) return null;
  return Math.abs(v) < 2 ? parseFloat((v * 100).toFixed(2)) : parseFloat(v.toFixed(2));
}

// ── Yahoo Finance helpers ─────────────────────────────────────────────────────
// Fetch crumb for quoteSummary authentication
async function getYahooCrumb(headers) {
  try {
    const r = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers, signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return '';
    const t = await r.text();
    return (t && t.length < 60 && !t.includes('<')) ? t.trim() : '';
  } catch (_) { return ''; }
}

// Try Yahoo quoteSummary for BASIC modules (price+summaryDetail) — works WITHOUT crumb
// These give: PE, forwardPE, PS, PB, beta, dividend, 52w, marketCap
async function fetchYahooQSBasic(sym, headers) {
  const mods = 'price%2CsummaryDetail';
  const enc  = encodeURIComponent(sym);
  for (const url of [
    `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${enc}?modules=${mods}`,
    `https://query2.finance.yahoo.com/v11/finance/quoteSummary/${enc}?modules=${mods}`,
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${enc}?modules=${mods}`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${enc}?modules=${mods}`,
  ]) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      const d = await r.json();
      if (d?.quoteSummary?.result?.[0]) return d.quoteSummary.result[0];
    } catch (_) {}
  }
  return null;
}

// Try Yahoo quoteSummary for FINANCIAL modules — needs crumb (margins/growth/FCF/analyst)
async function fetchYahooQSFin(sym, headers, crumb) {
  const mods = 'financialData%2CdefaultKeyStatistics%2Cearnings';
  const enc  = encodeURIComponent(sym);
  const urls = [
    `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${enc}?modules=${mods}`,
    `https://query2.finance.yahoo.com/v11/finance/quoteSummary/${enc}?modules=${mods}`,
    ...(crumb ? [`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${enc}?modules=${mods}&crumb=${encodeURIComponent(crumb)}`] : []),
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${enc}?modules=${mods}`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${enc}?modules=${mods}`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
      if (!r.ok) continue;
      const d = await r.json();
      if (d?.quoteSummary?.result?.[0]) return d.quoteSummary.result[0];
    } catch (_) {}
  }
  return null;
}

// ── Five-axis scoring ─────────────────────────────────────────────────────────
function scoreTrend({ price, ema50, ema200, rsi, wk52High, wk52Low }) {
  if (!price) return null;
  let s = 50;
  if (ema50 && ema200) {
    if (price > ema50 && ema50 > ema200) s += 35;
    else if (price > ema50)              s += 15;
    else if (price > ema200)             s += 5;
    else                                 s -= 20;
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
    if (ps < 1.5) s += 5; else if (ps > 20) s -= 10; else if (ps > 10) s -= 5;
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
    if (roe > 30) s += 12; else if (roe > 15) s += 6; else if (roe < 0) s -= 8;
  }
  if (deRatio != null) {
    if (deRatio < 0.3) s += 5; else if (deRatio > 3.0) s -= 12; else if (deRatio > 2.0) s -= 6;
  }
  if (currentRatio != null) {
    if (currentRatio >= 2) s += 5; else if (currentRatio < 1) s -= 8;
  }
  return Math.max(0, Math.min(100, Math.round(s)));
}

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

  // ── 2. Parallel Phase 1 (all independent fetches + crumb) ─────────────────
  const yH = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
  };

  const [profileR, crumbR, yv7R, metricsR, newsR, historyR, earningsR] = await Promise.allSettled([

    // Finnhub profile
    fhKey ? fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${fhKey}`, { signal: AbortSignal.timeout(5000) })
      .then(r => r.json()).catch(() => null) : Promise.resolve(null),

    // Yahoo crumb (for quoteSummary auth)
    getYahooCrumb(yH),

    // Yahoo v7 quote — most reliable source for PE/fwdPE/beta/yield/52w/mktcap
    fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}`, { headers: yH, signal: AbortSignal.timeout(5000) })
      .then(r => r.ok ? r.json() : null).catch(() => null),

    // Finnhub metric/all (fallback for margins/growth/ratios)
    fhKey ? fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${sym}&metric=all&token=${fhKey}`, { signal: AbortSignal.timeout(5000) })
      .then(r => r.json()).catch(() => null) : Promise.resolve(null),

    // Finnhub news (7 days, top 8 headlines)
    fhKey ? (async () => {
      const to   = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${sym}&from=${from}&to=${to}&token=${fhKey}`, { signal: AbortSignal.timeout(5000) });
      const a = await r.json();
      return Array.isArray(a) ? a.filter(x => x.headline?.length > 10).slice(0, 8).map(x => x.headline.trim()) : [];
    })().catch(() => []) : Promise.resolve([]),

    // Yahoo chart 400d (technical — EMA base)
    (async () => {
      const from = Math.floor(Date.now() / 1000) - 400 * 86400;
      const to   = Math.floor(Date.now() / 1000) + 86400;
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&period1=${from}&period2=${to}`,
        { headers: yH, signal: AbortSignal.timeout(7000) }
      );
      if (!r.ok) return null;
      const d = await r.json();
      const chart = d?.chart?.result?.[0];
      if (!chart) return null;
      const closes = (chart.indicators?.quote?.[0]?.close ?? []).filter(c => c != null);
      return { closes, meta: chart.meta };
    })().catch(() => null),

    // Finnhub earnings calendar
    fhKey ? (async () => {
      const to   = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
      const from = new Date().toISOString().slice(0, 10);
      const r = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${sym}&token=${fhKey}`, { signal: AbortSignal.timeout(5000) });
      const d = await r.json();
      return d?.earningsCalendar?.[0]?.date ?? null;
    })().catch(() => null) : Promise.resolve(null),
  ]);

  const profile      = profileR.status  === "fulfilled" ? profileR.value  : null;
  const crumb        = crumbR.status    === "fulfilled" ? crumbR.value    : '';
  const yv7          = yv7R.status      === "fulfilled" ? (yv7R.value?.quoteResponse?.result?.[0] ?? null) : null;
  const rawM         = metricsR.status  === "fulfilled" ? (metricsR.value?.metric ?? {}) : {};
  const news         = newsR.status     === "fulfilled" ? (newsR.value ?? []) : [];
  const history      = historyR.status  === "fulfilled" ? historyR.value : null;
  const nextEarnings = earningsR.status === "fulfilled" ? earningsR.value : null;

  // ── 3. Phase 2: split quoteSummary requests (parallel) ────────────────────
  // Basic (price+summaryDetail) works WITHOUT crumb → always gets PE/fwdPE/PS/PB/beta
  // Financial (financialData+stats+earnings) tries crumb → margins/growth/FCF/analyst
  const [ysBasic, ysFin] = await Promise.all([
    fetchYahooQSBasic(sym, yH),
    fetchYahooQSFin(sym, yH, crumb),
  ]);

  // Unpack basic modules (price module has most valuation data)
  const yPrice = ysBasic?.price        ?? {};
  const yD     = ysBasic?.summaryDetail ?? {};
  // Unpack financial modules
  const yF     = ysFin?.financialData        ?? {};
  const yK     = ysFin?.defaultKeyStatistics ?? {};
  const yE     = ysFin?.earnings             ?? null;

  // ── 4. Technical calculations (EMA) ───────────────────────────────────────
  const closes = history?.closes ?? [];
  const price  = history?.meta?.regularMarketPrice
    ?? yPrice.regularMarketPrice?.raw ?? yv7?.regularMarketPrice
    ?? closes[closes.length - 1] ?? null;
  const name      = profile?.name ?? yPrice.longName ?? yPrice.shortName ?? yv7?.longName ?? yv7?.shortName ?? sym;
  const industry  = profile?.finnhubIndustry ?? null;
  const exchange  = profile?.exchange ?? null;
  const ipoYear   = profile?.ipo?.slice(0, 4) ?? null;

  // Market cap: Finnhub (millions) > Yahoo price module (bytes) > Yahoo v7 (bytes)
  const marketCap = profile?.marketCapitalization
    ?? (yPrice.marketCap?.raw != null ? yPrice.marketCap.raw / 1e6 : null)
    ?? (yv7?.marketCap != null ? yv7.marketCap / 1e6 : null)
    ?? (yD.marketCap?.raw != null ? yD.marketCap.raw / 1e6 : null);

  const ema50   = calcEMA(closes, 50);
  const ema200  = calcEMA(closes, 200);
  const rsi     = calcRSI(closes, 14);

  // 52-week range: summaryDetail > v7 fallback
  const wk52H = yD.fiftyTwoWeekHigh?.raw ?? yPrice.fiftyTwoWeekHigh?.raw ?? yv7?.fiftyTwoWeekHigh ?? rawM["52WeekHigh"] ?? null;
  const wk52L = yD.fiftyTwoWeekLow?.raw  ?? yPrice.fiftyTwoWeekLow?.raw  ?? yv7?.fiftyTwoWeekLow  ?? rawM["52WeekLow"]  ?? null;
  const wk52Pos = (price && wk52H && wk52L && wk52H > wk52L)
    ? Math.round((price - wk52L) / (wk52H - wk52L) * 100) : null;

  // ── 5. Merge financial metrics ────────────────────────────────────────────
  // Priority: Yahoo price module → Yahoo summaryDetail → Yahoo financialData → Yahoo v7 → Finnhub
  const yPct = v => v != null ? parseFloat((v * 100).toFixed(2)) : null;

  const m = {
    // Valuation — price module is primary (most direct, no adjustments)
    pe:          yPrice.trailingPE?.raw   ?? yD.trailingPE?.raw   ?? yv7?.trailingPE  ?? rawM.peNormalizedAnnual ?? rawM.peExclExtraTTM ?? null,
    forwardPE:   yPrice.forwardPE?.raw    ?? yD.forwardPE?.raw    ?? yv7?.forwardPE   ?? null,
    ps:          yD.priceToSalesTrailing12Months?.raw ?? yv7?.priceToSalesRatioTTM ?? rawM.psTTM ?? rawM.psAnnual ?? null,
    pb:          yPrice.priceToBook?.raw  ?? yD.priceToBook?.raw  ?? yv7?.priceToBook ?? rawM.pbAnnual ?? null,
    peg:         yK.pegRatio?.raw         ?? yv7?.pegRatio        ?? null,
    evEbitda:    yK.enterpriseToEbitda?.raw ?? null,
    // Growth — financial module (Yahoo QS fin)
    revGrowth:   yF.revenueGrowth?.raw != null  ? yPct(yF.revenueGrowth.raw)  : normPct(rawM.revenueGrowthTTMYoy ?? rawM.revenueGrowth3Y ?? null),
    epsGrowth:   yF.earningsGrowth?.raw != null ? yPct(yF.earningsGrowth.raw) : normPct(rawM.epsGrowthTTMYoy ?? rawM.epsGrowth3Y ?? null),
    // Margins
    grossMargin: yF.grossMargins?.raw != null     ? yPct(yF.grossMargins.raw)     : normPct(rawM.grossMarginTTM ?? rawM.grossMarginAnnual ?? null),
    opMargin:    yF.operatingMargins?.raw != null ? yPct(yF.operatingMargins.raw) : normPct(rawM.operatingMarginTTM ?? rawM.operatingMarginAnnual ?? null),
    netMargin:   yF.profitMargins?.raw != null    ? yPct(yF.profitMargins.raw)    : normPct(rawM.netMarginTTM ?? rawM.netMarginAnnual ?? null),
    roe:         yF.returnOnEquity?.raw != null   ? yPct(yF.returnOnEquity.raw)   : normPct(rawM.roeTTM ?? rawM.roe5Y ?? null),
    roa:         yF.returnOnAssets?.raw != null   ? yPct(yF.returnOnAssets.raw)   : normPct(rawM.roaTTM ?? null),
    // Yahoo D/E is %-form (e.g. 164 = 1.64x); Finnhub is ratio
    deRatio:     yF.debtToEquity?.raw != null    ? parseFloat((yF.debtToEquity.raw / 100).toFixed(2)) : (rawM["totalDebt/equityAnnual"] ?? rawM["totalDebt/equityQuarterly"] ?? null),
    currentRatio: yF.currentRatio?.raw           ?? rawM.currentRatioQuarterly ?? rawM.currentRatioAnnual ?? null,
    quickRatio:  yF.quickRatio?.raw              ?? null,
    freeCashflow: yF.freeCashflow?.raw != null   ? parseFloat((yF.freeCashflow.raw / 1e9).toFixed(2)) : null,
    operatingCashflow: yF.operatingCashflow?.raw != null ? parseFloat((yF.operatingCashflow.raw / 1e9).toFixed(2)) : null,
    revenueActual: yF.totalRevenue?.raw != null  ? parseFloat((yF.totalRevenue.raw / 1e9).toFixed(2)) : null,
    beta:        yD.beta?.raw ?? yv7?.beta ?? rawM.beta ?? null,
    divYield:    (yD.dividendYield?.raw != null ? yPct(yD.dividendYield.raw) : null)
                   ?? (yv7?.trailingAnnualDividendYield ?? yv7?.dividendYield)
                   ?? (rawM.dividendYieldIndicatedAnnual ?? null),
    epsForward:  yv7?.epsForward ?? null,
    epsTTM:      yv7?.epsTrailingTwelveMonths ?? null,
  };

  // Derive PEG if missing
  if (m.peg == null && m.pe != null && m.pe > 0 && m.epsGrowth != null && m.epsGrowth > 0) {
    m.peg = parseFloat((m.pe / m.epsGrowth).toFixed(2));
  }

  // ── 6. Analyst consensus ──────────────────────────────────────────────────
  const recKeyRaw    = yF.recommendationKey ?? null;
  const recLabelMap  = { strongBuy: "强烈买入", buy: "买入", hold: "持有", underperform: "低配", sell: "卖出" };
  const targetMean   = yF.targetMeanPrice?.raw ?? null;
  const targetHigh   = yF.targetHighPrice?.raw ?? null;
  const targetLow    = yF.targetLowPrice?.raw  ?? null;
  const analystCount = yF.numberOfAnalystOpinions?.raw ?? null;
  const targetUpside = (targetMean && price)
    ? parseFloat(((targetMean / price - 1) * 100).toFixed(1)) : null;

  const analyst = { recKey: recKeyRaw, recLabel: recLabelMap[recKeyRaw] ?? null, analystCount, targetMean, targetHigh, targetLow, targetUpside };

  // ── 7. Quarterly EPS history ──────────────────────────────────────────────
  const quarterlyEPS = (yE?.earningsChart?.quarterly ?? []).slice(-4).map(q => ({
    period:   q.date ?? "",
    actual:   q.actual?.raw   ?? null,
    estimate: q.estimate?.raw ?? null,
    beat:     (q.actual?.raw != null && q.estimate?.raw != null) ? q.actual.raw >= q.estimate.raw : null,
  }));

  // ── 8. Five-axis scoring ───────────────────────────────────────────────────
  const scores = {
    trend:     scoreTrend({ price, ema50, ema200, rsi, wk52High: wk52H, wk52Low: wk52L }),
    valuation: scoreValuation({ pe: m.pe, forwardPE: m.forwardPE, peg: m.peg, ps: m.ps }),
    growth:    scoreGrowth({ revGrowth: m.revGrowth, epsGrowth: m.epsGrowth }),
    health:    scoreHealth({ netMargin: m.netMargin, grossMargin: m.grossMargin, roe: m.roe, deRatio: m.deRatio, currentRatio: m.currentRatio }),
    analyst:   scoreAnalyst({ targetUpside, recKey: recKeyRaw, analystCount }),
  };
  const overall = Math.round(
    (scores.trend     ?? 50) * 0.25 +
    (scores.valuation ?? 50) * 0.20 +
    (scores.growth    ?? 50) * 0.20 +
    (scores.health    ?? 50) * 0.15 +
    (scores.analyst   ?? 50) * 0.20
  );
  scores.overall = overall;
  scores.grade   = gradeFrom(overall);

  const daysToEarnings = nextEarnings ? Math.round((new Date(nextEarnings) - new Date()) / 86400000) : null;
  const earningsRisk   = daysToEarnings != null ? (daysToEarnings <= 14 ? "high" : daysToEarnings <= 30 ? "moderate" : "low") : null;

  // ── 9. Build Claude prompt ─────────────────────────────────────────────────
  const fmtN = (v, d = 1) => v != null ? parseFloat(v.toFixed(d)) : "N/A";
  const fmtV = (v, d = 1, s = "x") => v != null ? `${parseFloat(v.toFixed(d))}${s}` : "N/A";
  const fmtP = v => v != null ? `${v >= 0 ? "+" : ""}${parseFloat(v.toFixed(1))}%` : "N/A";
  const fmtM = v => v != null ? `${parseFloat(v.toFixed(1))}%` : "N/A";

  const mcStr = marketCap
    ? marketCap > 200000 ? `$${(marketCap / 1e6).toFixed(1)}万亿`
    : marketCap > 10000  ? `$${(marketCap / 1000).toFixed(0)}亿`
    : `$${marketCap.toFixed(0)}百万` : "N/A";

  const trendStr = price && ema50 && ema200
    ? price > ema50 && ema50 > ema200 ? "多头排列：price > EMA50 > EMA200"
    : price > ema50                    ? "价格在EMA50之上，EMA50≤EMA200（趋势分化）"
    : price > ema200                   ? "价格在EMA200之上但低于EMA50（短期走弱）"
    : "价格低于EMA200（空头区域）" : "数据不足";

  const qepsStr = quarterlyEPS.length
    ? quarterlyEPS.map(q =>
        `${q.period}：实$${q.actual?.toFixed(2) ?? "N/A"} vs 预$${q.estimate?.toFixed(2) ?? "N/A"} ${q.beat != null ? (q.beat ? "✓超预期" : "✗未达预期") : ""}`
      ).join(" | ")
    : "暂无季度数据";

  const analystLine = analyst.recLabel
    ? `${analyst.recLabel}（${analystCount ?? "?"}位分析师） | 目标均价 $${targetMean?.toFixed(1) ?? "N/A"}（${targetUpside != null ? (targetUpside >= 0 ? "+" : "") + targetUpside + "%" : "N/A"}空间） | 区间 $${targetLow?.toFixed(0) ?? "N/A"}~$${targetHigh?.toFixed(0) ?? "N/A"}`
    : "暂无华尔街分析师数据";

  const fcfLine = m.freeCashflow != null
    ? `FCF ${m.freeCashflow >= 0 ? "$" : "-$"}${Math.abs(m.freeCashflow).toFixed(1)}B | OCF $${m.operatingCashflow?.toFixed(1) ?? "N/A"}B`
    : "现金流数据不可用";

  const prompt = `你是顶级美股基金经理兼分析师，请对 ${sym}（${name}）做深度、专业、有见地的分析。所有判断必须有具体数据支撑，避免空话。

【基本信息】
代码：${sym} | 公司：${name} | 行业：${industry ?? "未知"} | 交易所：${exchange ?? "US"}
市值：${mcStr} | 上市：${ipoYear ?? "N/A"} | Beta：${fmtN(m.beta, 2)}

【技术面（EMA）】
价格 $${price?.toFixed(2) ?? "N/A"} | EMA50 $${ema50?.toFixed(2) ?? "N/A"} | EMA200 $${ema200?.toFixed(2) ?? "N/A"}
RSI(14) ${rsi?.toFixed(1) ?? "N/A"} | 52周区间 $${wk52L?.toFixed(1) ?? "N/A"}~$${wk52H?.toFixed(1) ?? "N/A"} | 处于52周${wk52Pos ?? "N/A"}%分位
趋势：${trendStr}

【估值】
PE(TTM) ${fmtV(m.pe)} | 远期PE ${fmtV(m.forwardPE)} | PEG ${fmtV(m.peg)} | EV/EBITDA ${fmtV(m.evEbitda)}
PS ${fmtV(m.ps)} | PB ${fmtV(m.pb)} | 前瞻EPS $${fmtN(m.epsForward)} | TTM EPS $${fmtN(m.epsTTM)}

【成长性】
收入增速(YoY) ${fmtP(m.revGrowth)} | EPS增速(YoY) ${fmtP(m.epsGrowth)}${m.revenueActual != null ? ` | TTM营收 $${m.revenueActual.toFixed(1)}B` : ""}
季度EPS：${qepsStr}

【盈利质量】
毛利率 ${fmtM(m.grossMargin)} | 营业利润率 ${fmtM(m.opMargin)} | 净利率 ${fmtM(m.netMargin)}
ROE ${fmtM(m.roe)} | ROA ${fmtM(m.roa)} | ${fcfLine}

【财务健康】
D/E ${fmtN(m.deRatio, 2)} | 流动比率 ${fmtN(m.currentRatio, 2)} | 速动比率 ${fmtN(m.quickRatio, 2)}

【华尔街分析师共识】
${analystLine}

【近期新闻（最多8条）】
${news.length ? news.join("\n") : "暂无近期新闻"}

${nextEarnings ? `【财报日历】下次财报：${nextEarnings}（${daysToEarnings}天后），风险：${earningsRisk === "high" ? "高" : earningsRisk === "moderate" ? "中" : "低"}` : ""}

【系统量化评分】
技术${scores.trend ?? "N/A"}/100 | 估值${scores.valuation}/100 | 成长${scores.growth}/100 | 财务${scores.health}/100 | 分析师${scores.analyst ?? "N/A"}/100 | 综合${overall}/100（${scores.grade}级）

---
请按以下7段格式，每段用 bullet point（• 开头），总字数≤900字。格式要求：关键数字、重要判断词（如"高估""强烈买入""警惕"）用**加粗**标注；其余不加任何Markdown符号；必须引用具体数字，不说空话，体现专业判断和独立见解：

【公司简介】
• 核心业务：[主要产品/服务和收入结构，说清楚钱从哪来]
• 护城河：[具体竞争壁垒，不是行业标签]
• 近期最重要催化剂：[具体事件或战略转变]
• 主要威胁：[最值得关注的竞争/行业/监管风险]

【估值分析】
• PE(TTM)/远期PE：[结合增速说是否合理，与主要竞争对手比高/低]
• PEG/EV-EBITDA：[增长溢价有无支撑，给出明确判断]
• 分析师目标价：[$X 隐含+X% — 目标价是否可信，为何]
• 估值结论：[高估/低估/合理，一句话核心判断]

【成长性】
• 营收增速${fmtP(m.revGrowth)}：[驱动力是什么，有机增长还是其他]
• EPS增速与季度表现：[近4季beat/miss比例，趋势加速还是减速]
• 未来12个月预期：[增速区间预判及核心假设]
• 增长质量风险：[增长可持续的前提条件和潜在破坏因素]

【盈利与现金流】
• 净利率${fmtM(m.netMargin)}：[行业定位，趋势方向]
• ROE${fmtM(m.roe)}：[资本效率，是否依赖杠杆]
• FCF质量：[${fcfLine}的含义，FCF与净利润的关系（高/低质量信号）]
• 盈利风险：[利润率可能面临的压力点]

【财务健康】
• 资产负债：[D/E${fmtN(m.deRatio, 2)}，债务是战略性杠杆还是风险负担]
• 流动性：[流动/速动比率 — 短期偿付能力评估]
• 潜在隐患：[若有具体说明；若无，明确说财务状况健康]

【技术面】
• 趋势结构：[${trendStr}对交易者意味着什么]
• RSI${rsi?.toFixed(1) ?? "N/A"}动量：[超买/超卖/中性，结合近期走势]
• 关键价位：[支撑 $X（含义），阻力 $X（含义）]
• 入场信号：[建议等待什么技术确认，理想入场区域]

【综合建议】
• 核心判断：[一句话最重要结论，体现你的独立见解]
• 量化评分${overall}/100 vs 分析师共识${analyst.recLabel ?? "N/A"}：[一致/分歧，若分歧说明原因]
• 操作思路：[入场区域 $X~$Y，止损参考 $X（基于EMA或关键支撑），目标 $X]
• 最大风险：[最值得警惕的单一风险点]
${nextEarnings ? `• 财报风险：[${nextEarnings}，预期什么，如何应对]` : ""}

RECOMMENDATION:{"action":"watch","label":"可以关注","entry":"${ema50 ? '回调至EMA50($' + ema50.toFixed(0) + ')区域' : '等待技术信号'}"}

注意：最后一行必须是RECOMMENDATION:，JSON，action只能是 immediate/watch/wait/avoid，label：立即关注/可以关注/等待信号/建议回避。请自主判断。`;

  // ── 10. Claude Opus 4.8 ───────────────────────────────────────────────────
  let rawText = "";
  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": aiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
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

  let recommendation = { action: "watch", label: "可以关注", entry: "" };
  const recMatch = rawText.match(/RECOMMENDATION:\s*(\{[^}]+\})/);
  if (recMatch) { try { recommendation = JSON.parse(recMatch[1]); } catch (_) {} }
  const summary = rawText.replace(/RECOMMENDATION:.*$/m, "").trim();

  // ── 11. Assemble and cache ─────────────────────────────────────────────────
  const result = {
    sym, name, industry, exchange, marketCap, marketCapStr: mcStr, ipoYear,
    price, wk52High: wk52H, wk52Low: wk52L, wk52Pos,
    ema50:  ema50  != null ? parseFloat(ema50.toFixed(2))  : null,
    ema200: ema200 != null ? parseFloat(ema200.toFixed(2)) : null,
    rsi:    rsi    != null ? parseFloat(rsi.toFixed(1))    : null,
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
        body: JSON.stringify([["SET", cacheKey, JSON.stringify(result)], ["EXPIRE", cacheKey, 28800]]),
      });
    } catch (_) {}
  }

  res.setHeader("Cache-Control", "s-maxage=28800");
  res.json({ ...result, cached: false });
}
