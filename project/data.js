// ========= Swing Desk mock data =========
// 15 positions: 10 equities + 5 crypto (matches user extras spec)

window.HOLDINGS = [
  { sym: "NVDA",  name: "NVIDIA Corp",           kind: "equity", setup: "EP Breakout",     entry: "2026-04-08", cost: 842.40, last: 918.20, size: 14.2, stop: 868.00, target: 1020.00, earnings: "2026-05-21", holdEarn: false,
    thesis: "AI capex cycle 未结束；Q1 财报前 VCP 突破 4 月 8 日 42 天 base，high RVol。", status: "ok" },
  { sym: "TSLA",  name: "Tesla Inc",             kind: "equity", setup: "Pullback",        entry: "2026-04-02", cost: 262.10, last: 254.80, size: 8.0,  stop: 248.50, target: 298.00, earnings: "2026-04-23", holdEarn: false,
    thesis: "回踩 21EMA 反弹失败；财报前减仓。已接近止损。", status: "warn" },
  { sym: "META",  name: "Meta Platforms",        kind: "equity", setup: "EP Breakout",     entry: "2026-03-18", cost: 512.30, last: 614.80, size: 11.5, stop: 555.00, target: 640.00, earnings: "2026-04-30", holdEarn: true,
    thesis: "财报后 gap-n-go；持续强势，trail stop 到 10EMA。接近 1R 目标。", status: "target" },
  { sym: "AMD",   name: "Advanced Micro Devices",kind: "equity", setup: "Base Breakout",   entry: "2026-04-14", cost: 178.50, last: 181.20, size: 6.5,  stop: 172.00, target: 210.00, earnings: "2026-05-05", holdEarn: false,
    thesis: "8 周 cup-with-handle 突破，等待 follow-through。", status: "ok" },
  { sym: "CRWD",  name: "CrowdStrike",           kind: "equity", setup: "Pullback",        entry: "2026-04-10", cost: 342.00, last: 358.40, size: 7.0,  stop: 335.00, target: 395.00, earnings: "2026-06-04", holdEarn: true,
    thesis: "RS 行业第一，回踩 21EMA 买入。", status: "ok" },
  { sym: "SMCI",  name: "Super Micro Computer",  kind: "equity", setup: "Momentum",        entry: "2026-04-01", cost: 48.20,  last: 41.60,  size: 4.0,  stop: 41.80,  target: 58.00,  earnings: "2026-05-06", holdEarn: false,
    thesis: "二次尝试失败，计划失效；破位即止损。", status: "danger" },
  { sym: "PLTR",  name: "Palantir",              kind: "equity", setup: "VCP",             entry: "2026-03-25", cost: 28.40,  last: 32.10,  size: 5.5,  stop: 29.50,  target: 36.00,  earnings: "2026-05-08", holdEarn: false,
    thesis: "Gov contract beat 催化；handle 突破进场。", status: "ok" },
  { sym: "HOOD",  name: "Robinhood Markets",     kind: "equity", setup: "EP Breakout",     entry: "2026-04-12", cost: 22.10,  last: 23.40,  size: 3.5,  stop: 21.40,  target: 27.50,  earnings: "2026-05-07", holdEarn: false,
    thesis: "Retail volume 起量；crypto 联动敞口。", status: "ok" },
  { sym: "COIN",  name: "Coinbase Global",       kind: "equity", setup: "Momentum",        entry: "2026-04-05", cost: 238.00, last: 245.30, size: 5.0,  stop: 232.00, target: 280.00, earnings: "2026-05-08", holdEarn: false,
    thesis: "BTC 走强的 beta 代理；配合加密仓位做对冲。注意财报临近。", status: "warn" },
  { sym: "GOOGL", name: "Alphabet",              kind: "equity", setup: "Base Breakout",   entry: "2026-03-31", cost: 162.40, last: 170.80, size: 7.5,  stop: 159.00, target: 185.00, earnings: "2026-04-28", holdEarn: true,
    thesis: "稳健 leader；等财报确认。", status: "ok" },

  { sym: "BTC",   name: "Bitcoin",               kind: "crypto", setup: "Breakout",        entry: "2026-03-15", cost: 68400,  last: 76820,  size: 12.0, stop: 71500,  target: 88000,  earnings: null, holdEarn: false,
    thesis: "周线突破 68K 阻力；macro halving tailwind。stop 提到 BE+1R。", status: "ok" },
  { sym: "ETH",   name: "Ethereum",              kind: "crypto", setup: "Pullback",        entry: "2026-04-06", cost: 3320,   last: 3485,   size: 6.0,  stop: 3240,   target: 4100,   earnings: null, holdEarn: false,
    thesis: "ETF inflow 持续；回踩 50D MA 买入。", status: "ok" },
  { sym: "SOL",   name: "Solana",                kind: "crypto", setup: "EP Breakout",     entry: "2026-04-09", cost: 158.00, last: 192.40, size: 4.5,  stop: 172.00, target: 220.00, earnings: null, holdEarn: false,
    thesis: "ecosystem TVL ATH；突破进场后强势持续，接近目标。", status: "target" },
  { sym: "LINK",  name: "Chainlink",             kind: "crypto", setup: "VCP",             entry: "2026-04-11", cost: 18.40,  last: 17.20,  size: 1.8,  stop: 16.90,  target: 24.50,  earnings: null, holdEarn: false,
    thesis: "CCIP 叙事回归；handle 买入后小幅承压。", status: "warn" },
  { sym: "AVAX",  name: "Avalanche",             kind: "crypto", setup: "Reversal",        entry: "2026-03-28", cost: 42.10,  last: 35.60,  size: 2.0,  stop: 35.40,  target: 58.00,  earnings: null, holdEarn: false,
    thesis: "V-bottom 尝试失败；原计划已失效。", status: "danger" },
];

// pre-compute derived fields
window.HOLDINGS.forEach(h => {
  h.pnlPct = (h.last - h.cost) / h.cost;
  h.pnlDollar = Math.round((h.last - h.cost) * (h.size * 10000 / h.cost)); // rough $ based on size-weighted notional
  h.risk1R = h.cost - h.stop;                        // $ per share of initial risk
  h.rMult = (h.last - h.cost) / (h.cost - h.stop);   // current R
  const today = new Date("2026-04-21");
  h.days = Math.max(1, Math.round((today - new Date(h.entry)) / 86400000));
  // sparkline — deterministic wander from cost → last
  const n = 24;
  const arr = []; let v = h.cost;
  const drift = (h.last - h.cost) / n;
  let seed = h.sym.charCodeAt(0) + h.sym.length * 7;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < n; i++) {
    v += drift + (rand() - 0.5) * h.cost * 0.012;
    arr.push(v);
  }
  arr[arr.length - 1] = h.last;
  h.spark = arr;
});

// status label text
window.STATUS_LABEL = {
  ok: "正常持有", warn: "接近止损", danger: "计划失效", target: "接近目标",
  trim: "可减仓", earnings: "财报临近", neutral: "—"
};

// for the position pie
window.SECTOR_SPLIT = [
  { name: "Semi / AI",       pct: 32.2, color: "oklch(0.70 0.16 200)" },
  { name: "Crypto",          pct: 26.3, color: "oklch(0.72 0.16 40)"  },
  { name: "Mega-cap Tech",   pct: 19.0, color: "oklch(0.72 0.14 280)" },
  { name: "Fintech",         pct: 8.5,  color: "oklch(0.75 0.14 140)" },
  { name: "Cybersecurity",   pct: 7.0,  color: "oklch(0.78 0.13 90)"  },
  { name: "现金",            pct: 7.0,  color: "oklch(0.35 0.01 250)" },
];

window.SETUP_STATS = [
  { name: "EP Breakout",   r:  18.4, trades: 7, win: 0.71 },
  { name: "VCP",           r:   6.1, trades: 4, win: 0.75 },
  { name: "Base Breakout", r:   4.8, trades: 5, win: 0.60 },
  { name: "Pullback",      r:   2.3, trades: 6, win: 0.50 },
  { name: "Momentum",      r:  -1.8, trades: 4, win: 0.25 },
  { name: "Reversal",      r:  -6.2, trades: 5, win: 0.20 },
];

window.ERROR_TAGS = [
  { name: "过早追高",        c: 7, hot: true },
  { name: "忽略大盘背景",    c: 5, hot: true },
  { name: "止损过紧",        c: 4, hot: false },
  { name: "未执行止盈",      c: 3, hot: false },
  { name: "财报硬抗",        c: 3, hot: true },
  { name: "尺寸过大",        c: 2, hot: false },
  { name: "setup 不符",      c: 2, hot: false },
  { name: "情绪交易",        c: 2, hot: false },
  { name: "过度交易",        c: 1, hot: false },
];

window.EVENTS = [
  { date: "Apr 23", weekday: "Thu", sym: "TSLA",  kind: "财报 · After close", severity: "danger", inPos: true },
  { date: "Apr 28", weekday: "Mon", sym: "GOOGL", kind: "财报 · After close", severity: "warn",   inPos: true },
  { date: "Apr 30", weekday: "Wed", sym: "META",  kind: "财报 · After close", severity: "warn",   inPos: true },
  { date: "May 01", weekday: "Thu", sym: "FOMC",  kind: "FOMC 利率决议",      severity: "warn",   inPos: false },
  { date: "May 05", weekday: "Mon", sym: "AMD",   kind: "财报 · After close", severity: "ok",     inPos: true },
  { date: "May 07", weekday: "Wed", sym: "HOOD",  kind: "财报 · After close", severity: "ok",     inPos: true },
];

// BX Trend data keyed by symbol
const BX_DATA = {
  NVDA:  { dailyBars: "5-15", weekly: 2,  monthly: 2,  sector: { name: "Semi / AI",      color: "oklch(0.70 0.16 200)", score: "82", slope: "up"   }, overall: { score: "75", slope: "up"   } },
  TSLA:  { dailyBars: "15+",  weekly: -1, monthly: 0,  sector: { name: "EV / Auto",       color: "oklch(0.70 0.18 25)",  score: "35", slope: "down" }, overall: { score: "48", slope: "flat" } },
  META:  { dailyBars: "15+",  weekly: 2,  monthly: 2,  sector: { name: "Mega-cap Tech",   color: "oklch(0.72 0.14 280)", score: "78", slope: "up"   }, overall: { score: "72", slope: "up"   } },
  AMD:   { dailyBars: "0-5",  weekly: 1,  monthly: 1,  sector: { name: "Semi / AI",      color: "oklch(0.70 0.16 200)", score: "70", slope: "flat" }, overall: { score: "65", slope: "flat" } },
  CRWD:  { dailyBars: "5-15", weekly: 2,  monthly: 2,  sector: { name: "Cybersecurity",   color: "oklch(0.78 0.13 90)",  score: "80", slope: "up"   }, overall: { score: "72", slope: "up"   } },
  SMCI:  { dailyBars: "15+",  weekly: -2, monthly: -1, sector: { name: "Semi / AI",      color: "oklch(0.70 0.16 200)", score: "40", slope: "down" }, overall: { score: "50", slope: "flat" } },
  PLTR:  { dailyBars: "15+",  weekly: 1,  monthly: 2,  sector: { name: "Gov Tech",        color: "oklch(0.78 0.13 90)",  score: "72", slope: "up"   }, overall: { score: "70", slope: "up"   } },
  HOOD:  { dailyBars: "5-15", weekly: 1,  monthly: 1,  sector: { name: "Fintech",         color: "oklch(0.75 0.14 140)", score: "65", slope: "flat" }, overall: { score: "60", slope: "flat" } },
  COIN:  { dailyBars: "15+",  weekly: 0,  monthly: 1,  sector: { name: "Crypto / Fin",    color: "oklch(0.72 0.16 40)",  score: "55", slope: "flat" }, overall: { score: "58", slope: "flat" } },
  GOOGL: { dailyBars: "15+",  weekly: 2,  monthly: 2,  sector: { name: "Mega-cap Tech",   color: "oklch(0.72 0.14 280)", score: "80", slope: "up"   }, overall: { score: "75", slope: "up"   } },
  BTC:   { dailyBars: "15+",  weekly: 2,  monthly: 2,  sector: { name: "Crypto",          color: "oklch(0.72 0.16 40)",  score: "78", slope: "up"   }, overall: { score: "72", slope: "up"   } },
  ETH:   { dailyBars: "15+",  weekly: 1,  monthly: 2,  sector: { name: "Crypto",          color: "oklch(0.72 0.16 40)",  score: "68", slope: "flat" }, overall: { score: "65", slope: "flat" } },
  SOL:   { dailyBars: "5-15", weekly: 2,  monthly: 2,  sector: { name: "Crypto",          color: "oklch(0.72 0.16 40)",  score: "82", slope: "up"   }, overall: { score: "74", slope: "up"   } },
  LINK:  { dailyBars: "5-15", weekly: -1, monthly: 0,  sector: { name: "Crypto",          color: "oklch(0.72 0.16 40)",  score: "45", slope: "down" }, overall: { score: "58", slope: "flat" } },
  AVAX:  { dailyBars: "15+",  weekly: -2, monthly: -2, sector: { name: "Crypto",          color: "oklch(0.72 0.16 40)",  score: "30", slope: "down" }, overall: { score: "45", slope: "down" } },
};
const DEFAULT_BX = { dailyBars: "0-5", weekly: 0, monthly: 0,
  sector: { name: "—", color: "oklch(0.35 0.01 250)", score: "50", slope: "flat" },
  overall: { score: "50", slope: "flat" }
};
window.HOLDINGS.forEach(h => {
  const src = BX_DATA[h.sym] || DEFAULT_BX;
  h.bx = JSON.parse(JSON.stringify(src));
});

// columns configuration for the main table (id, label, right-align, visible by default)
window.COLS = [
  { id: "tk",      label: "Ticker",   r: false, on: true, locked: true },
  { id: "setup",   label: "Setup",    r: false, on: true },
  { id: "entry",   label: "建仓",     r: false, on: true },
  { id: "days",    label: "持仓",     r: true,  on: true },
  { id: "cost",    label: "成本",     r: true,  on: true },
  { id: "last",    label: "最新",     r: true,  on: true },
  { id: "spark",   label: "24h",      r: false, on: true },
  { id: "size",    label: "仓位%",    r: true,  on: true },
  { id: "pnld",    label: "浮盈亏 $", r: true,  on: true },
  { id: "pnlp",    label: "浮盈亏 %", r: true,  on: true },
  { id: "stop",    label: "止损",     r: true,  on: true },
  { id: "target",  label: "目标",     r: true,  on: true },
  { id: "rmult",   label: "R",        r: true,  on: true },
  { id: "status",  label: "状态",     r: false, on: true, locked: true },
];
