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

// CSV → [{d, v}]，跳过 FRED 用来表示停牌/假日的 "." 占位符
function parseFred(csv) {
  const out = [];
  for (const line of csv.trim().split("\n").slice(1)) {
    const [d, raw] = line.split(",");
    const v = parseFloat(raw);
    if (d && Number.isFinite(v)) out.push({ d: d.trim(), v });
  }
  return out;
}

async function fetchSeries(id, fromISO) {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${fromISO}`;
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`${id} ${r.status}`);
  return parseFred(await r.text());
}

async function ratesHandler(res) {
  // 多拉一点历史，好算「3 个月前」——FRED 的日序列有假日空洞，按日历天回退会落空
  const from = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  const keys = Object.keys(FRED_SERIES);
  const settled = await Promise.allSettled(keys.map(k => fetchSeries(FRED_SERIES[k].id, from)));

  const out = {};
  let okCount = 0;
  settled.forEach((s, i) => {
    const k = keys[i], meta = FRED_SERIES[k];
    if (s.status !== "fulfilled" || !s.value.length) { out[k] = { ...meta, err: true }; return; }
    okCount++;
    const ser = s.value;
    const last = ser[ser.length - 1];
    // 3 个月 ≈ 63 个交易日；序列不够长就退回最早那个点，并把实际跨度报出去
    const backIdx = Math.max(0, ser.length - 1 - 63);
    const back = ser[backIdx];
    out[k] = { ...meta, last: last.v, date: last.d, prev: back.v, prevDate: back.d,
               chg: +(last.v - back.v).toFixed(4) };
  });

  if (!okCount) return res.status(502).json({ error: "FRED unavailable" });
  res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");  // 日频数据，缓存 6h
  res.json({ series: out, asOf: new Date().toISOString().slice(0, 10) });
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
