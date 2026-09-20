// ========= Trendo — live data =========

window.HOLDINGS = [];
window.CLOSED_POSITIONS = [];

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

// 「近止损」筛选的口径：从入场价算起回撤达到 5%。
// 此前这个筛选用的是 progressBucket ∈ {Pullback, Near Stop}，而 Pullback 覆盖
// 「低于入场价、但还没走到止损一半」的**全部**情形——一只只跌了 0.3% 的票也会被
// 收进来，跟标签上写的「近止损」不是一回事，筛出来的列表基本等于「所有在亏的」。
// 口径与 progressBucket 一致，用 CC 权利金调整后的成本作入场参考。
window.NEAR_STOP_DD_PCT = 5;
window.isNearStopPick = h => {
  const ccNetAmt = (h.cc || []).reduce((s, c) => s + (c.total || 0), 0);
  const cost = (ccNetAmt > 0 && h.qty > 0) ? h.cost - ccNetAmt / h.qty : h.cost;
  if (!(cost > 0) || h.last == null) return false;
  return (cost - h.last) / cost * 100 >= window.NEAR_STOP_DD_PCT;
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

// 删除墓碑（v774）。删除一条模拟持仓/挂单只是把它从数组里移走，没有留下任何
// "它被删过" 的痕迹——而 syncOnStartup 在 "本地更新" 分支会从云端旧快照里把
// 本地没有的 simHoldings / simPending 捞回来（那是为了救另一台设备新建的单），
// 于是刚删掉的东西每次同步都会被重新捞回来，而且还会被写回云端，永远删不掉。
// 墓碑就是那条缺失的痕迹：删除时记下 key，合并时按 key 跳过。
// { t:"h"|"o", k:<tradeIdOf 或 order.id>, at:ISO }，30 天后自然过期、上限 200 条。
window.SIM_TOMBSTONES = [];

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

// AI 周期检查清单（Market 页）。低频、人工判断为主的结构性判据，
// 跟三轴模型（日频、自动）刻意分开——这些是季度级的，不该被当成交易信号。
// { items: { [id]: { state:"unset"|"clear"|"watch"|"lit", value?:number,
//                    note?:string, at?:"ISO" } },
//   log: [{ ts, id, from, to }],       — 每次改动留痕，趋势比快照更有意义
//   confirmedPhase: { n, zh, cls } | null,  — 上次在「高可信」下确认的阶段
//   confirmedAt: "YYYY-MM-DD" | null }      — 阶段是有状态的：证据完整度不足时
//                                             保留上次确认值，不因新增单条证据跳档
window.CYCLE_CHECK = { items: {}, log: [], history: [], confirmedPhase: null, confirmedAt: null };
