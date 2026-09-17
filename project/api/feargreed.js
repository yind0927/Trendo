// Vercel serverless — CNN Fear & Greed Index proxy (avoids browser CORS).
// `?mode=rates` 分支返回 FRED 的宏观利率/信用利差（周期系统分析卡片的背景参照）。
// 挂在这里而不是新建文件：Vercel Hobby 的 12 个 serverless 函数已经用满，
// 而这两件事同属「Market 页的市场环境数据」，复用同一个入口是最省的做法。

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// FRED 的 fredgraph.csv 端点不需要 API key，直接返回 "DATE,SERIES" 两列 CSV。
// pol = 这个数走高对风险资产是好是坏，交给客户端着色（曲线不做风险着色）。
const FRED_SERIES = {
  real10: { id: "DFII10",        zh: "10年期实际利率", unit: "%", digits: 2, pol: "up-bad" },
  hy:     { id: "BAMLH0A0HYM2",  zh: "高收益债利差",   unit: "%", digits: 2, pol: "up-bad" },
  ig:     { id: "BAMLC0A0CM",    zh: "投资级债利差",   unit: "%", digits: 2, pol: "up-bad" },
  curve:  { id: "T10Y2Y",        zh: "10年−2年利差",   unit: "%", digits: 2, pol: "none"  },
};

// 多列 CSV → { [seriesId]: [{d, v}] }，跳过 FRED 用来表示停牌/假日的 "." 占位符。
// fredgraph.csv 支持 `id=A,B,C`，一次返回 `DATE,A,B,C` 的宽表——比 4 次请求快得多，
// 而 v763 实测四条各自请求全部 6s 超时，正是慢在「请求次数 × 这个端点本身的渲染开销」。
function parseFredWide(csv) {
  const lines = csv.trim().split("\n");
  const head = lines[0].split(",").map(s => s.trim());
  const out = {};
  head.slice(1).forEach(id => { out[id] = []; });
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const d = (cells[0] || "").trim();
    if (!d) continue;
    head.slice(1).forEach((id, i) => {
      const v = parseFloat(cells[i + 1]);
      if (Number.isFinite(v)) out[id].push({ d, v });
    });
  }
  return out;
}

// 备用端点：`/data/<ID>.txt` 是静态得多的纯文本表，主端点慢时用它兜底。
// 格式：若干行元数据 → 空行 → "DATE  VALUE" → 空白分隔的数据行。
function parseFredTxt(txt) {
  const out = [];
  for (const line of txt.split("\n")) {
    const m = line.trim().match(/^(\d{4}-\d{2}-\d{2})\s+(\S+)$/);
    if (!m) continue;
    const v = parseFloat(m[2]);
    if (Number.isFinite(v)) out.push({ d: m[1], v });
  }
  return out;
}

const fredFetch = (url, ms) =>
  fetch(url, { headers: { "User-Agent": UA, "Accept": "text/plain,text/csv,*/*" },
               signal: AbortSignal.timeout(ms) });

async function fetchCombined(ids, fromISO, ms) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${ids.join(",")}&cosd=${fromISO}`;
  const r = await fredFetch(url, ms);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseFredWide(await r.text());
}

async function fetchOneTxt(id, ms) {
  const r = await fredFetch(`https://fred.stlouisfed.org/data/${id}.txt`, ms);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ser = parseFredTxt(await r.text());
  if (!ser.length) throw new Error("empty series");
  return ser;
}

// ── Yahoo 代理兜底 ───────────────────────────────────────────────────────────
// v765：FRED 从 Vercel 连不上（v763 四条全 6s 超时，v764 合并请求后函数直接被
// 平台超时杀掉、返回 Vercel 自己的纯文本错误页）。Yahoo 的 chart 端点是全站已经
// 在用、确定可达的，拿它凑一组**代理指标**，让这块至少有东西看。
// 明确的取舍：这不是 FRED 那四条的等价物——没有 TIPS 实际利率、没有 2 年期、
// 更没有 OAS 期权调整利差，只是方向上同源的替代品，所以响应里标 source 让
// 客户端如实写明「代理口径」，并且不触发复核提示（阈值是按真实 OAS 定的）。
const YH_SYMS = ["%5ETNX", "%5EIRX", "HYG", "LQD", "IEF"];

async function yahooCloses(sym, ms) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y`;
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" },
                              signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const c = (await r.json())?.chart?.result?.[0];
  const ts = c?.timestamp || [], cl = c?.indicators?.quote?.[0]?.close || [];
  const out = [];
  ts.forEach((t, i) => {
    if (Number.isFinite(cl[i])) {
      out.push({ d: new Date(t * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
                 v: cl[i] });
    }
  });
  if (!out.length) throw new Error("empty series");
  return out;
}

// 两条序列逐日对齐后相除 —— 交易日偶有错位，按日期取交集才不会把不同天的价格相比
function ratioSeries(a, b) {
  const mb = new Map(b.map(x => [x.d, x.v]));
  return a.filter(x => mb.has(x.d) && mb.get(x.d)).map(x => ({ d: x.d, v: x.v / mb.get(x.d) }));
}
function diffSeries(a, b) {
  const mb = new Map(b.map(x => [x.d, x.v]));
  return a.filter(x => mb.has(x.d)).map(x => ({ d: x.d, v: x.v - mb.get(x.d) }));
}

async function yahooProxy(ms) {
  const got = await Promise.allSettled(YH_SYMS.map(s => yahooCloses(s, ms)));
  const S = {};
  YH_SYMS.forEach((s, i) => { if (got[i].status === "fulfilled") S[s] = got[i].value; });
  const tnx = S["%5ETNX"], irx = S["%5EIRX"], hyg = S.HYG, lqd = S.LQD, ief = S.IEF;
  const out = {};
  if (tnx) out.real10 = { zh: "10年期名义利率", unit: "%", digits: 2, pol: "up-bad", ser: tnx };
  if (hyg && ief) out.hy = { zh: "高收益债/国债 比值", unit: "", digits: 3, pol: "down-bad",
                             ser: ratioSeries(hyg, ief) };
  if (lqd && ief) out.ig = { zh: "投资级债/国债 比值", unit: "", digits: 3, pol: "down-bad",
                             ser: ratioSeries(lqd, ief) };
  if (tnx && irx) out.curve = { zh: "10年−3月利差", unit: "%", digits: 2, pol: "none",
                                ser: diffSeries(tnx, irx) };
  return out;
}

// 序列 → 展示用的 { last, date, prev, prevDate, chg }（3 个月 ≈ 63 个交易日）
function summarize(meta, ser) {
  const last = ser[ser.length - 1];
  const back = ser[Math.max(0, ser.length - 1 - 63)];
  const { ser: _drop, id: _id, ...rest } = meta;
  return { ...rest, last: last.v, date: last.d, prev: back.v, prevDate: back.d,
           chg: +(last.v - back.v).toFixed(4) };
}

async function ratesHandler(res) {
  // 时间预算（v765）：Vercel 会在 maxDuration 到点时直接杀进程并返回它自己的纯文本
  // 错误页——那时连 502 JSON 都发不出去，客户端只能看到 "Unexpected token 'A'"。
  // 所以所有上游超时加起来必须明显小于 maxDuration(30s)：6 + 5 + 6 = 17s 封顶。
  const from = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  const keys = Object.keys(FRED_SERIES);
  const ids = keys.map(k => FRED_SERIES[k].id);
  const errs = [];

  // ① FRED 合并请求 → ② 缺的那几条走 .txt 备用端点
  let wide = {};
  try { wide = await fetchCombined(ids, from, 6000); }
  catch (e) { errs.push(`combined csv: ${e?.message || "failed"}`); }

  const missing = keys.filter(k => !(wide[FRED_SERIES[k].id] || []).length);
  if (missing.length) {
    const fb = await Promise.allSettled(missing.map(k => fetchOneTxt(FRED_SERIES[k].id, 5000)));
    fb.forEach((s, i) => {
      const meta = FRED_SERIES[missing[i]];
      if (s.status === "fulfilled") wide[meta.id] = s.value;
      else errs.push(`${meta.id}.txt: ${s.reason?.message || "failed"}`);
    });
  }

  const out = {};
  let okCount = 0;
  keys.forEach(k => {
    const meta = FRED_SERIES[k], ser = wide[meta.id] || [];
    if (!ser.length) { out[k] = { ...meta, id: undefined, err: true }; return; }
    okCount++;
    out[k] = summarize(meta, ser);
  });

  if (okCount) {
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");  // 日频数据，缓存 6h
    return res.json({ series: out, source: "fred", asOf: new Date().toISOString().slice(0, 10),
                      ...(errs.length ? { warn: errs.join(" | ") } : {}) });
  }

  // ③ FRED 整体不可达 → Yahoo 代理兜底。宁可给一组标明是代理的近似值，
  //    也好过整块空白；口径差异由客户端如实写在卡片上。
  let prox = {};
  try { prox = await yahooProxy(6000); }
  catch (e) { errs.push(`yahoo: ${e?.message || "failed"}`); }

  const pk = Object.keys(prox);
  if (!pk.length) {
    return res.status(502).json({ error: `rates unavailable — ${errs.join(" | ")}` });
  }
  const pout = {};
  pk.forEach(k => { pout[k] = summarize(prox[k], prox[k].ser); });
  res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
  res.json({ series: pout, source: "yahoo-proxy", asOf: new Date().toISOString().slice(0, 10),
             warn: `FRED 不可达，已降级为 Yahoo 代理指标 — ${errs.join(" | ")}` });
}

export default async function handler(req, res) {
  try {
    if (req.query?.mode === "rates") return await ratesHandler(res);

    const r = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: { "User-Agent": UA, "Referer": "https://www.cnn.com/markets/fear-and-greed", "Accept": "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });

    const data = await r.json();
    const fg   = data?.fear_and_greed;
    if (!fg) return res.status(502).json({ error: "unexpected format" });

    const prevScore = fg.previous_close != null ? Math.round(fg.previous_close) : null;

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    res.json({ score: Math.round(fg.score), rating: fg.rating, prevScore });
  } catch (e) {
    res.status(502).json({ error: e?.message || "F&G unavailable" });
  }
}
