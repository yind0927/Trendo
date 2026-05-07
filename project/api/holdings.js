// Vercel serverless — ETF top holdings
// Primary:  Finnhub /etf/holdings (uses existing FINNHUB_API_KEY)
// Fallback: Yahoo Finance quoteSummary (crumb auth)

export default async function handler(req, res) {
  const sym   = (req.query.symbol || "").trim().toUpperCase();
  const dbg   = req.query.debug === "1";
  if (!sym) return res.status(400).json({ error: "no symbol" });

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const log = {};

  // ── 1. Finnhub ETF holdings ─────────────────────────────────────────────
  log.hasFinnhubKey = !!finnhubKey;
  if (finnhubKey) {
    try {
      const r = await fetch(
        `https://finnhub.io/api/v1/etf/holdings?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`,
        { signal: AbortSignal.timeout(6000) }
      );
      log.finnhubStatus = r.status;
      const data = await r.json();
      log.finnhubKeys = Object.keys(data || {});
      const list = data?.holdings;
      log.finnhubCount = list?.length ?? 0;
      if (r.ok && list?.length) {
        const holdings = list.slice(0, 20).map(h => ({
          sym:    h.symbol || "",
          name:   h.name   || h.symbol || "",
          weight: h.percent != null ? +Number(h.percent).toFixed(2) : null,
        }));
        res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
        return res.json({ sym, holdings, ...(dbg ? { log } : {}) });
      }
      if (dbg) log.finnhubRaw = data;
    } catch (e) {
      log.finnhubError = e.message;
    }
  }

  // ── 2. Yahoo Finance quoteSummary (fallback) ─────────────────────────────
  try {
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, "Accept": "text/plain, */*", "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(6000),
    });
    log.crumbStatus = crumbRes.status;
    const crumb = (await crumbRes.text()).trim();
    log.crumb = crumb ? crumb.slice(0, 6) + "…" : "(empty)";

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
    log.hasCookie = !!cookieStr;

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
        log[`yfStatus_${host}`] = r.status;
        if (!r.ok) continue;
        const data = await r.json();
        if (dbg) log[`yfRaw_${host}`] = JSON.stringify(data).slice(0, 400);
        const topH = data?.quoteSummary?.result?.[0]?.topHoldings;
        if (!topH?.holdings?.length) continue;
        const holdings = topH.holdings.slice(0, 20).map(h => ({
          sym:    h.symbol || "",
          name:   h.holdingName || h.symbol || "",
          weight: h.holdingPercent != null ? +(h.holdingPercent * 100).toFixed(2) : null,
        }));
        res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
        return res.json({ sym, holdings, ...(dbg ? { log } : {}) });
      }
    }
  } catch (e) {
    log.yfError = e.message;
  }

  return res.status(502).json({ error: "no holdings data", log });
}
