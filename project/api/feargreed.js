// Vercel serverless — CNN Fear & Greed Index proxy (avoids browser CORS)
export default async function handler(req, res) {
  try {
    const r = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Referer": "https://www.cnn.com/markets/fear-and-greed",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!r.ok) return res.status(r.status).json({ error: "upstream error" });
    const data = await r.json();
    const fg = data?.fear_and_greed;
    if (!fg) return res.status(502).json({ error: "unexpected format" });
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    res.json({ score: Math.round(fg.score), rating: fg.rating });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
