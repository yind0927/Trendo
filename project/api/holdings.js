// Vercel serverless — ETF top holdings via Yahoo Finance quoteSummary
// Yahoo Finance now requires a crumb + cookie for authenticated requests.
// Step 1: fetch crumb from getcrumb endpoint
// Step 2: use crumb + cookie in quoteSummary call
export default async function handler(req, res) {
  const sym = (req.query.symbol || "").trim().toUpperCase();
  if (!sym) return res.status(400).json({ error: "no symbol" });

  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  try {
    // Step 1: get crumb + session cookie
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, "Accept": "text/plain, */*" },
      signal: AbortSignal.timeout(5000),
    });
    const crumb  = (await crumbRes.text()).trim();
    const cookie = crumbRes.headers.get("set-cookie") || "";

    // Step 2: quoteSummary with crumb
    const r = await fetch(
      `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(sym)}` +
      `?modules=topHoldings&crumb=${encodeURIComponent(crumb)}`,
      {
        headers: { "User-Agent": UA, "Accept": "application/json", "Cookie": cookie },
        signal: AbortSignal.timeout(7000),
      }
    );
    if (!r.ok) return res.status(r.status).json({ error: `upstream ${r.status}` });

    const data = await r.json();
    const topH = data?.quoteSummary?.result?.[0]?.topHoldings;
    if (!topH) return res.status(502).json({ error: "no holdings data" });

    const holdings = (topH.holdings || []).slice(0, 20).map(h => ({
      sym:    h.symbol      || "",
      name:   h.holdingName || h.symbol || "",
      weight: h.holdingPercent != null ? +(h.holdingPercent * 100).toFixed(2) : null,
    }));

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    res.json({ sym, holdings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
