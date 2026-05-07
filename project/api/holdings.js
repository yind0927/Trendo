// Vercel serverless — ETF top holdings via Yahoo Finance quoteSummary
// Yahoo Finance requires crumb + cookie authentication.
// Step 1: fetch crumb from getcrumb endpoint (also captures session cookies)
// Step 2: use crumb + parsed cookie in quoteSummary call

export default async function handler(req, res) {
  const sym = (req.query.symbol || "").trim().toUpperCase();
  if (!sym) return res.status(400).json({ error: "no symbol" });

  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  try {
    // Step 1: get crumb + session cookie
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: {
        "User-Agent": UA,
        "Accept": "text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(6000),
    });

    const crumb = (await crumbRes.text()).trim();

    // getSetCookie() returns array (Node 18+); fallback splits raw header by comma
    // We only want the name=value part of each cookie, not the attributes
    let cookieStr = "";
    if (typeof crumbRes.headers.getSetCookie === "function") {
      cookieStr = crumbRes.headers.getSetCookie()
        .map(c => c.split(";")[0].trim())
        .join("; ");
    } else {
      const raw = crumbRes.headers.get("set-cookie") || "";
      cookieStr = raw.split(",")
        .map(c => c.split(";")[0].trim())
        .filter(c => c.includes("="))
        .join("; ");
    }

    if (!crumb) {
      return res.status(502).json({ error: "failed to obtain crumb from Yahoo Finance" });
    }

    // Step 2: quoteSummary with crumb + cookie
    for (const host of ["query1", "query2"]) {
      const r = await fetch(
        `https://${host}.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(sym)}` +
        `?modules=topHoldings&crumb=${encodeURIComponent(crumb)}`,
        {
          headers: {
            "User-Agent": UA,
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            ...(cookieStr ? { "Cookie": cookieStr } : {}),
          },
          signal: AbortSignal.timeout(7000),
        }
      );

      if (!r.ok) continue;

      const data = await r.json();
      const topH = data?.quoteSummary?.result?.[0]?.topHoldings;
      if (!topH) continue;

      const holdings = (topH.holdings || []).slice(0, 20).map(h => ({
        sym:    h.symbol      || "",
        name:   h.holdingName || h.symbol || "",
        weight: h.holdingPercent != null ? +(h.holdingPercent * 100).toFixed(2) : null,
      }));

      res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
      return res.json({ sym, holdings });
    }

    return res.status(502).json({ error: "no holdings data" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
