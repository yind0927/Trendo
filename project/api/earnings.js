// Vercel serverless function — next earnings date via Finnhub
// GET /api/earnings?sym=NVDA  → { date: "YYYY-MM-DD" | null }

export default async function handler(req, res) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) return res.status(503).json({ error: "Finnhub not configured" });

  const sym = (req.query.sym || "").toUpperCase().trim();
  if (!sym) return res.status(400).json({ error: "Missing sym" });

  const from = new Date().toISOString().slice(0, 10);
  const to   = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);

  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(sym)}&token=${token}`
    );
    const data = await r.json();
    const cal = data.earningsCalendar || [];
    const next = cal.length > 0 ? cal[0].date : null;
    return res.status(200).json({ date: next });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
