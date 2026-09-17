// Vercel serverless — CNN Fear & Greed Index proxy (avoids browser CORS).
//
// v765 之前这里还挂着一个 `?mode=rates` 分支（FRED 宏观利率/信用利差，供周期系统
// 分析卡片作背景参照）。v766 整块删除：那组数据刻意不计入评分、只是背景板，而它
// 从 Vercel 连不上 FRED、几版都在跟超时纠缠——一个不影响任何判定的模块不值得继续
// 维护降级链路。周期判定回到纯人工清单 + 宽度背离自动项。

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export default async function handler(req, res) {
  try {
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
