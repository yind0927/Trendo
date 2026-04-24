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

window.CLOSED_POSITIONS = [
  { sym: "MSTR", name: "MicroStrategy", kind: "equity", setup: "Breakout",
    entry: "2026-04-08", cost: 1240, last: 1380, closePrice: 1380,
    stop: 1190, target: 1420, size: 5.0, qty: 11,
    pnlDollar: 7700, pnlPct: 0.113, rMult: 2.8, days: 15,
    pnlFinal: 7700, closedAt: "2026-04-23", exitReason: "target",
    thesis: "BTC proxy play; 突破入场后接近止盈。", earnings: null, holdEarn: false, status: "ok",
    spark: [1240,1265,1290,1310,1340,1380], risk1R: 50,
    bx: { dailyBars: "15+", weekly: 2, monthly: 2,
      sector: { name: "Crypto/Finance", color: "oklch(0.72 0.16 40)", score: "78", slope: 8 },
      overall: { score: "72", slope: 7 } } },
  { sym: "MSFT", name: "Microsoft", kind: "equity", setup: "Pullback",
    entry: "2026-04-14", cost: 398, last: 382, closePrice: 382,
    stop: 391, target: 430, size: 6.0, qty: 43,
    pnlDollar: -4128, pnlPct: -0.040, rMult: -2.3, days: 7,
    pnlFinal: -4128, closedAt: "2026-04-21", exitReason: "stop",
    thesis: "回踩支撑位买入，止损未能守住。", earnings: null, holdEarn: false, status: "danger",
    spark: [398,395,390,385,382,382], risk1R: 7,
    bx: { dailyBars: "5-15", weekly: 0, monthly: 1,
      sector: { name: "Mega-cap Tech", color: "oklch(0.72 0.14 280)", score: "68", slope: 2 },
      overall: { score: "62", slope: 1 } } },
  { sym: "AMZN", name: "Amazon", kind: "equity", setup: "EP Breakout",
    entry: "2026-03-28", cost: 182, last: 198, closePrice: 198,
    stop: 176, target: 202, size: 7.0, qty: 109,
    pnlDollar: 9815, pnlPct: 0.088, rMult: 2.7, days: 17,
    pnlFinal: 9815, closedAt: "2026-04-14", exitReason: "target",
    thesis: "EP 突破财报后强势延续；接近目标减仓清仓。", earnings: "2026-05-01", holdEarn: true, status: "target",
    spark: [182,185,188,192,195,198], risk1R: 6,
    bx: { dailyBars: "15+", weekly: 2, monthly: 2,
      sector: { name: "Mega-cap Tech", color: "oklch(0.72 0.14 280)", score: "82", slope: 9 },
      overall: { score: "76", slope: 8 } } },
  { sym: "UBER", name: "Uber Technologies", kind: "equity", setup: "Pullback",
    entry: "2026-04-02", cost: 68.40, last: 65.20, closePrice: 65.20,
    stop: 66.50, target: 76.00, size: 3.0, qty: 125,
    pnlDollar: -1200, pnlPct: -0.047, rMult: -1.7, days: 6,
    pnlFinal: -1200, closedAt: "2026-04-08", exitReason: "stop",
    thesis: "回踩 21EMA 失败；止损触发清仓。", earnings: null, holdEarn: false, status: "danger",
    spark: [68.4,67.8,67.0,66.2,65.2,65.2], risk1R: 1.9,
    bx: { dailyBars: "0-5", weekly: -1, monthly: 0,
      sector: { name: "Mobility/Tech", color: "oklch(0.75 0.14 140)", score: "52", slope: -2 },
      overall: { score: "58", slope: 0 } } },
  { sym: "SHOP", name: "Shopify", kind: "equity", setup: "Base Breakout",
    entry: "2026-03-20", cost: 92.10, last: 108.40, closePrice: 108.40,
    stop: 87.00, target: 110.00, size: 4.0, qty: 123,
    pnlDollar: 5991, pnlPct: 0.177, rMult: 3.2, days: 20,
    pnlFinal: 5991, closedAt: "2026-04-09", exitReason: "target",
    thesis: "8 周底部突破；接近目标位清仓锁利。", earnings: null, holdEarn: false, status: "ok",
    spark: [92.1,95,100,104,108,108.4], risk1R: 5.1,
    bx: { dailyBars: "0-5", weekly: 1, monthly: 1,
      sector: { name: "E-commerce", color: "oklch(0.78 0.13 90)", score: "70", slope: 4 },
      overall: { score: "66", slope: 3 } } },
  { sym: "NFLX", name: "Netflix", kind: "equity", setup: "Momentum",
    entry: "2026-03-10", cost: 598, last: 572, closePrice: 572,
    stop: 584, target: 650, size: 5.5, qty: 26,
    pnlDollar: -4524, pnlPct: -0.043, rMult: -1.9, days: 18,
    pnlFinal: -4524, closedAt: "2026-03-28", exitReason: "stop",
    thesis: "动量入场，止损跌破后清仓。", earnings: null, holdEarn: false, status: "danger",
    spark: [598,590,582,578,572,572], risk1R: 14,
    bx: { dailyBars: "15+", weekly: -1, monthly: 0,
      sector: { name: "Streaming", color: "oklch(0.70 0.18 25)", score: "44", slope: -3 },
      overall: { score: "55", slope: 0 } } },
  { sym: "PYPL", name: "PayPal", kind: "equity", setup: "VCP",
    entry: "2026-02-18", cost: 62.40, last: 68.20, closePrice: 68.20,
    stop: 59.50, target: 72.00, size: 3.0, qty: 136,
    pnlDollar: 2366, pnlPct: 0.093, rMult: 2.0, days: 24,
    pnlFinal: 2366, closedAt: "2026-03-13", exitReason: "target",
    thesis: "VCP 突破，达到目标价清仓。", earnings: null, holdEarn: false, status: "ok",
    spark: [62.4,64,65.5,67,68,68.2], risk1R: 2.9,
    bx: { dailyBars: "5-15", weekly: 1, monthly: 1,
      sector: { name: "Fintech", color: "oklch(0.75 0.14 140)", score: "62", slope: 3 },
      overall: { score: "58", slope: 2 } } },
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
  h.qty = Math.round((h.size / 100 * 284620) / h.cost);
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
  NVDA:  { dailyBars: "5-15", weekly: 2,  monthly: 2,  sector: { name: "Semi / AI",      color: "oklch(0.70 0.16 200)", score: "82", slope: 8  }, overall: { score: "75", slope: 7  } },
  TSLA:  { dailyBars: "15+",  weekly: -1, monthly: 0,  sector: { name: "EV / Auto",       color: "oklch(0.70 0.18 25)",  score: "35", slope: -6 }, overall: { score: "48", slope: 0  } },
  META:  { dailyBars: "15+",  weekly: 2,  monthly: 2,  sector: { name: "Mega-cap Tech",   color: "oklch(0.72 0.14 280)", score: "78", slope: 9  }, overall: { score: "72", slope: 8  } },
  AMD:   { dailyBars: "0-5",  weekly: 1,  monthly: 1,  sector: { name: "Semi / AI",       color: "oklch(0.70 0.16 200)", score: "70", slope: 2  }, overall: { score: "65", slope: 1  } },
  CRWD:  { dailyBars: "5-15", weekly: 2,  monthly: 2,  sector: { name: "Cybersecurity",   color: "oklch(0.78 0.13 90)",  score: "80", slope: 8  }, overall: { score: "72", slope: 7  } },
  SMCI:  { dailyBars: "15+",  weekly: -2, monthly: -1, sector: { name: "Semi / AI",       color: "oklch(0.70 0.16 200)", score: "40", slope: -7 }, overall: { score: "50", slope: 0  } },
  PLTR:  { dailyBars: "15+",  weekly: 1,  monthly: 2,  sector: { name: "Gov Tech",        color: "oklch(0.78 0.13 90)",  score: "72", slope: 6  }, overall: { score: "70", slope: 7  } },
  HOOD:  { dailyBars: "5-15", weekly: 1,  monthly: 1,  sector: { name: "Fintech",         color: "oklch(0.75 0.14 140)", score: "65", slope: 1  }, overall: { score: "60", slope: 0  } },
  COIN:  { dailyBars: "15+",  weekly: 0,  monthly: 1,  sector: { name: "Crypto / Fin",    color: "oklch(0.72 0.16 40)",  score: "55", slope: 2  }, overall: { score: "58", slope: 1  } },
  GOOGL: { dailyBars: "15+",  weekly: 2,  monthly: 2,  sector: { name: "Mega-cap Tech",   color: "oklch(0.72 0.14 280)", score: "80", slope: 8  }, overall: { score: "75", slope: 8  } },
  BTC:   { dailyBars: "15+",  weekly: 2,  monthly: 2,  sector: { name: "Crypto",          color: "oklch(0.72 0.16 40)",  score: "78", slope: 9  }, overall: { score: "72", slope: 8  } },
  ETH:   { dailyBars: "15+",  weekly: 1,  monthly: 2,  sector: { name: "Crypto",          color: "oklch(0.72 0.16 40)",  score: "68", slope: 3  }, overall: { score: "65", slope: 2  } },
  SOL:   { dailyBars: "5-15", weekly: 2,  monthly: 2,  sector: { name: "Crypto",          color: "oklch(0.72 0.16 40)",  score: "82", slope: 9  }, overall: { score: "74", slope: 8  } },
  LINK:  { dailyBars: "5-15", weekly: -1, monthly: 0,  sector: { name: "Crypto",          color: "oklch(0.72 0.16 40)",  score: "45", slope: -4 }, overall: { score: "58", slope: 1  } },
  AVAX:  { dailyBars: "15+",  weekly: -2, monthly: -2, sector: { name: "Crypto",          color: "oklch(0.72 0.16 40)",  score: "30", slope: -8 }, overall: { score: "45", slope: -6 } },
};
const DEFAULT_BX = { dailyBars: "0-5", weekly: 0, monthly: 0,
  sector: { name: "—", color: "oklch(0.35 0.01 250)", score: "50", slope: 0 },
  overall: { score: "50", slope: 0 }
};
window.HOLDINGS.forEach(h => {
  const src = BX_DATA[h.sym] || DEFAULT_BX;
  h.bx = JSON.parse(JSON.stringify(src));
});

// Progress bucket function for 5-stage position lifecycle
window.progressBucket = h => {
  const p = (h.last - h.stop) / (h.target - h.stop);
  // Near Stop override: distance to stop < 5% of range
  if ((h.target - h.last) / (h.target - h.stop) < 0.05) return "Near Stop";
  if (p < 0) return "Near Stop";
  if (p < 0.30) return "Early";
  if (p < 0.60) return "Midway";
  if (p < 0.95) return "On Track";
  return "Near Target";
};

window.BUCKET_STATUS = {
  "Early":       { label: "初期 · Early",       cls: "early",       color: "var(--orange)" },
  "Midway":      { label: "中期 · Midway",       cls: "midway",      color: "var(--warn)"   },
  "On Track":    { label: "进行中 · On Track",   cls: "on-track",    color: "var(--ok)"     },
  "Near Target": { label: "接近止盈 · Near Target", cls: "near-target", color: "var(--accent)" },
  "Near Stop":   { label: "接近止损 · Near Stop",  cls: "near-stop",   color: "var(--down)"   },
};

// columns configuration for the main table (id, label, right-align, visible by default)
window.COLS = [
  { id: "tk",         label: "Ticker",  r: false, on: true, locked: true },
  { id: "bxbars",     label: "BX Bars", r: false, on: true },
  { id: "cost",       label: "入场价",  r: true,  on: true },
  { id: "last",       label: "最新价",  r: true,  on: true },
  { id: "qty",        label: "数量",    r: true,  on: true },
  { id: "pnl",        label: "浮盈亏",  r: true,  on: true },
  { id: "stop",       label: "止损",    r: true,  on: true },
  { id: "target",     label: "止盈",    r: true,  on: true },
  { id: "progstatus", label: "状态",    r: false, on: true, locked: true },
];
