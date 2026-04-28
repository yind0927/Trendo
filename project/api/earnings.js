// Vercel serverless function — next earnings date
// GET /api/earnings?sym=NVDA  → { date: "YYYY-MM-DD" | null }
//
// Sources (in order):
//   1. Finnhub calendar/earnings (needs FINNHUB_API_KEY)
//   2. Yahoo Finance calendarEvents (no key needed)

export default async function handler(req, res) {
  const token = process.env.FINNHUB_API_KEY;
  const sym   = (req.query.sym || "").toUpperCase().trim();
  if (!sym) return res.status(400).json({ error: "Missing sym" });

  const today = new Date().toISOString().slice(0, 10);
  const to    = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);

  // 1) Finnhub earnings calendar
  if (token) {
    try {
      const r = await fetch(
        `https://finnhub.io/api/v1/calendar/earnings?from=${today}&to=${to}&symbol=${encodeURIComponent(sym)}&token=${token}`,
        { signal: AbortSignal.timeout(5000) }
      );
      const data = await r.json();
      // Filter by symbol (free tier may return unfiltered results)
      const cal  = (data.earningsCalendar || []).filter(e => e.symbol === sym);
      if (cal.length > 0) {
        return res.status(200).json({ date: cal[0].date });
      }
    } catch (_) {}
  }

  // 2) Yahoo Finance calendarEvents (no API key needed)
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=calendarEvents`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
    );
    const d     = await r.json();
    const dates = d.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate || [];
    if (dates.length > 0) {
      // earningsDate[0].raw is a Unix timestamp in seconds
      const next = new Date(dates[0].raw * 1000).toISOString().slice(0, 10);
      return res.status(200).json({ date: next });
    }
  } catch (_) {}

  return res.status(200).json({ date: null });
}
