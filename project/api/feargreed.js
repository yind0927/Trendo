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

    // 这个端点叫 graphdata 是有原因的——它本来就是给 CNN 官网那条一年期曲线供数的，
    // 响应里一直带着整段日频历史，此前被这里整个丢掉了，只取了今天和昨天两个数。
    // 综合建议回放需要逐日的 FGI，拿到它就不必在客户端攒快照（那样只有上线之后的
    // 数据，且用户不开 app 的那些天会断档）。
    //
    // 日期按美东转，不用 UTC：FGI 是美股交易日的读数，UTC 硬转会在某些时刻把它错标
    // 到前后一天，而回放是按交易日逐格对齐的，错一天就会跟 VOO/VIX 那两列脱节。
    // 这与 api/history.js 的交易日口径保持一致。
    let history = null;
    const rows = data?.fear_and_greed_historical?.data;
    if (Array.isArray(rows) && rows.length) {
      history = {};
      for (const p of rows) {
        const ts = typeof p?.x === "number" ? p.x : null;
        const v  = typeof p?.y === "number" ? p.y : null;
        if (ts == null || v == null) continue;
        const d = new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        history[d] = Math.round(v);
      }
      if (!Object.keys(history).length) history = null;
    }

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    // history 缺失时照常返回今天的读数：情绪轴与 F&G 卡片不依赖它，只有回放色带会
    // 优雅降级为「FGI 历史不可用」。上游改结构不该连累已经在用的那几个模块。
    res.json({ score: Math.round(fg.score), rating: fg.rating, prevScore, history });
  } catch (e) {
    res.status(502).json({ error: e?.message || "F&G unavailable" });
  }
}
