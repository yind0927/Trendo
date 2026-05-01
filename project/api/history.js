// Vercel serverless function — historical daily closes
// Fetches Yahoo Finance chart API for each symbol since a given start date.
// Accepts: ?symbols=AAPL,BTC-USD&from=2024-01-01

export default async function handler(req, res) {
  const syms = (req.query.symbols || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 30);
  const from  = req.query.from || "";

  if (!syms.length) return res.status(400).json({ error: "no symbols" });

  const fromTs = from ? Math.floor(new Date(from).getTime() / 1000) : Math.floor(Date.now() / 1000) - 86400 * 400;
  const toTs   = Math.floor(Date.now() / 1000) + 86400;

  const results = {};

  await Promise.all(syms.map(async sym => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
        `?interval=1d&period1=${fromTs}&period2=${toTs}`;
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "application/json",
        }
      });
      if (!r.ok) return;
      const data = await r.json();
      const chart = data?.chart?.result?.[0];
      if (!chart) return;
      const timestamps = chart.timestamp || [];
      const closes     = chart.indicators?.quote?.[0]?.close || [];
      const prices     = {};
      timestamps.forEach((ts, i) => {
        if (closes[i] == null) return;
        prices[new Date(ts * 1000).toISOString().slice(0, 10)] = closes[i];
      });
      if (Object.keys(prices).length) results[sym] = prices;
    } catch (_) {}
  }));

  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  res.json({ results });
}
