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
  if (!h.stop || !h.cost || !h.target || h.stop >= h.target) return "Early";
  if (h.last < h.cost && h.cost > h.stop) {
    const lp = (h.cost - h.last) / (h.cost - h.stop);
    if (lp < 0.50) return "Pullback";
    return "Near Stop";
  }
  const range = h.target - h.cost;
  if (range <= 0) return "On Track";
  const pp = (h.last - h.cost) / range;
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
  "On Track":    { label: "进行中 · On Track",      cls: "on-track",    color: "var(--accent)"        },
  "Near Target": { label: "近止盈 · Near Target",    cls: "near-target", color: "var(--ok)"            },
};

// columns configuration for the main table (id, label, right-align, visible by default)
window.COLS = [
  { id: "tk",         label: "Ticker",  r: false, on: true, locked: true },
  { id: "bxbars",     label: "BX Bars", r: false, on: true },
  { id: "cost",       label: "入场价",  r: true,  on: true },
  { id: "last",       label: "最新价",  r: true,  on: true },
  { id: "qty",        label: "数量",    r: true,  on: true },
  { id: "pnl",        label: "浮盈亏",  r: true,  on: true },
  { id: "stop",       label: "止损",    r: true,  on: true, closedHide: true },
  { id: "target",     label: "止盈",    r: true,  on: true, closedHide: true },
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

window.SIM_HOLDINGS = [];
window.SIM_CLOSED   = [];
window.SIM_PENDING  = []; // { id, sym, name, kind, qty, stop, target, orderType:"market"|"limit", limitPrice, entryDate, bx, createdAt }
