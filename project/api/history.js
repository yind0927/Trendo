// Vercel serverless function — historical daily closes
// Fetches Yahoo Finance chart API for each symbol since a given start date.
// Accepts: ?symbols=AAPL,BTC-USD&from=2024-01-01

export default async function handler(req, res) {
  // Cap raised 30→50: an active trader can easily have 30+ distinct still-open positions
  // in a single month's cohort (real case: 34 stock symbols in one month's monthly-backtest
  // freeze query). Each symbol fetch is independent and timeout-capped at 6s running in
  // parallel via Promise.all, so wall time stays bounded by the slowest single fetch either
  // way — raising this doesn't change latency, just how many symbols one request can cover
  // before silently dropping the tail.
  const syms = (req.query.symbols || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 50);
  const from  = req.query.from || "";

  if (!syms.length) return res.status(400).json({ error: "no symbols" });

  const fromTs = from ? Math.floor(new Date(from).getTime() / 1000) : Math.floor(Date.now() / 1000) - 86400 * 400;
  const toTs   = Math.floor(Date.now() / 1000) + 86400;

  const results = {};
  const adjResults = {};
  const volumeResults = {};

  await Promise.all(syms.map(async sym => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
        `?interval=1d&period1=${fromTs}&period2=${toTs}&events=div,split`;
      // Without a timeout, one slow/hanging symbol blocks the whole Promise.all — the
      // function then runs past Vercel's platform-level duration limit and the ENTIRE
      // request fails (client sees "加载失败"), even though every other symbol already
      // resolved fine. A per-symbol timeout lets a single straggler drop out silently
      // (existing catch below) instead of taking the whole batch down with it — this is
      // exactly why some months/symbol-sets fail while smaller ones succeed.
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) return;
      const data = await r.json();
      const chart = data?.chart?.result?.[0];
      if (!chart) return;
      const timestamps = chart.timestamp || [];
      const closes     = chart.indicators?.quote?.[0]?.close || [];
      // Split/dividend-adjusted close — needed for total-return comparisons (e.g. "VOO's
      // monthly return") since a plain price return silently omits dividend cash flows.
      // Raw `close` above stays authoritative for anything computing an actual position's
      // dollar P&L (that's the real tradable price; adjclose is a retroactively-scaled
      // construct only meaningful for return comparisons, never for a real fill price).
      const adjCloses  = chart.indicators?.adjclose?.[0]?.adjclose || [];
      const volumes    = chart.indicators?.quote?.[0]?.volume || [];
      const prices     = {};
      const adjPrices  = {};
      const vols       = {};
      timestamps.forEach((ts, i) => {
        if (closes[i] == null) return;
        // Label each bar by its trading day in the EXCHANGE's own timezone (US/Eastern for
        // VOO and all US-listed symbols), not by naive UTC. Yahoo's daily-bar timestamps
        // don't reliably land on the same UTC calendar date as the actual US trading day —
        // toISOString() can shift a bar to the wrong side of a UTC midnight boundary,
        // silently mislabeling the first/last day of a month. That's invisible for most uses
        // (a single day off rarely matters), but it directly corrupts month-boundary lookups
        // (first/last trading day of a calendar month), which is exactly what feeds the
        // monthly VOO benchmark comparison. en-CA formats as YYYY-MM-DD.
        const d = new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
        prices[d] = closes[i];
        if (adjCloses[i] != null) adjPrices[d] = adjCloses[i];
        if (volumes[i] != null) vols[d] = volumes[i];
      });
      if (Object.keys(prices).length) {
        results[sym] = prices;
        volumeResults[sym] = vols;
        if (Object.keys(adjPrices).length) adjResults[sym] = adjPrices;
      }
    } catch (_) {}
  }));

  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  res.json({ results, adjResults, volumeResults });
}
