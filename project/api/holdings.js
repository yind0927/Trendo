// Vercel serverless — ETF top holdings
// Primary:  Financial Modeling Prep /etf-holder (free tier, needs FMP_API_KEY)
// Fallback: Yahoo Finance quoteSummary (crumb auth, may be blocked by cloud IPs)

export default async function handler(req, res) {
  const sym = (req.query.symbol || "").trim().toUpperCase();
  if (!sym) return res.status(400).json({ error: "no symbol" });

  const fmpKey     = process.env.FMP_API_KEY;
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  // ── 1. Financial Modeling Prep — free tier includes ETF holdings ────────
  if (fmpKey) {
    try {
      const r = await fetch(
        `https://financialmodelingprep.com/api/v3/etf-holder/${encodeURIComponent(sym)}?apikey=${fmpKey}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (r.ok) {
        const list = await r.json();
        if (Array.isArray(list) && list.length) {
          const holdings = list.slice(0, 20).map(h => ({
            sym:    h.asset  || "",
            name:   h.name   || h.asset || "",
            weight: h.weightPercentage != null ? +Number(h.weightPercentage).toFixed(2) : null,
          }));
          res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
          return res.json({ sym, holdings });
        }
      }
    } catch (_) {}
  }

  // ── 2. Yahoo Finance quoteSummary (fallback, may fail on cloud IPs) ─────
  try {
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, "Accept": "text/plain, */*", "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(6000),
    });

    if (crumbRes.ok) {
      const crumb = (await crumbRes.text()).trim();
      let cookieStr = "";
      if (typeof crumbRes.headers.getSetCookie === "function") {
        cookieStr = crumbRes.headers.getSetCookie()
          .map(c => c.split(";")[0].trim()).join("; ");
      } else {
        const raw = crumbRes.headers.get("set-cookie") || "";
        cookieStr = raw.split(",")
          .map(c => c.split(";")[0].trim())
          .filter(c => c.includes("=")).join("; ");
      }

      if (crumb) {
        for (const host of ["query1", "query2"]) {
          const r = await fetch(
            `https://${host}.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(sym)}` +
            `?modules=topHoldings&crumb=${encodeURIComponent(crumb)}`,
            {
              headers: {
                "User-Agent": UA, "Accept": "application/json",
                "Accept-Language": "en-US,en;q=0.9",
                ...(cookieStr ? { "Cookie": cookieStr } : {}),
              },
              signal: AbortSignal.timeout(7000),
            }
          );
          if (!r.ok) continue;
          const data = await r.json();
          const topH = data?.quoteSummary?.result?.[0]?.topHoldings;
          if (!topH?.holdings?.length) continue;
          const holdings = topH.holdings.slice(0, 20).map(h => ({
            sym:    h.symbol || "",
            name:   h.holdingName || h.symbol || "",
            weight: h.holdingPercent != null ? +(h.holdingPercent * 100).toFixed(2) : null,
          }));
          res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
          return res.json({ sym, holdings });
        }
      }
    }
  } catch (_) {}

  return res.status(502).json({ error: "no holdings data" });
}
