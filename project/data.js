// ========= Trendo — live data =========

window.HOLDINGS = [];
window.CLOSED_POSITIONS = [];

// status label text
window.STATUS_LABEL = {
  ok: "正常持有", warn: "接近止损", danger: "计划失效", target: "接近目标",
  trim: "可减仓", earnings: "财报临近", neutral: "—"
};

// Progress bucket function — dual-axis: loss zone (2 stages) + profit zone (4 stages)
window.progressBucket = h => {
  // Use CC-adjusted cost as the entry reference so status and filters match the displayed entry price
  const ccNetAmt = (h.cc || []).reduce((s, c) => s + (c.total || 0), 0);
  const cost = (ccNetAmt > 0 && h.qty > 0) ? h.cost - ccNetAmt / h.qty : h.cost;
  if (!h.stop || !cost || !h.target || h.stop >= h.target) return "Early";
  if (h.last < cost && cost > h.stop) {
    const lp = (cost - h.last) / (cost - h.stop);
    if (lp < 0.50) return "Pullback";
    return "Near Stop";
  }
  const range = h.target - cost;
  if (range <= 0) return "On Track";
  const pp = (h.last - cost) / range;
  if (pp < 0.25) return "Early";
  if (pp < 0.60) return "Midway";
  if (pp < 0.90) return "On Track";
  return "Near Target";
};

window.BUCKET_STATUS = {
  "Pullback":    { label: "回调 · Pullback",        cls: "pullback",    color: "var(--down)"          },
  "Near Stop":   { label: "近止损 · Near Stop",     cls: "near-stop",   color: "var(--down)"          },
  "Early":       { label: "初期 · Early",           cls: "early",       color: "var(--orange)"        },
  "Midway":      { label: "中期 · Midway",          cls: "midway",      color: "var(--warn)"          },
  "On Track":    { label: "进行中 · On Track",      cls: "on-track",    color: "var(--blue)"          },
  "Near Target": { label: "近止盈 · Near Target",    cls: "near-target", color: "var(--ok)"            },
};

// columns configuration for the main table (id, label, right-align, visible by default)
window.COLS = [
  { id: "tk",         label: "Ticker",  r: false, on: true, locked: true },
  { id: "bxbars",     label: "评级",    r: false, on: true },
  { id: "cost",       label: "入场价",  r: true,  on: true },
  { id: "last",       label: "最新价",  r: true,  on: true },
  { id: "qty",        label: "数量",    r: true,  on: true },
  { id: "stop",       label: "止损",    r: true,  on: false, closedHide: true },
  { id: "target",     label: "止盈",    r: true,  on: false, closedHide: true },
  { id: "pnl",        label: "浮盈亏",  r: true,  on: true },
  { id: "progstatus", label: "状态",    r: false, on: true, locked: true },
];

// Default BX data for new positions
const DEFAULT_BX = { dailyBars: "0-5", weekly: 0, monthly: 0,
  sector: { name: "—", color: "oklch(0.35 0.01 250)", score: "50", slope: 0 },
  overall: { score: "50", slope: 0 }
};
window.DEFAULT_BX = DEFAULT_BX;

// Analytics static data — user can populate over time
window.ERROR_TAGS = [];
window.EVENTS = [];

// Empty watchlist — user-populated
window.WATCHLIST = [];

window.SIM_HOLDINGS    = [];
window.SIM_CLOSED      = [];
window.SIM_PENDING     = []; // { id, sym, name, kind, qty, stop, target, orderType:"market"|"limit", limitPrice, entryDate, bx, createdAt }
window.SIM_CLOSE_PENDING = []; // { id, sym, qty, orderType:"market"|"limit", limitPrice, createdAt }

// ── Model Picks: a forward-test ledger, deliberately separate from the sim book ──
// This is NOT a backtest. An LLM asked today which stocks to buy already knows how
// the past played out, so scoring its picks against history measures nothing. Each
// cohort is therefore locked when it is created and tracked forward from that point.
//
// Two prices per pick, on purpose:
//   modelPrice — close on the day the cohort was created. Captured automatically and
//                never editable. This is the discretion-free number: it is what the
//                model's judgement alone was worth.
//   fill.price — what the manually placed order actually got. Includes your timing.
// The gap between the two curves is the execution effect, which is only separable
// because both are stored.
//
// Cohorts are append-only. Picks are never edited after creation and a cohort can
// only be deleted on the day it was made, before any checkpoint has landed —
// otherwise "delete the bad weeks" quietly turns the whole ledger into fiction.
// {
//   id: "2026-W37", weekOf: "YYYY-MM-DD", pickedAt: ISO, model: "claude-opus-5",
//   picks: [{
//     sym, name, thesis, conviction,
//     modelPrice, modelDate, priced,      // priced:false = quote API could not price it
//     order: { type:"market"|"limit", limitPrice, qty, placedAt } | null,
//     fill:  { price, date } | null,
//     checkpoints: { d5:{px,pct}, d10:…, d20:…, d40:…, d65:… }   // frozen once written
//   }],
//   bench: { sym:"VOO", modelPrice, checkpoints:{…} }
// }
window.MODEL_PICKS = [];
// Options wheel-strategy positions (sell-side: CSP cash-secured put / CC covered call).
// Manual-entry model: only the underlying ETF spot is live; all option numbers are typed in.
// { id, sym, type:"put"|"call", strat:"csp"|"cc", strike, expiry:"YYYY-MM-DD",
//   qty(contracts>0), premium(received $/share), underlyingAtEntry, entryDate,
//   status:"open"|"closed"|"expired"|"assigned",
//   manualMark?, manualMarkAt?,          — 手动记录的当前权利金（浮盈展示）
//   closePremium?, settleSpot?, realized?, closedAt? }
window.SIM_OPTIONS = [];
window.REAL_OPTIONS = [];
