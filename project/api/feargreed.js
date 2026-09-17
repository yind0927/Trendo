// Vercel serverless — CNN Fear & Greed Index proxy (avoids browser CORS).
// `?mode=rates` 分支返回 FRED 的宏观利率/信用利差（周期系统分析卡片的背景参照）。
// 挂在这里而不是新建文件：Vercel Hobby 的 12 个 serverless 函数已经用满，
// 而这两件事同属「Market 页的市场环境数据」，复用同一个入口是最省的做法。

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// FRED 的 fredgraph.csv 端点不需要 API key，直接返回 "DATE,SERIES" 两列 CSV。
const FRED_SERIES = {
  real10: { id: "DFII10",        zh: "10年期实际利率", unit: "%",  digits: 2 },
  hy:     { id: "BAMLH0A0HYM2",  zh: "高收益债利差",   unit: "%",  digits: 2 },
  ig:     { id: "BAMLC0A0CM",    zh: "投资级债利差",   unit: "%",  digits: 2 },
  curve:  { id: "T10Y2Y",        zh: "10年−2年利差",   unit: "%",  digits: 2 },
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

async function ratesHandler(res) {
  // 多拉一点历史，好算「3 个月前」——FRED 的日序列有假日空洞，按日历天回退会落空
  const from = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  const keys = Object.keys(FRED_SERIES);
  const ids = keys.map(k => FRED_SERIES[k].id);

  // 一次合并请求（12s）；失败或缺列时，缺的那几条各自走 .txt 备用端点（8s）。
  const errs = [];
  let wide = {};
  try {
    wide = await fetchCombined(ids, from, 12000);
  } catch (e) {
    errs.push(`combined csv: ${e?.message || "failed"}`);
  }
  const missing = keys.filter(k => !(wide[FRED_SERIES[k].id] || []).length);
  if (missing.length) {
    const fb = await Promise.allSettled(missing.map(k => fetchOneTxt(FRED_SERIES[k].id, 8000)));
    fb.forEach((s, i) => {
      const meta = FRED_SERIES[missing[i]];
      if (s.status === "fulfilled") wide[meta.id] = s.value;
      else errs.push(`${meta.id}.txt: ${s.reason?.message || "failed"}`);
    });
  }

  const settled = keys.map(k => {
    const ser = wide[FRED_SERIES[k].id] || [];
    return ser.length ? { status: "fulfilled", value: ser } : { status: "rejected", reason: null };
  });

  const out = {};
  let okCount = 0;
  settled.forEach((s, i) => {
    const k = keys[i], meta = FRED_SERIES[k];
    if (s.status !== "fulfilled") { out[k] = { ...meta, err: true }; return; }
    okCount++;
    const ser = s.value;
    const last = ser[ser.length - 1];
    // 3 个月 ≈ 63 个交易日；序列不够长就退回最早那个点，并把实际跨度报出去
    const backIdx = Math.max(0, ser.length - 1 - 63);
    const back = ser[backIdx];
    out[k] = { ...meta, last: last.v, date: last.d, prev: back.v, prevDate: back.d,
               chg: +(last.v - back.v).toFixed(4) };
  });

  // 全失败才报错，并且把具体原因带出去——上游是 403 / 超时 / 还是返回空，
  // 三种情况的处理方式完全不同，只回 "unavailable" 等于把线索扔了。
  if (!okCount) return res.status(502).json({ error: `FRED unavailable — ${errs.join(" | ")}` });
  res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");  // 日频数据，缓存 6h
  // 部分成功时也把失败原因带出去（客户端只渲染拿到的格子，但线索不丢）
  res.json({ series: out, asOf: new Date().toISOString().slice(0, 10),
             ...(errs.length ? { warn: errs.join(" | ") } : {}) });
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
