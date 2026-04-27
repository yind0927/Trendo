// ========= Trendo — live data =========

window.HOLDINGS = [];
window.CLOSED_POSITIONS = [];

// status label text
window.STATUS_LABEL = {
  ok: "正常持有", warn: "接近止损", danger: "计划失效", target: "接近目标",
  trim: "可减仓", earnings: "财报临近", neutral: "—"
};

// Progress bucket function for 5-stage position lifecycle
window.progressBucket = h => {
  if (!h.stop || !h.target || h.stop >= h.target) return "Early";
  const range = h.target - h.stop;
  const p = (h.last - h.stop) / range;
  if (p < 0) return "Near Stop";
  if ((h.target - h.last) / range < 0.05) return "Near Target";
  if (p < 0.30) return "Early";
  if (p < 0.60) return "Midway";
  if (p < 0.95) return "On Track";
  return "Near Target";
};

window.BUCKET_STATUS = {
  "Early":       { label: "初期 · Early",          cls: "early",       color: "var(--orange)" },
  "Midway":      { label: "中期 · Midway",          cls: "midway",      color: "var(--warn)"   },
  "On Track":    { label: "进行中 · On Track",      cls: "on-track",    color: "var(--ok)"     },
  "Near Target": { label: "接近止盈 · Near Target", cls: "near-target", color: "var(--accent)" },
  "Near Stop":   { label: "接近止损 · Near Stop",   cls: "near-stop",   color: "var(--down)"   },
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
