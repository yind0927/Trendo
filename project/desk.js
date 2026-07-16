// ========= Swing Desk — render + interactions =========
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const autoResizeTA = ta => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };

  const fmt = {
    usd: v => (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    usd2: v => (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    num: v => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    pct: v => (v >= 0 ? "+" : "−") + Math.abs(v * 100).toFixed(2) + "%",
    pctRaw: v => v.toFixed(1) + "%",
    rMult: v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "R",
    sign: v => v >= 0 ? "up" : "down",
    signed: v => (v >= 0 ? "+" : "−") + "$" + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 }),
    date: iso => {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
    },
  };

  const price = v => v >= 1000 ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : v.toFixed(2);


  // ============ OVERVIEW CARDS ============
  function renderOverview() {
    const totalPnlDollar = HOLDINGS.reduce((sum, h) => sum + (h.pnlDollar || 0), 0);
    const totalPnlPct = totalNotional > 0 ? totalPnlDollar / totalNotional : 0;
    const winners = HOLDINGS.filter(h => (h.pnlDollar || 0) > 0).length;
    const losers  = HOLDINGS.filter(h => (h.pnlDollar || 0) <= 0).length;
    const openWins   = HOLDINGS.filter(h => (h.pnlDollar || 0) > 0);
    const openLosses = HOLDINGS.filter(h => (h.pnlDollar || 0) <= 0 && HOLDINGS.length > 0);
    const avgOpenWinPct  = openWins.length   ? (openWins.reduce((s, h) => s + (h.pnlPct || 0), 0) / openWins.length * 100).toFixed(1) : null;
    const avgOpenLossPct = openLosses.length ? (openLosses.reduce((s, h) => s + Math.abs(h.pnlPct || 0), 0) / openLosses.length * 100).toFixed(1) : null;
    const avgWinLossParts = [
      avgOpenWinPct  !== null ? `<span class="up">盈均+${avgOpenWinPct}%</span>`  : "",
      avgOpenLossPct !== null ? `<span class="down">亏均−${avgOpenLossPct}%</span>` : "",
    ].filter(Boolean).join(" · ");
    const avgWinLossLine = avgWinLossParts ? `<div style="margin-top:1px;font-size:10px">${avgWinLossParts}</div>` : "";
    const eqCount  = HOLDINGS.filter(h => h.kind === "equity").length;
    const etfCount = HOLDINGS.filter(h => h.kind === "etf").length;
    const crCount  = HOLDINGS.filter(h => h.kind === "crypto").length;
    const eqLabel  = eqCount + (etfCount > 0 ? `+${etfCount}ETF` : "") + " 美股";
    const pnlSign = fmt.sign(totalPnlDollar);

    const todayPnl = HOLDINGS.reduce((s, h) => s + todayPnlOf(h), 0);
    const totalPrevValue = HOLDINGS.reduce((s, h) => s + (h.prevClose || h.cost || 0) * (h.qty || 0), 0);
    const todayPct = totalPrevValue > 0 ? todayPnl / totalPrevValue : 0;
    const todaySign = fmt.sign(todayPnl);

    // Include realized P&L from closed positions in total portfolio value
    const realizedPnl   = CLOSED_POSITIONS.reduce((s, h) => s + (h.pnlFinal || 0), 0);
    const portfolioValue = totalNotional + totalPnlDollar + realizedPnl;

    const opc = $("#open-pos-count"); if (opc) opc.textContent = HOLDINGS.length;

    const ov = $("#overview");
    ov.innerHTML = `
      <div class="ov-card" id="nav-card">
        <div class="label" style="justify-content:space-between">总资产<button class="nav-edit-btn" title="编辑基准总额"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button></div>
        <div class="value">$${portfolioValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
        <div class="sub"><span class="muted">基准 $${totalNotional.toLocaleString("en-US",{maximumFractionDigits:0})} <span class="${pnlSign}" style="font-size:10.5px">${totalPnlDollar >= 0 ? "+" : ""}${fmt.signed(totalPnlDollar)} 浮</span>${realizedPnl !== 0 ? ` <span class="${fmt.sign(realizedPnl)}" style="font-size:10.5px">${realizedPnl >= 0 ? "+" : ""}${fmt.signed(realizedPnl)} 已</span>` : ""}</span></div>
      </div>
      ${card({
        label: "总浮盈 / 浮亏", info: false,
        value: `<span class="${pnlSign}">${fmt.signed(totalPnlDollar)}</span>`,
        sub: `<span class="chip ${pnlSign}">${fmt.pct(totalPnlPct)}</span><span class="muted">${winners}W · ${losers}L</span>${avgWinLossLine}`,
        spark: ""
      })}
      ${card({
        label: "今日盈亏", info: false,
        value: `<span class="${todaySign}">${fmt.signed(todayPnl)}</span>`,
        sub: `<span class="chip ${todaySign}">${fmt.pct(todayPct)}</span><span class="muted">vs 昨收</span>`,
        spark: ""
      })}
      ${card({
        label: "当前持仓数", info: false,
        value: `${HOLDINGS.length}`,
        sub: `<span class="muted">现持仓</span>`,
        spark: ""
      })}
      ${pieCard()}
    `;
    renderDailySources();
  }

  function renderDailySources() {
    const el = $("#daily-sources");
    const label = $("#daily-sources-label");
    if (!el) return;

    const rows = HOLDINGS
      .map(h => {
        const today = todayPnlOf(h);
        const todayPct = computeChangePct(h) ?? 0;
        return { sym: h.sym, name: h.name, today, todayPct };
      })
      .sort((a, b) => b.today - a.today);

    if (label) label.style.display = HOLDINGS.length ? "" : "none";
    if (!HOLDINGS.length) { el.innerHTML = ""; return; }

    const total = rows.reduce((s, r) => s + r.today, 0);
    const wins  = rows.filter(r => r.today > 0).length;
    const loses = rows.filter(r => r.today < 0).length;
    const tSign = total > 0 ? "up" : total < 0 ? "down" : "";
    const hasLoaded = HOLDINGS.some(h => h.prevClose > 0);
    const tStr  = !hasLoaded ? "行情加载中…" : total === 0 ? "±$0" : (total > 0 ? "+" : "−") + "$" + Math.abs(total).toLocaleString("en-US");
    const metaEl = $("#daily-sources-meta");
    if (metaEl) metaEl.innerHTML = `<span class="ssl-total ${tSign}">${tStr}</span>${hasLoaded ? ` · ${wins}↑ ${loses}↓` : ""}`;

    const maxAbs = Math.max(...rows.map(r => Math.abs(r.today)), 1);

    el.innerHTML = `<div class="panel" style="padding:0;overflow:hidden">` +
      rows.map(r => {
        const sign = r.today > 0 ? "up" : r.today < 0 ? "down" : "neu";
        const barW = Math.round(Math.abs(r.today) / maxAbs * 100);
        const amtStr = r.today === 0 ? "±$0"
          : (r.today > 0 ? "+" : "−") + "$" + Math.abs(r.today).toLocaleString("en-US");
        const pctStr = (r.todayPct >= 0 ? "+" : "") + r.todayPct.toFixed(2) + "%";
        return `<div class="ds-row">
          <div>
            <div class="ds-sym">${r.sym}</div>
            <div class="ds-name">${r.name}</div>
          </div>
          <div class="ds-bar-track"><div class="ds-bar-fill ${sign}" style="width:${barW}%"></div></div>
          <div class="ds-val-cell">
            <div class="ds-amt ${sign}">${amtStr}</div>
            <div class="ds-pct ${sign}">${pctStr}</div>
          </div>
        </div>`;
      }).join("") + `</div>`;
  }

  function card({ label, info, value, sub, spark }) {
    return `
      <div class="ov-card">
        <div class="label">${label}${info ? `<span class="info">i</span>` : ""}</div>
        <div class="value">${value}</div>
        <div class="sub">${sub}</div>
        ${spark ? `<div class="spark">${spark}</div>` : ""}
      </div>`;
  }

  function sparkSVG(arr, w, h, color = "var(--accent)", fill = false) {
    const min = Math.min(...arr), max = Math.max(...arr);
    const sx = i => (i / (arr.length - 1)) * w;
    const sy = v => h - 2 - ((v - min) / (max - min || 1)) * (h - 4);
    const d = arr.map((v, i) => (i ? "L" : "M") + sx(i).toFixed(1) + " " + sy(v).toFixed(1)).join(" ");
    const area = fill ? `<path d="${d} L ${w} ${h} L 0 ${h} Z" fill="${color}" opacity=".12"/>` : "";
    return `<svg class="spark" width="${w}" height="${h}">${area}<path d="${d}" fill="none" stroke="${color}" stroke-width="1.4"/></svg>`;
  }

  function barBalanceSVG(wins, losses, w, h) {
    const total = wins + losses;
    const wW = Math.max(2, (wins / total) * (w - 2));
    const lW = Math.max(2, (w - 2) - wW);
    return `<svg width="${w}" height="${h}">
      <rect x="0" y="${h - 8}" width="${wW}" height="6" fill="var(--up)" rx="2"/>
      <rect x="${wW + 2}" y="${h - 8}" width="${lW}" height="6" fill="var(--down)" rx="2"/>
    </svg>`;
  }

  function gaugeSVG(v, max, w, h) {
    const pct = Math.min(1, v / max);
    const cx = w - 24, cy = h - 6, r = 20;
    const a0 = Math.PI, a1 = Math.PI + Math.PI * pct;
    const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0);
    const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
    return `<svg width="${w}" height="${h}">
      <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="var(--bg-3)" stroke-width="3"/>
      <path d="M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}" fill="none" stroke="var(--warn)" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
  }

  function disciplineBars() {
    // last 8 weeks
    const weeks = [72, 78, 65, 81, 70, 82, 74, 86];
    return `<div class="disc-bars">${weeks.map((w, i) => `<span style="height:${w * 0.22}px${i === weeks.length - 1 ? ';background:var(--accent);opacity:1' : ''}"></span>`).join("")}</div>`;
  }

  function pieCard() {
    // Real calculation from HOLDINGS
    const sectorMap = {};
    HOLDINGS.forEach(h => {
      const nm  = h.bx?.sector?.name  || "其他";
      const col = h.bx?.sector?.color || "oklch(0.35 0.01 250)";
      if (!sectorMap[nm]) sectorMap[nm] = { name: nm, color: col, pct: 0 };
      sectorMap[nm].pct += h.size || 0;
    });
    const sectors = Object.values(sectorMap).sort((a, b) => b.pct - a.pct);
    const invested = sectors.reduce((s, x) => s + x.pct, 0);
    const cash = Math.max(0, 100 - invested);
    if (cash > 0.1) sectors.push({ name: "现金", color: "oklch(0.35 0.01 250)", pct: +cash.toFixed(1) });
    const maxPct = Math.max(...sectors.map(s => s.pct));
    return `
      <div class="ov-pie ov-alloc">
        <div class="alloc-head">
          <span class="label">仓位分布</span>
          <span class="big">${invested.toFixed(0)}% <span style="font-size:var(--fs-small);font-weight:500;opacity:.6">已投</span></span>
        </div>
        <div class="alloc-bars">
          ${sectors.slice(0, 7).map(s => `
            <div class="alloc-row">
              <span class="alloc-name">${s.name}</span>
              <div class="alloc-track">
                <div class="alloc-fill" style="width:${(s.pct / maxPct * 100).toFixed(1)}%;background:${s.color}"></div>
              </div>
              <span class="alloc-pct">${s.pct.toFixed(1)}%</span>
            </div>
          `).join("")}
        </div>
      </div>`;
  }


  // ============ BX TREND ============
  const BX_SCORE_OPTS = [
    { val: -2, label: "−2", sub: "Bearish",   cls: "bx-down"   },
    { val: -1, label: "−1", sub: "→ Bull",    cls: "bx-warn"   },
    { val:  0, label: " 0", sub: "Neutral",   cls: "bx-neu"    },
    { val:  1, label: "+1", sub: "Less Bull", cls: "bx-softup" },
    { val:  2, label: "+2", sub: "Bullish",   cls: "bx-up"     },
  ];
  const SWATCH_COLORS = [
    "oklch(0.70 0.16 200)", "oklch(0.68 0.17 260)", "oklch(0.72 0.14 280)",
    "oklch(0.72 0.14 320)", "oklch(0.70 0.16 340)", "oklch(0.70 0.18 25)",
    "oklch(0.72 0.16 40)",  "oklch(0.78 0.13 90)",  "oklch(0.75 0.14 140)",
    "oklch(0.74 0.15 170)", "oklch(0.72 0.16 60)",  "oklch(0.35 0.01 250)",
  ];
  // /api/quote's crypto leg (Polygon snapshot) doesn't return an asset name at
  // all, unlike the stocks leg (Finnhub/Yahoo) — so there's nothing to fetch
  // for the new-position modal's auto-name-fill when kind=crypto. Fall back to
  // a small static map of common tickers instead of a network call that can
  // never succeed.
  const CRYPTO_NAMES = {
    BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", XRP: "XRP", ADA: "Cardano",
    DOGE: "Dogecoin", AVAX: "Avalanche", LINK: "Chainlink", DOT: "Polkadot",
    MATIC: "Polygon", POL: "Polygon", LTC: "Litecoin", BCH: "Bitcoin Cash",
    UNI: "Uniswap", ATOM: "Cosmos", SHIB: "Shiba Inu", TRX: "TRON", TON: "Toncoin",
    NEAR: "NEAR Protocol", ICP: "Internet Computer", APT: "Aptos", ARB: "Arbitrum",
    OP: "Optimism", SUI: "Sui", PEPE: "Pepe", BNB: "BNB", XLM: "Stellar",
    FIL: "Filecoin", ETC: "Ethereum Classic", HBAR: "Hedera", XMR: "Monero",
  };

  const slopeNumClass   = v => { const n = parseFloat(v); return n > 0 ? "up" : n < 0 ? "down" : "flat"; };
  const slopeNumDisplay = v => { const n = parseFloat(v) || 0; return n > 0 ? `+${n}` : `${n}`; };

  const slopeClass = v => parseFloat(v) > 0 ? "up" : parseFloat(v) < 0 ? "down" : "flat";

  function bxQuadrant(score, slopeDir) {
    const sc = parseFloat(score) || 0;
    const sl = parseFloat(slopeDir) || 0;
    if (sc === 0 && sl === 0) return { cls: "bq-neu",  label: "中性",     sub: "暂无明显趋势" };
    if (sc > 0 && sl > 0)    return { cls: "bq-lead", label: "进行时",   sub: "强者恒强 · 持有" };
    if (sc > 0 && sl <= 0)   return { cls: "bq-pull", label: "回调",     sub: "高位震荡 · 待定" };
    if (sc <= 0 && sl > 0)   return { cls: "bq-turn", label: "逐渐加强", sub: "弱转强 · 准备"   };
    return                           { cls: "bq-lag",  label: "下降",     sub: "趋势走弱 · 规避" };
  }
  function bqBadgeHTML(score, slopeDir) {
    const q = bxQuadrant(score, slopeDir);
    return `<span class="bq-badge ${q.cls}">${q.label}<span class="bq-sub">${q.sub}</span></span>`;
  }

  // ===== Entry Scoring System (BX grade + RS) — shared by modal, drawer, table, cards =====
  // Entry Scoring System helpers
  const BX_GRADE_META = {
    "A+":  { color: "var(--up)",                 action: "积极开仓", pos: "满仓",  desc: "三时框架全面看涨" },
    "A":   { color: "var(--up)",                 action: "积极开仓", pos: "满仓",  desc: "周月线强势对齐" },
    "A-":  { color: "oklch(0.78 0.17 145/.85)",  action: "可以开仓", pos: "75%",  desc: "日线领先，周月支持" },
    "B+":  { color: "var(--accent)",             action: "可以开仓", pos: "75%",  desc: "日线领先，中线中性" },
    "B":   { color: "var(--accent)",             action: "普通开仓", pos: "50%",  desc: "日线普通，周月线中等" },
    "B-":  { color: "var(--warn)",               action: "普通开仓", pos: "50%",  desc: "三时框均比较普通" },
    "C+":  { color: "var(--warn)",               action: "小仓进入", pos: "25%",  desc: "多时框整体较差" },
    "C":   { color: "oklch(0.70 0.19 25/.85)",   action: "暂缓",     pos: "不进场", desc: "多时框架不对齐" },
    "Hold":{ color: "var(--fg-2)",               action: "持有现有", pos: "—",    desc: "日线→Bull，等待日线确认" },
    "Exit":{ color: "var(--down)",               action: "回避",     pos: "不进场", desc: "看跌信号，不宜开仓" },
  };

  function calcBXGrade(cur, wk, mo) {
    if (cur <= -1) return "Exit";
    if (cur === 2) {
      if (wk <= -1 || mo <= -1) return "C";
      if (wk === 2 && mo >= 1)  return "A+";
      if (wk === 1 && mo === 2) return "A";
      if (wk === 1 && mo === 1) return "A-";
      if (wk >= 1 && mo === 0)  return "B+";  // 周线有，月线中性
      if (wk === 0 && mo >= 1)  return "B";   // 周线中性，月线支持
      return "C";
    }
    if (cur === 1) {
      if (wk <= -1 || mo <= -1) return "C";
      if (wk === 2 && mo >= 1)  return "B+";
      if (wk === 2 && mo === 0) return "B";
      if (wk === 1 && mo === 2) return "B";
      if (wk === 1 && mo === 1) return "B-";
      if (wk === 1 && mo === 0) return "C+";
      if (wk === 0 && mo >= 1)  return "C+";
      return "C";
    }
    if (cur === 0) {
      if (wk >= 1 && mo >= -1) return "B-";
      if (wk === 0 && mo >= -1) return "C+";
      return "C";
    }
    return "C";
  }

  const GRADE_LADDER = ["Exit","C","C+","B-","B","B+","A-","A","A+"];

  // Journal tagging system — 3 types: 市场 / 入场 / 管理
  const JOURNAL_TAGS = [
    // 市场：大盘与板块环境
    { id: "trend_bull",   label: "趋势顺风",    color: "var(--up)",     group: "市场" },
    { id: "trend_bear",   label: "趋势逆风",    color: "var(--down)",   group: "市场" },
    { id: "sector_pos",   label: "板块配合",    color: "var(--accent)", group: "市场" },
    { id: "sector_mid",   label: "板块一般",    color: "var(--warn)",   group: "市场" },
    { id: "sector_neg",   label: "板块拖累",    color: "var(--down)",   group: "市场" },
    // 入场：开仓决策与准备质量
    { id: "entry_good",   label: "入场精准",    color: "var(--up)",     group: "入场" },
    { id: "entry_pb",     label: "回调买入",    color: "var(--accent)", group: "入场" },
    { id: "entry_early",  label: "入场偏早",    color: "var(--warn)",   group: "入场" },
    { id: "entry_late",   label: "入场过晚",    color: "var(--warn)",   group: "入场" },
    { id: "entry_chase",  label: "追高入场",    color: "var(--down)",   group: "入场" },
    { id: "entry_nobt",   label: "缺少回测信息", color: "var(--warn)",  group: "入场" },
    { id: "entry_weakbt", label: "回测一般",    color: "var(--warn)",   group: "入场" },
    // 管理：持仓管理、出场与风险
    { id: "mgmt_patient", label: "耐心持有",    color: "var(--up)",     group: "管理" },
    { id: "mgmt_exit_ok", label: "出场及时",    color: "var(--up)",     group: "管理" },
    { id: "mgmt_exit_late", label: "出场过晚",  color: "var(--warn)",   group: "管理" },
    { id: "mgmt_exit_e",  label: "过早平仓",    color: "var(--warn)",   group: "管理" },
    { id: "mgmt_trail",   label: "移动止损失误", color: "var(--down)",   group: "管理" },
    { id: "mgmt_stop",    label: "止损过宽",    color: "var(--warn)",   group: "管理" },
    { id: "risk_earn",    label: "财报风险",    color: "var(--warn)",   group: "管理" },
    { id: "risk_emotion", label: "情绪交易",    color: "var(--down)",   group: "管理" },
    { id: "risk_size",    label: "仓位过重",    color: "var(--warn)",   group: "管理" },
  ];

  function stAdjustGrade(grade, stBull) {
  if (stBull == null || grade === "Hold" || grade === "Exit") return grade;
  const idx = GRADE_LADDER.indexOf(grade);
  if (idx < 0) return grade;
  if (stBull) return GRADE_LADDER[Math.min(idx + 1, GRADE_LADDER.length - 1)];
  return GRADE_LADDER[Math.max(idx - 1, 0)];
}

function rsAdjustGrade(grade, rsResult) {
    if (!rsResult || grade === "Hold" || grade === "Exit") return grade;
    const idx = GRADE_LADDER.indexOf(grade);
    if (idx < 0) return grade;
    const norm = rsResult.max > 0 ? (rsResult.score / rsResult.max) * 10 : 0;
    // volScore===0 means distribution (涨跌量比 <35%); null means no data — no penalty
    const isDistrib = rsResult.volScore === 0;
    // Strong RS: upgrade, but distribution blocks it
    if (norm >= 7)               return isDistrib ? grade : GRADE_LADDER[Math.min(idx + 1, GRADE_LADDER.length - 1)];
    // Worst RS: always double downgrade
    if (norm <= 0)               return GRADE_LADDER[Math.max(idx - 2, 0)];
    // Distribution + bad RS (<4): compound to double downgrade
    if (isDistrib && norm < 4)   return GRADE_LADDER[Math.max(idx - 2, 0)];
    // Distribution + mediocre RS (4–6): trigger a downgrade
    if (isDistrib && norm < 6)   return GRADE_LADDER[Math.max(idx - 1, 0)];
    // Bad RS without distribution: single downgrade
    if (norm < 4)                return GRADE_LADDER[Math.max(idx - 1, 0)];
    return grade;
  }

  async function computeEntryRS(sym, sectorEtf, kind) {
    // /api/history proxies Yahoo Finance directly, which only recognizes crypto
    // under the "-USD" ticker (e.g. BTC-USD) — a bare "BTC" returns no history,
    // silently nulling out every RS field. Same suffix convention already used
    // elsewhere for crypto history lookups (equity curve, sparkline, etc.).
    const ySym = kind === "crypto" ? `${sym}-USD` : sym;
    // Fetch 60 calendar days to guarantee ≥22 trading bars after holidays
    const syms = sectorEtf ? `${ySym},${sectorEtf},VOO` : `${ySym},VOO`;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 60);
    const fromStr = fromDate.toISOString().slice(0, 10);
    const res = await fetch(`/api/history?symbols=${encodeURIComponent(syms)}&from=${fromStr}`);
    if (!res.ok) throw new Error("history error");
    const { results, volumeResults } = await res.json();
    const getPrices = key => {
      const obj = results[key] || results[key.toUpperCase()] || results[key.toLowerCase()];
      if (!obj) return null;
      return Object.keys(obj).sort().map(d => obj[d]).filter(v => v != null);
    };
    const getVolumes = key => {
      const pobj = results[key] || results[key.toUpperCase()] || results[key.toLowerCase()];
      const vobj = (volumeResults || {})[key] || (volumeResults || {})[key.toUpperCase()] || (volumeResults || {})[key.toLowerCase()];
      if (!vobj || !pobj) return null;
      return Object.keys(pobj).sort().map(d => vobj[d] ?? null);
    };
    // Exactly 20 trading days: prices[N-21] → prices[N-1] = 20 intervals
    const get20dReturn = prices => {
      if (!prices || prices.length < 22) return null;
      const start = prices[prices.length - 21];
      const end   = prices[prices.length - 1];
      return start ? (end - start) / start * 100 : null;
    };
    const stockPrices  = getPrices(ySym);
    const vooPrices    = getPrices("VOO");
    const sectPrices   = sectorEtf ? getPrices(sectorEtf) : null;
    const stockVolumes = getVolumes(ySym);
    const volRatio     = calcVolUpDownRatio(stockPrices, stockVolumes, 20);
    return {
      stockRet: get20dReturn(stockPrices),
      vooRet:   get20dReturn(vooPrices),
      sectRet:  get20dReturn(sectPrices),
      volRatio,
    };
  }

  function calcRSScore(rsData) {
    const { stockRet, vooRet, sectRet } = rsData;
    if (stockRet == null || vooRet == null) return null;
    const hasSect   = sectRet != null;
    const vsVOO     = stockRet - vooRet;
    const vsSect    = hasSect ? stockRet - sectRet : null;
    const sectVsVOO = hasSect ? sectRet  - vooRet  : null;

    // vs VOO (0-5 pts)
    let vooScore = 0;
    if (vsVOO > 8)        vooScore = 5;
    else if (vsVOO > 5)   vooScore = 4;
    else if (vsVOO > 2)   vooScore = 3;
    else if (vsVOO > 0)   vooScore = 2;
    else if (vsVOO > -3)  vooScore = 1;

    // vs Sector (0-5 pts)
    let sectScore = 0;
    if (hasSect) {
      if (vsSect > 5)       sectScore = 5;
      else if (vsSect > 3)  sectScore = 4;
      else if (vsSect > 1)  sectScore = 3;
      else if (vsSect > 0)  sectScore = 2;
      else if (vsSect > -2) sectScore = 1;
    }

    // Sector vs VOO (0-5 pts)
    let sectBonusScore = 0;
    if (hasSect && sectVsVOO != null) {
      if (sectVsVOO > 5)        sectBonusScore = 5;
      else if (sectVsVOO > 2)   sectBonusScore = 4;
      else if (sectVsVOO > 0)   sectBonusScore = 3;
      else if (sectVsVOO > -2)  sectBonusScore = 2;
      else if (sectVsVOO > -5)  sectBonusScore = 1;
    }

    // 涨跌量比 (0-5 pts)
    const { volRatio } = rsData;
    let volScore = null;
    if (volRatio != null) {
      if      (volRatio > 65)  volScore = 5;
      else if (volRatio > 55)  volScore = 4;
      else if (volRatio >= 45) volScore = 3;
      else if (volRatio >= 35) volScore = 1;
      else                     volScore = 0;
    }

    const score = vooScore + sectScore + sectBonusScore + (volScore ?? 0);
    const max   = hasSect ? (volScore != null ? 20 : 15) : (volScore != null ? 10 : 5);
    // Include abs returns for display
    return { score, max, stockRet, vooRet, sectRet, vsVOO, vooScore, vsSect, sectScore, sectVsVOO, sectBonusScore, hasSect, volRatio, volScore };
  }

  function calcVolUpDownRatio(closes, volumes, days = 20) {
    if (!closes?.length || !volumes?.length || closes.length < days + 1) return null;
    const n = closes.length;
    let upVol = 0, downVol = 0;
    for (let i = n - days; i < n; i++) {
      const chg = closes[i] - closes[i - 1];
      if (chg > 0)      upVol   += (volumes[i] ?? 0);
      else if (chg < 0) downVol += (volumes[i] ?? 0);
    }
    const total = upVol + downVol;
    if (total === 0) return null;
    return parseFloat((upVol / total * 100).toFixed(1));
  }

  function renderEntryScorecard(bxGrade, rsResult, loading = false, targetEl = null, stBull = null) {
    const el = targetEl || $("#entry-scorecard");
    if (!el) return;
    el.style.display = "";
    if (loading) {
      el.innerHTML = `<div class="esc-top"><div class="esc-title">开仓评分</div><div class="esc-rs-badge">RS: 计算中…</div></div><div class="esc-empty">正在获取相对强度数据…</div>`;
      return;
    }
    const hasRS    = rsResult != null;
    const hasST    = stBull != null;
    const afterRS  = hasRS ? rsAdjustGrade(bxGrade, rsResult) : bxGrade;
    const finalGrade = hasST ? stAdjustGrade(afterRS, stBull) : afterRS;
    const meta       = BX_GRADE_META[finalGrade] || BX_GRADE_META["C"];
    const bxMeta     = BX_GRADE_META[bxGrade]    || BX_GRADE_META["C"];
    const rsMeta     = BX_GRADE_META[afterRS]     || BX_GRADE_META["C"];
    const rsChanged  = afterRS !== bxGrade;
    const stChanged  = finalGrade !== afterRS;
    const anyChanged = rsChanged || stChanged;

    const rsTag = hasRS
      ? `RS: <strong style="color:var(--fg-0)">${rsResult.score}/${rsResult.max}</strong>`
      : "RS: —";
    const stTag = hasST
      ? `<span class="esc-st-tag ${stBull ? "up" : "down"}">${stBull ? "▲ 做多" : "▼ 做空"}</span>`
      : "";

    let gradeHTML;
    if (!anyChanged) {
      gradeHTML = `<div class="esc-grade-box"><div class="esc-grade-val" style="color:${meta.color}">${finalGrade}</div><div class="esc-grade-lbl">评级</div></div>`;
    } else if (rsChanged && stChanged) {
      gradeHTML = `
        <div class="esc-grade-box">
          <div class="esc-grade-val" style="font-size:12px;opacity:.45;color:${bxMeta.color}">${bxGrade}</div>
          <div class="esc-grade-lbl">BX</div>
        </div>
        <div class="esc-arrow">→</div>
        <div class="esc-grade-box">
          <div class="esc-grade-val" style="font-size:14px;opacity:.65;color:${rsMeta.color}">${afterRS}</div>
          <div class="esc-grade-lbl">+RS</div>
        </div>
        <div class="esc-arrow">→</div>
        <div class="esc-grade-box">
          <div class="esc-grade-val" style="color:${meta.color}">${finalGrade}</div>
          <div class="esc-grade-lbl">Final</div>
        </div>`;
    } else {
      gradeHTML = `
        <div class="esc-grade-box">
          <div class="esc-grade-val" style="font-size:14px;opacity:.5;color:${bxMeta.color}">${bxGrade}</div>
          <div class="esc-grade-lbl">BX</div>
        </div>
        <div class="esc-arrow">→</div>
        <div class="esc-grade-box">
          <div class="esc-grade-val" style="color:${meta.color}">${finalGrade}</div>
          <div class="esc-grade-lbl">Final</div>
        </div>`;
    }

    // RS breakdown table — shows absolute returns so user can verify on chart
    let rsBreakdown = "";
    if (hasRS) {
      const fmt = v => v == null ? "N/A" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
      const pc  = v => v == null ? "var(--fg-0)" : v >= 0 ? "var(--up)" : "var(--down)";
      const pts = (n, m) => `<span style="font-weight:700;color:var(--fg-0)">${n}</span><span style="color:var(--fg-3)">/${m}</span>`;
      // Row 1: raw 20d returns — stock colored, VOO stays dim grey for reference
      const stockRow = `<div class="esc-rs-row esc-rs-header">
        <span class="esc-rs-lbl">股票 20d</span>
        <span class="esc-rs-abs" style="color:${pc(rsResult.stockRet)};font-weight:700">${fmt(rsResult.stockRet)}</span>
        <span class="esc-rs-abs2">VOO ${fmt(rsResult.vooRet)}</span>
        <span class="esc-rs-pts"></span></div>`;
      let sectRows = "";
      if (rsResult.hasSect) {
        sectRows = `<div class="esc-rs-row">
          <span class="esc-rs-lbl">vs ETF</span>
          <span class="esc-rs-abs" style="color:${pc(rsResult.vsSect)}">${fmt(rsResult.vsSect)}</span>
          <span class="esc-rs-abs2">ETF ${fmt(rsResult.sectRet)}</span>
          <span class="esc-rs-pts">${pts(rsResult.sectScore, 5)}</span></div>
        <div class="esc-rs-row">
          <span class="esc-rs-lbl">ETF/VOO</span>
          <span class="esc-rs-abs" style="color:${pc(rsResult.sectVsVOO)}">${fmt(rsResult.sectVsVOO)}</span>
          <span class="esc-rs-abs2"></span>
          <span class="esc-rs-pts">${pts(rsResult.sectBonusScore, 5)}</span></div>`;
      }
      // vs VOO always last
      const vooRow = `<div class="esc-rs-row">
        <span class="esc-rs-lbl">vs VOO</span>
        <span class="esc-rs-abs" style="color:${pc(rsResult.vsVOO)}">${fmt(rsResult.vsVOO)}</span>
        <span class="esc-rs-abs2"></span>
        <span class="esc-rs-pts">${pts(rsResult.vooScore, 5)}</span></div>`;
      let volRow = "";
      if (rsResult.volScore != null) {
        const vPct   = rsResult.volRatio.toFixed(1);
        const vLbl   = rsResult.volRatio > 65 ? "积累" : rsResult.volRatio > 55 ? "偏多" : rsResult.volRatio >= 45 ? "中性" : rsResult.volRatio >= 35 ? "偏空" : "派发";
        const vColor = rsResult.volRatio >= 55 ? "var(--up)" : rsResult.volRatio >= 45 ? "var(--fg-0)" : "var(--down)";
        volRow = `<div class="esc-rs-row">
          <span class="esc-rs-lbl">涨跌量比</span>
          <span class="esc-rs-abs" style="color:${vColor}">${vPct}%</span>
          <span class="esc-rs-abs2">${vLbl}</span>
          <span class="esc-rs-pts">${pts(rsResult.volScore, 5)}</span></div>`;
      }
      rsBreakdown = `<div class="esc-divider"></div><div class="esc-rs-table">${stockRow}${sectRows}${vooRow}${volRow}</div>`;
    }

    el.innerHTML = `
      <div class="esc-top"><div class="esc-title">开仓评分</div><div class="esc-badges-row"><div class="esc-rs-badge">${rsTag}</div>${stTag}</div></div>
      <div class="esc-body">
        ${gradeHTML}
        <div class="esc-info">
          <div class="esc-action" style="color:${meta.color}">${meta.action}</div>
          <div class="esc-desc">${meta.desc}</div>
          <div class="esc-pos">建议仓位: <strong style="color:var(--fg-0)">${meta.pos}</strong></div>
        </div>
      </div>
      ${rsBreakdown}`;
  }

  // Weekly rating-tracking history: entry grade (from h.bx.entry*) prepended as
  // the baseline, then each recorded snapshot from h.bxHistory, newest first.
  // Trend arrows compare against the previous chronological entry.
  function bxHistoryBodyHTML(h) {
    const hist = h.bxHistory || [];
    const entryPoint = h.bx?.entryFinalGrade
      ? { date: h.entry, finalGrade: h.bx.entryFinalGrade, rsResult: h.bx.entryRsResult, isEntry: true }
      : null;
    const full = entryPoint ? [entryPoint, ...hist] : hist;

    const lastDate = full.length ? full[full.length - 1].date : null;
    const daysSince = lastDate ? Math.floor((Date.now() - new Date(lastDate + "T00:00:00").getTime()) / 86400000) : null;
    const sinceHTML = daysSince == null ? "" : `<div class="dsc-hist-since${daysSince >= 7 ? " due" : ""}">距上次记录 ${daysSince} 天${daysSince >= 7 ? "，建议更新" : ""}</div>`;

    const rowsChrono = full.map((rec, i) => {
      const meta = BX_GRADE_META[rec.finalGrade] || BX_GRADE_META["C"];
      const prev = i > 0 ? full[i - 1] : null;
      let trendCls = "flat", trendArr = "–";
      if (prev) {
        const d = GRADE_LADDER.indexOf(rec.finalGrade) - GRADE_LADDER.indexOf(prev.finalGrade);
        trendCls = d > 0 ? "up" : d < 0 ? "down" : "flat";
        trendArr = d > 0 ? "▲" : d < 0 ? "▼" : "–";
      }
      const rs = rec.rsResult ? `<span class="dsc-hist-rs">RS ${rec.rsResult.score}/${rec.rsResult.max}</span>` : `<span class="dsc-hist-rs dsc-na">—</span>`;
      return `<div class="dsc-hist-row">
        <span class="dsc-hist-date">${rec.date}${rec.isEntry ? ' <span class="dsc-hist-tag">入场</span>' : ""}</span>
        <span class="dsc-hist-grade" style="color:${meta.color}">${rec.finalGrade}</span>
        <span class="dsc-hist-trend ${trendCls}">${trendArr}</span>
        ${rs}
      </div>`;
    });
    const listHTML = rowsChrono.length
      ? rowsChrono.slice().reverse().join("")
      : `<div class="dsc-empty" style="padding:6px 0">暂无记录</div>`;
    return `${sinceHTML}<div class="dsc-hist-list">${listHTML}</div>`;
  }

  function bxSectionHTML(h) {
    const bx = h.bx;

    // ── Entry scorecard: static display of stored entry-time grade + RS ──
    let entryScorecardHTML = `<div class="dsc-empty">开仓时未记录评级</div>`;
    const efg = bx.entryFinalGrade;
    if (efg) {
      const meta   = BX_GRADE_META[efg] || BX_GRADE_META["C"];
      const bxgOld = (bx.entryBxGrade && bx.entryBxGrade !== efg) ? bx.entryBxGrade : null;
      const bxMeta = bxgOld ? (BX_GRADE_META[bxgOld] || meta) : meta;
      const gradeChip = bxgOld
        ? `<span class="dsc-grade-orig" style="color:${bxMeta.color}">${bxgOld}</span><span class="dsc-arrow">→</span><span class="dsc-grade-val" style="color:${meta.color}">${efg}</span>`
        : `<span class="dsc-grade-val" style="color:${meta.color}">${efg}</span>`;
      const rs = bx.entryRsResult;
      let rsRowsHTML = "";
      if (rs) {
        const fmt = v => v == null ? "N/A" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
        const pc  = v => v == null ? "var(--fg-0)" : v >= 0 ? "var(--up)" : "var(--down)";
        rsRowsHTML = `
          <div class="dsc-rs-table">
            <div class="dsc-rs-row dsc-rs-hdr">
              <span class="dsc-rs-lbl">股票 20d</span>
              <span style="color:${pc(rs.stockRet)};font-weight:700;font-family:var(--f-mono);font-size:11px">${fmt(rs.stockRet)}</span>
              <span style="color:var(--fg-3);font-size:10px;font-family:var(--f-mono)">VOO ${fmt(rs.vooRet)}</span>
              <span class="dsc-rs-badge">RS ${rs.score}/${rs.max}</span>
            </div>
            ${rs.hasSect ? `
            <div class="dsc-rs-row">
              <span class="dsc-rs-lbl">vs ETF</span>
              <span style="color:${pc(rs.vsSect)};font-family:var(--f-mono);font-size:11px">${fmt(rs.vsSect)}</span>
              <span style="color:var(--fg-3);font-size:10px;font-family:var(--f-mono)">ETF ${fmt(rs.sectRet)}</span>
              <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--fg-3)">${rs.sectScore}/5</span>
            </div>
            <div class="dsc-rs-row">
              <span class="dsc-rs-lbl">ETF/VOO</span>
              <span style="color:${pc(rs.sectVsVOO)};font-family:var(--f-mono);font-size:11px">${fmt(rs.sectVsVOO)}</span>
              <span></span>
              <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--fg-3)">${rs.sectBonusScore}/5</span>
            </div>` : ""}
            <div class="dsc-rs-row">
              <span class="dsc-rs-lbl">vs VOO</span>
              <span style="color:${pc(rs.vsVOO)};font-family:var(--f-mono);font-size:11px">${fmt(rs.vsVOO)}</span>
              <span></span>
              <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--fg-3)">${rs.vooScore}/5</span>
            </div>
            ${rs.volScore != null ? `
            <div class="dsc-rs-row">
              <span class="dsc-rs-lbl">涨跌量比</span>
              <span style="color:${rs.volRatio >= 55 ? 'var(--up)' : rs.volRatio >= 45 ? 'var(--fg-0)' : 'var(--down)'};font-family:var(--f-mono);font-size:11px">${rs.volRatio.toFixed(1)}%</span>
              <span style="color:var(--fg-3);font-size:10px">${rs.volRatio > 65 ? '积累' : rs.volRatio > 55 ? '偏多' : rs.volRatio >= 45 ? '中性' : rs.volRatio >= 35 ? '偏空' : '派发'}</span>
              <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--fg-3)">${rs.volScore}/5</span>
            </div>` : ''}
          </div>`;
      }
      const stEntry = bx.entryST;
      const stEntryHTML = stEntry != null
        ? `<div class="dsc-st-row">SuperTrend 日线 <span style="color:${stEntry ? "var(--up)" : "var(--down)"};font-weight:700">${stEntry ? "▲ 做多" : "▼ 做空"}</span></div>`
        : "";
      entryScorecardHTML = `
        <div class="dsc-entry">
          <div class="dsc-grade-row">
            <div class="dsc-grade-chip">${gradeChip}</div>
            <div class="dsc-grade-info">
              <div style="color:${meta.color};font-size:12px;font-weight:600">${meta.action}</div>
              <div style="color:var(--fg-3);font-size:10.5px">${meta.desc}</div>
              <div style="font-size:11px;color:var(--fg-2)">建议仓位 <strong style="color:var(--fg-0)">${meta.pos}</strong></div>
            </div>
          </div>
          ${stEntryHTML}
          ${rsRowsHTML}
        </div>`;
    }

    // ── Live panel: clone of the new-position modal BX form ──────────────
    const periodRow = (label, period, hint = "") => {
      const btns = BX_SCORE_OPTS.map(o => `
        <button type="button" class="bx-score-btn ${o.cls} ${(bx[period] ?? 0) === o.val ? "active" : ""}"
                data-drawer-bx="${period}" data-bx-val="${o.val}">
          <span class="bx-val">${o.label}</span>
          <span class="bx-sub">${o.sub}</span>
        </button>`).join("");
      return `
        <div class="bx-row">
          <div class="bx-row-label">${label}${hint}</div>
          <div class="bx-score-seg">${btns}</div>
        </div>`;
    };
    const dailyBtns = ["0-5","5-15","15+"].map(v => `
      <button type="button" class="bx-daily-btn ${bx.dailyBars === v ? "active" : ""}"
              data-drawer-bx="dailyBars" data-bx-val="${v}">
        ${v}<span class="bx-sub">bars</span>
      </button>`).join("");
    const colorSwatches = SWATCH_COLORS.map(c => `
      <button type="button" class="bx-color-opt${bx.sector.color === c ? ' active' : ''}"
        style="background:${c}" data-drawer-color="${c}" title="${c}"></button>`).join('');

    return `
      <div class="drawer-section">
        <h4><span class="idx">02</span>BX Trend &amp; 市场背景</h4>

        <div class="dsc-wrap">
          <div class="dsc-tab-bar">
            <button class="dsc-tab active" data-dsc-tab="entry">入场评级</button>
            <button class="dsc-tab" data-dsc-tab="live">实时评级</button>
          </div>
          <div class="dsc-panel" data-dsc-panel="entry">
            ${entryScorecardHTML}
          </div>
          <div class="dsc-panel" data-dsc-panel="live" style="display:none">
            <div class="bx-row">
              <div class="bx-row-label">Daily Bars <span class="bx-hint">入场后第 ${calcTradingDays(h.entry)} 交易日</span></div>
              <div class="bx-daily-seg">${dailyBtns}</div>
            </div>
            ${periodRow("Current BX", "current", ' <span style="color:var(--accent);font-size:9px;text-transform:none;letter-spacing:0;font-weight:400">(日线)</span>')}
            ${periodRow("Weekly BX", "weekly")}
            ${periodRow("Monthly BX", "monthly")}
            <div class="bx-row">
              <div class="bx-row-label">SuperTrend <span style="color:var(--accent);font-size:9px;text-transform:none;letter-spacing:0;font-weight:400">日线</span></div>
              <div class="bx-st-seg">${[
                { val: "true",  cls: "bx-up",   label: "▲", sub: "做多" },
                { val: "null",  cls: "bx-neu",  label: "—",  sub: "未填" },
                { val: "false", cls: "bx-down", label: "▼", sub: "做空" },
              ].map(o => `<button type="button" class="bx-st-btn ${o.cls} ${String(bx.entryST ?? null) === o.val ? "active" : ""}" data-drawer-st="${o.val}"><span class="bx-val">${o.label}</span><span class="bx-sub">${o.sub}</span></button>`).join("")}</div>
            </div>
            <div class="bx-row" style="margin-bottom:4px">
              <div class="bx-row-label">行业ETF <span style="color:var(--fg-3);font-size:9px;text-transform:none;letter-spacing:0;font-weight:400">相对强度 RS</span></div>
              <div class="bx-etf-row">
                <input type="text" id="drawer-rs-etf" class="bx-etf-input"
                       placeholder="如 XLK / XLB" maxlength="8" autocomplete="off" spellcheck="false"
                       value="${bx.entrySectorEtf || ''}"/>
                <button type="button" id="drawer-rs-calc" class="bx-rs-calc-btn">计算 RS</button>
              </div>
            </div>
            <div id="drawer-live-scorecard" class="esc-wrap" style="display:none"></div>
            <div class="dsc-hist-section">
              <div class="dsc-hist-hd">
                <span class="dsc-hist-title">评级追踪 · Rating History</span>
                <button type="button" id="drawer-hist-record" class="dsc-hist-record-btn">📌 记录本周评级</button>
              </div>
              <div id="drawer-hist-wrap">${bxHistoryBodyHTML(h)}</div>
            </div>
          </div>
        </div>

        <div class="bx-row" style="margin-top:10px">
          <div class="bx-row-label">板块</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span id="drawer-sname" class="bx-name" contenteditable="true" data-drawer-sname spellcheck="false" style="background:${bx.sector.color}">${bx.sector.name}</span>
            <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">${colorSwatches}</div>
          </div>
        </div>
      </div>`;
  }

  function wireDrawerEdits(h) {
    const dr = $("#drawer");
    $$("[data-pos-field]", dr).forEach(el => {
      el.addEventListener("focus", () => {
        // strip leading $ for easier editing
        el.textContent = el.textContent.replace(/^\$/, "");
        document.execCommand("selectAll", false, null);
      });
      el.addEventListener("blur", () => {
        const f = el.dataset.posField;
        const v = parseFloat(el.textContent.trim().replace(/[^0-9.-]/g, ""));
        if (isNaN(v) || v <= 0) {
          el.textContent = f === "size" ? h[f].toFixed(1) : `$${price(h[f])}`;
          return;
        }
        h[f] = v;
        const notional = currentPage === "sim" ? simNotional : totalNotional;
        recomputeHolding(h, notional);
        saveToStorage();
        if (currentPage === "sim") { renderSimTable(); renderSimOverview(); }
        else { renderTable(); renderOverview(); }
        // Restore display format
        el.textContent = f === "size" ? h[f].toFixed(1) : `$${price(h[f])}`;
        // Update hero price / pnl
        const pnlSign = fmt.sign(h.pnlDollar);
        const heroP = $(".hero-price .p", dr);
        const heroPct = $(".hero-price .pct", dr);
        const heroPnl = $(".hero-price .pnl", dr);
        if (heroP) heroP.textContent = `$${price(h.last)}`;
        if (heroPct) { heroPct.textContent = fmt.pct(h.pnlPct); heroPct.className = `pct ${pnlSign}`; }
        if (heroPnl) { heroPnl.textContent = fmt.signed(h.pnlDollar); heroPnl.className = `pnl ${pnlSign}`; }
        const heroR = $(".hero-price .hero-r", dr);
        if (heroR && h.rMult != null) { heroR.textContent = fmt.rMult(h.rMult); heroR.className = `hero-r ${fmt.sign(h.rMult)}`; }
        // Update level bar
        const lb = $(".levelbar", dr);
        if (lb) { const tmp = document.createElement("div"); tmp.innerHTML = levelBar(h); lb.replaceWith(tmp.firstElementChild); }
        // Update R in kv-grid (last cell)
        const rCell = $(".kv-grid .v.big", dr);
        if (rCell) { rCell.textContent = fmt.rMult(h.rMult); rCell.className = `v big ${fmt.sign(h.rMult)}`; }
      });
      el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
    });
    // Wire drawer Journal note — same field as journalNote in Journal page
    const drawerNote = $(".drawer-journal-note", dr);
    if (drawerNote) {
      autoResizeTA(drawerNote);
      drawerNote.addEventListener("input", () => autoResizeTA(drawerNote));
      drawerNote.addEventListener("blur", () => { h.journalNote = drawerNote.value; saveToStorage(); });
    }
  }

  function wireClosedDrawerEdits(h, isSim = false) {
    const dr = $("#drawer");
    $$("[data-closed-field]", dr).forEach(el => {
      el.addEventListener("focus", () => {
        el.textContent = el.textContent.replace(/^\$/, "");
        document.execCommand("selectAll", false, null);
      });
      el.addEventListener("blur", () => {
        const v = parseFloat(el.textContent.trim().replace(/[^0-9.-]/g, ""));
        if (isNaN(v) || v <= 0) { el.textContent = `$${price(h.closePrice ?? h.last)}`; return; }
        h.closePrice = v;
        h.pnlFinal   = Math.round((v - h.cost) * h.qty);
        h.pnlDollar  = h.pnlFinal;
        h.pnlPct     = h.cost > 0 ? (v - h.cost) / h.cost : 0;
        h.rMult      = h.risk1R > 0 ? (v - h.cost) / h.risk1R : 0;
        saveToStorage();
        if (isSim) { renderSimTable(); renderSimOverview(); } else { renderTable(); renderOverview(); }
        el.textContent = `$${price(v)}`;
        // Update hero price display
        const pnlSign = fmt.sign(h.pnlFinal);
        const heroP   = $(".hero-price .p", dr);
        const heroPct = $(".hero-price .pct", dr);
        const heroPnl = $(".hero-price .pnl", dr);
        if (heroP)   heroP.textContent   = `$${price(v)}`;
        if (heroPct) { heroPct.textContent = fmt.pct(h.pnlPct);      heroPct.className = `pct ${pnlSign}`; }
        if (heroPnl) { heroPnl.textContent = fmt.signed(h.pnlFinal); heroPnl.className = `pnl ${pnlSign}`; }
        const heroR = $(".hero-price .hero-r", dr);
        if (heroR && h.rMult != null) { heroR.textContent = fmt.rMult(h.rMult); heroR.className = `hero-r ${fmt.sign(h.rMult)}`; }
        // Update P&L cell in kv-grid
        const pnlCell = $(".kv-grid .v.big", dr);
        if (pnlCell) { pnlCell.textContent = fmt.signed(h.pnlFinal); pnlCell.className = `v big ${pnlSign}`; }
        const rCell = $$(".kv-grid .v.big", dr)[1];
        if (rCell)  { rCell.textContent = fmt.rMult(h.rMult);        rCell.className   = `v big ${fmt.sign(h.rMult)}`; }
      });
      el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
    });
    // Journal note
    const drawerNote = $(".drawer-journal-note", dr);
    if (drawerNote) {
      autoResizeTA(drawerNote);
      drawerNote.addEventListener("input", () => autoResizeTA(drawerNote));
      drawerNote.addEventListener("blur", () => { h.journalNote = drawerNote.value; saveToStorage(); });
    }
  }

  function wireBX(h) {
    const dr = $("#drawer");
    const liveEl = () => dr.querySelector("#drawer-live-scorecard");
    // Last RS/ST computed in THIS drawer session (via 计算RS or ST chip), used
    // for scorecard refresh and weekly snapshot recording.
    let _lastLiveRs = null;
    let _lastLiveST = null;

    // Read the currently-selected live BX value for a given period
    const liveBX = period => {
      const v = dr.querySelector(`[data-drawer-bx="${period}"].active`)?.dataset.bxVal;
      return parseFloat(v) || 0;
    };
    // Re-render the live scorecard — persists RS + ST across chip changes
    const refreshLiveGrade = () => {
      const el = liveEl();
      if (!el) return;
      const grade = calcBXGrade(liveBX("current"), liveBX("weekly"), liveBX("monthly"));
      renderEntryScorecard(grade, _lastLiveRs, false, el, _lastLiveST);
    };

    // ── DSC tab switching ─────────────────────────────────────────────────
    $$(".dsc-tab", dr).forEach(tab => {
      tab.addEventListener("click", () => {
        $$(".dsc-tab", dr).forEach(t => t.classList.remove("active"));
        $$(".dsc-panel", dr).forEach(p => { p.style.display = "none"; });
        tab.classList.add("active");
        const panel = $(`[data-dsc-panel="${tab.dataset.dscTab}"]`, dr);
        if (panel) panel.style.display = "";
      });
    });

    // ── Live BX selectors (dailyBars / current / weekly / monthly) ────────
    $$("[data-drawer-bx][data-bx-val]", dr).forEach(btn => {
      btn.addEventListener("click", () => {
        const period = btn.dataset.drawerBx;
        $$(`[data-drawer-bx="${period}"]`, dr).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        // Persist to the holding's current BX state
        if (period === "dailyBars") h.bx.dailyBars = btn.dataset.bxVal;
        else                        h.bx[period]   = +btn.dataset.bxVal;
        saveToStorage();
        // Show / refresh the live grade on any period change — same as the modal
        if (period !== "dailyBars") refreshLiveGrade();
      });
    });

    // ── Live SuperTrend chips ─────────────────────────────────────────────
    $$("[data-drawer-st]", dr).forEach(btn => {
      btn.addEventListener("click", () => {
        $$("[data-drawer-st]", dr).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const val = btn.dataset.drawerSt;
        _lastLiveST = val === "true" ? true : val === "false" ? false : null;
        refreshLiveGrade();
      });
    });

    // ── Sector color swatches ─────────────────────────────────────────────
    $$("[data-drawer-color]", dr).forEach(opt => {
      opt.addEventListener("click", () => {
        const c = opt.dataset.drawerColor;
        h.bx.sector.color = c;
        const nameEl = dr.querySelector("[data-drawer-sname]");
        if (nameEl) nameEl.style.background = c;
        $$("[data-drawer-color]", dr).forEach(o => o.classList.toggle("active", o.dataset.drawerColor === c));
        saveToStorage();
      });
    });

    // ── Sector name (editable) ────────────────────────────────────────────
    const snameEl = dr.querySelector("[data-drawer-sname]");
    if (snameEl) {
      snameEl.addEventListener("blur", () => {
        h.bx.sector.name = snameEl.textContent.trim() || "—";
        saveToStorage();
      });
      snameEl.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); snameEl.blur(); } });
    }

    // ── Live RS calc — identical logic to the new-position modal ──────────
    const drawerRsCalc = dr.querySelector("#drawer-rs-calc");
    const drawerEtfInp = dr.querySelector("#drawer-rs-etf");
    if (drawerRsCalc) {
      drawerRsCalc.addEventListener("click", async () => {
        const sectorEtf = drawerEtfInp?.value.toUpperCase().trim() || null;
        const grade     = calcBXGrade(liveBX("current"), liveBX("weekly"), liveBX("monthly"));
        const el        = liveEl();
        renderEntryScorecard(grade, null, true, el);
        try {
          const rsData   = await computeEntryRS(h.sym, sectorEtf, h.kind);
          const rsResult = calcRSScore(rsData);
          _lastLiveRs = rsResult;
          renderEntryScorecard(grade, rsResult, false, el, _lastLiveST);
        } catch (_) {
          _lastLiveRs = null;
          renderEntryScorecard(grade, null, false, el, _lastLiveST);
        }
      });
      if (drawerEtfInp) {
        drawerEtfInp.addEventListener("input",   () => { drawerEtfInp.value = drawerEtfInp.value.toUpperCase(); });
        drawerEtfInp.addEventListener("keydown", e  => { if (e.key === "Enter") { e.preventDefault(); drawerRsCalc.click(); } });
      }
    }

    // ── Weekly rating snapshot (记录本周评级) ─────────────────────────────
    // Freezes the currently-selected live BX + last-computed RS (if any) into
    // h.bxHistory dated today, so trend vs entry can be studied over time.
    // Re-clicking on the same day overwrites that day's entry instead of
    // piling up duplicates.
    const histRecordBtn = dr.querySelector("#drawer-hist-record");
    if (histRecordBtn) {
      histRecordBtn.addEventListener("click", () => {
        const grade = calcBXGrade(liveBX("current"), liveBX("weekly"), liveBX("monthly"));
        const afterRs    = _lastLiveRs ? rsAdjustGrade(grade, _lastLiveRs) : grade;
        const finalGrade = stAdjustGrade(afterRs, _lastLiveST);
        const today = new Date().toISOString().slice(0, 10);
        const etf = dr.querySelector("#drawer-rs-etf")?.value.toUpperCase().trim() || null;
        const rec = {
          date: today, bxGrade: grade, finalGrade,
          current: liveBX("current"), weekly: liveBX("weekly"), monthly: liveBX("monthly"),
          rsResult: _lastLiveRs, sectorEtf: etf, st: _lastLiveST,
        };
        if (!h.bxHistory) h.bxHistory = [];
        const idx = h.bxHistory.findIndex(r => r.date === today);
        if (idx !== -1) h.bxHistory[idx] = rec; else h.bxHistory.push(rec);
        h.bxHistory.sort((a, b) => a.date.localeCompare(b.date));
        saveToStorage();
        const wrap = dr.querySelector("#drawer-hist-wrap");
        if (wrap) wrap.innerHTML = bxHistoryBodyHTML(h);
      });
    }
  }

  // ============ GLOBAL STATE ============

  // Logo fallback: primary source → TradingView → hide (show text initials)
  window._trLogoErr = function(img, sym, kind) {
    if (!img.dataset.tried) {
      img.dataset.tried = "1";
      img.src = kind === "crypto"
        ? `https://s3-symbol-logo.tradingview.com/crypto/XTVC${sym.toUpperCase()}--big.svg`
        : `https://financialmodelingprep.com/image-stock/${sym}.png`;
    } else {
      img.style.display = "none";
    }
  };

  function logoImg(h) {
    const src = h.kind === "crypto"
      ? `https://assets.coincap.io/assets/icons/${h.sym.toLowerCase()}@2x.png`
      : `https://s3-symbol-logo.tradingview.com/${h.sym.toUpperCase()}--big.svg`;
    return `<img src="${src}" decoding="async" onerror="_trLogoErr(this,'${h.sym}','${h.kind || ""}')">`;
  }

  let sortKey = "pnl", sortDir = -1, filter = "all", closedFilter = "all", query = "", selectedSym = null;
  let activeTab = "open";
  let holdingsViewMode = localStorage.getItem("trendo_holdings_view") || "list";
  let totalNotional = 60000;
  let reviewPeriod = "week";
  let pendingCloseSym = null;
  let pendingDeleteSym = null, pendingDeleteFrom = null;
  let currentPage = "desk";
  let journalFilter = "all";
  let equityPeriod  = "week";
  let calYear       = new Date().getFullYear();
  let calMonth      = new Date().getMonth();
  let _wlGradeFilter = null;
  let dailyPnlLog = {}; // { "YYYY-MM-DD": dailyChangeDollars }
  let histCache   = {}; // { yahooSym: { "YYYY-MM-DD": closePrice } } — in-memory, not persisted
  let histPnlLog  = {}; // { "YYYY-MM-DD": computedDelta } — built from histCache
  let histLoading = false;

  // Simulation state
  let simActiveTab = "open";
  let simSortKey = "pnl", simSortDir = -1;
  let simFilter = "all", simClosedFilter = "all", simQuery = "";
  let simHoldingsViewMode = localStorage.getItem("trendo_sim_holdings_view") || "list";
  let simSelectedSym = null;
  let simNotional = 100000;
  // Options module state — wheel strategy (CSP / Covered Call), manual entry.
  // Only the underlying ETF spot is live (via /api/quote, same path as stock
  // positions); strikes/premiums/expiries are typed in from the broker.
  let simOptionsVisible = false;
  let currentOptMode  = "real"; // "real" | "sim" — which Options sub-tab is active
  let inspSubTab      = "journal"; // "journal" | "watchlist" — Inspirations sub-tab
  let _optsSettledOpen = false; // collapsed by default
  const _optsWheelExpanded = new Set(); // group IDs of expanded wheel combo cards
  let simOptionsSym   = "QQQ";  // sell-modal default
  let simOptionsStrat = "csp";  // "csp" 卖Put | "cc" 备兑Call
  const OPT_WATCH_SYMS = ["DRAM", "MAGS", "SMH", "GLD", "IWM", "QQQ"];
  let _optSpot = {};            // { sym: last } — refreshed by fetchPrices()
  let newPositionContext = "desk"; // "desk" | "sim"
  let pendingCloseCtx = "desk";
  let pendingDeleteCtx = "desk";
  let lastPriceFetch = 0;
  const PRICE_INTERVAL_MS = 30000;
  let priceIntervalMs = +(localStorage.getItem("trendo_refresh_interval") || 30) * 1000;
  let _lastMktCtx = null; // cached market context for holdings brief
  let analysisHistory = []; // persistent AI analysis history across days, synced to cloud

  // ============ CLOUD SYNC (Upstash) ============
  let syncKey    = localStorage.getItem("trendo_sync_key") || "";
  let syncTimer  = null;
  let lastSyncAt = null;

  function generateSyncKey() {
    const chars = "abcdefghjkmnpqrstuvwxyz23456789";
    const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    return `${seg()}-${seg()}-${seg()}`;
  }

  async function syncPush() {
    if (!syncKey) return;
    // Reuse the exact savedAt written by saveLocalOnly — generating a fresh timestamp
    // here made the cloud copy permanently ~2s "newer" than local, so every
    // visibilitychange pull-if-newer re-applied identical cloud data and blanked the
    // in-memory prevClose (今日盈亏 empty until the next 30s fetch cycle).
    // Carry full analysis content (_fullData) only for the 60 most-recent entries
    // to bound the sync blob size; older entries keep metadata and fall back to the
    // 30-day server-side Redis cache when reopened (no Claude call).
    const payload = _buildSyncPayload();
    try {
      const r = await fetch(`/api/data?key=${encodeURIComponent(syncKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (r.ok) { lastSyncAt = new Date(); renderSyncStatus(); }
      else       { renderSyncStatus("error"); }
    } catch (_) { renderSyncStatus("error"); }
  }

  function _buildSyncPayload() {
    const histForSync = [...analysisHistory]
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
      .map((e, i) => {
        if (i < 60 || !e._fullData) return e;
        const c = { ...e }; delete c._fullData; return c;
      });
    return {
      holdings: noMarket(HOLDINGS), closed: CLOSED_POSITIONS, notional: totalNotional,
      watchlist: WATCHLIST, simHoldings: noMarket(SIM_HOLDINGS), simClosed: SIM_CLOSED,
      simNotional, simPending: SIM_PENDING, simClosePending: SIM_CLOSE_PENDING, dailyPnlLog,
      simOptions: SIM_OPTIONS,
      realOptions: REAL_OPTIONS,
      analysisHistory: histForSync,
      savedAt: localStorage.getItem("trendo_v4_savedAt") || new Date().toISOString()
    };
  }

  async function syncPull(key) {
    try {
      const r = await fetch(`/api/data?key=${encodeURIComponent(key)}`);
      if (!r.ok) return null;
      const { data } = await r.json();
      return data;
    } catch (_) { return null; }
  }

  async function syncOnStartup() {
    if (!syncKey) return;
    renderSyncStatus(); // show "connecting"
    const cloudData = await syncPull(syncKey);

    if (!cloudData) {
      // Cloud empty or unreachable — push local data up
      syncPush();
      return;
    }

    const localSavedAt = localStorage.getItem("trendo_v4_savedAt");
    const localTotal   = HOLDINGS.length + SIM_HOLDINGS.length + CLOSED_POSITIONS.length
                       + SIM_PENDING.length + SIM_CLOSE_PENDING.length;
    const cloudTime    = cloudData.savedAt ? new Date(cloudData.savedAt).getTime() : 0;
    const localTime    = localSavedAt      ? new Date(localSavedAt).getTime()      : 0;

    // Pull if cloud is strictly newer, OR if local has nothing at all
    if (cloudTime > localTime || (localTotal === 0 && cloudTime > 0)) {
      applyCloudData(cloudData);
      lastSyncAt = new Date();
      renderSyncStatus();
    } else if (cloudTime === localTime && cloudTime > 0) {
      // Same snapshot on both sides (savedAt travels with the data) — nothing to do.
      // This runs on every visibilitychange, so avoid a pointless POST per tab switch.
      lastSyncAt = new Date();
      renderSyncStatus();
    } else {
      // Local is newer — but first rescue any pending orders that were created on
      // another device after our last sync (they'd be in cloud but not local,
      // and a blind push would overwrite cloud and destroy them forever).
      // Match by order id (Date.now().toString(36)); orders without id are legacy.
      let pendingMerged = false;
      if (Array.isArray(cloudData.simPending) && cloudData.simPending.length) {
        const localIds  = new Set(SIM_PENDING.map(p => p.id).filter(Boolean));
        // Also skip if same sym is already open or already pending locally — prevents
        // orders from two devices targeting the same sym from both surviving the merge.
        const openSyms    = new Set(SIM_HOLDINGS.map(h => h.sym));
        const pendingSyms = new Set(SIM_PENDING.map(p => p.sym));
        const newOrders = cloudData.simPending.filter(p =>
          p.id && !localIds.has(p.id) && !openSyms.has(p.sym) && !pendingSyms.has(p.sym));
        if (newOrders.length) {
          SIM_PENDING.push(...newOrders);
          pendingMerged = true;
        }
      }
      // Rescue SIM_HOLDINGS created on another device that aren't in local yet.
      // Keyed by sym+entry+cost so partial fills aren't double-counted. Also skip
      // any cloud entry matching a position we already closed locally (same key
      // found in SIM_CLOSED) — otherwise a stale cloud snapshot (e.g. read by the
      // order-check cron just before our own close landed, or a tab-switch pull
      // racing the 2s save debounce right after we closed) resurrects the position
      // as "open" again, its matching pending close order gets rescued right after,
      // and the next fetchPrices tick auto-closes it a second time → duplicate
      // closed record for the same trade.
      const closedKeys = new Set(SIM_CLOSED.map(c => `${c.sym}|${c.entry}|${c.cost}`));
      if (Array.isArray(cloudData.simHoldings) && cloudData.simHoldings.length) {
        const localKey = h => `${h.sym}|${h.entry}|${h.cost}`;
        const localKeys = new Set(SIM_HOLDINGS.map(localKey));
        const newH = cloudData.simHoldings.filter(h => !localKeys.has(localKey(h)) && !closedKeys.has(localKey(h)));
        if (newH.length) {
          SIM_HOLDINGS.push(...newH);
          newH.forEach(h => { if (h.qty && h.cost && simNotional > 0) h.size = (h.qty * h.cost / simNotional) * 100; });
          pendingMerged = true;
        }
      }
      if (Array.isArray(cloudData.simClosePending) && cloudData.simClosePending.length) {
        const localIds  = new Set(SIM_CLOSE_PENDING.map(p => p.id).filter(Boolean));
        // Skip close orders for syms already queued locally, and orders whose
        // position isn't (or is no longer, per the rescue/exclusion above) open
        // locally — a close order for a position we don't hold is orphaned.
        const closeSyms  = new Set(SIM_CLOSE_PENDING.map(p => p.sym));
        const openSyms   = new Set(SIM_HOLDINGS.map(h => h.sym));
        const newOrders = cloudData.simClosePending.filter(p =>
          p.id && !localIds.has(p.id) && !closeSyms.has(p.sym) && openSyms.has(p.sym));
        if (newOrders.length) {
          SIM_CLOSE_PENDING.push(...newOrders);
          pendingMerged = true;
        }
      }
      if (pendingMerged) {
        saveLocalOnly();
        renderSim();
      }
      // Local is newer — push to keep cloud in sync (now includes any rescued orders)
      syncPush();
    }
  }

  function applyCloudData(data) {
    if (!data) return;
    // Carry this session's live market fields across the array replacement. They came
    // from the current session's API fetch (never from storage — noMarket guarantees
    // the cloud blob has none), so restoring them is safe and keeps 今日盈亏 / tape
    // populated instead of blanking until the next 30s fetch cycle.
    const live = {};
    [...HOLDINGS, ...SIM_HOLDINGS].forEach(h => {
      if (h.prevClose > 0) live[h.sym] = { prevClose: h.prevClose, changePct: h.changePct, last: h.last };
    });
    if (Array.isArray(data.holdings))    HOLDINGS.splice(0, HOLDINGS.length, ...data.holdings);
    if (Array.isArray(data.closed))      CLOSED_POSITIONS.splice(0, CLOSED_POSITIONS.length, ...data.closed);
    if (data.notional != null)           totalNotional = data.notional;
    if (Array.isArray(data.watchlist))   WATCHLIST.splice(0, WATCHLIST.length, ...data.watchlist);
    if (Array.isArray(data.simHoldings)) SIM_HOLDINGS.splice(0, SIM_HOLDINGS.length, ...data.simHoldings);
    if (Array.isArray(data.simClosed))   SIM_CLOSED.splice(0, SIM_CLOSED.length, ...data.simClosed);
    if (data.simNotional != null)        simNotional = data.simNotional;
    if (Array.isArray(data.simPending))      SIM_PENDING.splice(0, SIM_PENDING.length, ...data.simPending);
    if (Array.isArray(data.simClosePending)) SIM_CLOSE_PENDING.splice(0, SIM_CLOSE_PENDING.length, ...data.simClosePending);
    if (Array.isArray(data.simOptions))      SIM_OPTIONS.splice(0, SIM_OPTIONS.length, ...data.simOptions);
    if (Array.isArray(data.realOptions))     REAL_OPTIONS.splice(0, REAL_OPTIONS.length, ...data.realOptions);
    if (data.dailyPnlLog && typeof data.dailyPnlLog === "object") {
      Object.assign(dailyPnlLog, data.dailyPnlLog);
    }
    if (Array.isArray(data.analysisHistory)) {
      // MERGE, don't blindly replace: a cloud copy pushed by an older client (or
      // before _fullData existed) may lack the full analysis content. Preserve any
      // _fullData we already know locally so it isn't wiped — otherwise it can never
      // propagate back up and every device keeps re-calling the API.
      const localFull = {};
      analysisHistory.forEach(e => { if (e._fullData?._date) localFull[e.sym] = e._fullData; });
      let enriched = false;
      const merged = data.analysisHistory.map(e => {
        if (e._fullData?._date) return e;
        const fd = localFull[e.sym] || _readLocalAnalysis(e.sym);
        if (fd) { enriched = true; return { ...e, _fullData: fd }; }
        return e;
      });
      analysisHistory.splice(0, analysisHistory.length, ...merged);
      _restoreHistCache(analysisHistory);
      // We just enriched cloud-sourced entries with local content — push it back up
      // (deferred) so other devices receive the full analysis and stop re-calling.
      if (enriched) { clearTimeout(syncTimer); syncTimer = setTimeout(syncPush, 3000); }
    }
    // Recalculate size% from qty after cloud data replaces HOLDINGS
    HOLDINGS.forEach(h => { if (h.qty && h.cost && totalNotional > 0) h.size = (h.qty * h.cost / totalNotional) * 100; });
    SIM_HOLDINGS.forEach(h => { if (h.qty && h.cost && simNotional > 0) h.size = (h.qty * h.cost / simNotional) * 100; });
    // Restore live market fields captured above; symbols new to this session start
    // null and get filled by the next fetch (kicked off immediately below).
    HOLDINGS.forEach(h => {
      const lv = live[h.sym];
      h.prevClose = lv ? lv.prevClose : null;
      h.changePct = lv ? lv.changePct : null;
      if (lv && lv.last > 0) { h.last = lv.last; recomputeHolding(h, totalNotional); }
    });
    SIM_HOLDINGS.forEach(h => {
      const lv = live[h.sym];
      h.prevClose = lv ? lv.prevClose : null;
      h.changePct = lv ? lv.changePct : null;
      if (lv && lv.last > 0) { h.last = lv.last; recomputeHolding(h, simNotional); }
    });
    // Refresh quotes right away (next tick) instead of waiting out the 30s interval
    lastPriceFetch = 0;
    // Persist locally then re-render
    saveLocalOnly();
    renderOverview(); renderTable(); renderTape();
    if (currentPage === "inspirations") { if (inspSubTab === "journal") renderJournal(); else renderWatchlist(); }
    renderSim();
    if (currentPage === "analytics") renderAnalytics();
    if (currentPage === "options") renderOptions();
  }

  function renderSyncStatus(state) {
    const el = document.getElementById("sync-status");
    if (!el) return;
    if (!syncKey) { el.textContent = ""; el.dataset.state = "off"; return; }
    if (state === "error") { el.textContent = "同步失败"; el.dataset.state = "error"; return; }
    if (lastSyncAt) {
      const hh = String(lastSyncAt.getHours()).padStart(2, "0");
      const mm = String(lastSyncAt.getMinutes()).padStart(2, "0");
      el.textContent = `已同步 ${hh}:${mm}`;
      el.dataset.state = "ok";
    } else {
      el.textContent = "连接中";
      el.dataset.state = "pending";
    }
  }

  // Strip live market fields before persisting — prevClose/changePct must only ever
  // come from a fresh API call, never from stale localStorage or Redis snapshots.
  const noMarket = arr => arr.map(h => { const c = {...h}; delete c.prevClose; delete c.changePct; return c; });

  // ── Analysis full-content cache helpers (cross-device durability) ──────────
  // The full analysis lives in localStorage (wl_analysis_{sym}) and is mirrored
  // into each history entry's _fullData so it travels with cloud sync. These
  // helpers keep the two representations in sync so an already-analyzed stock
  // never re-calls the API on any device.
  const _readLocalAnalysis = sym => {
    try { const c = JSON.parse(localStorage.getItem(`wl_analysis_${sym}`) || "null"); return c?._date ? c : null; }
    catch (_) { return null; }
  };
  // Fill _fullData on history entries that lack it, sourced from localStorage.
  // Returns true if any entry was enriched.
  const _fillHistFullData = arr => {
    let changed = false;
    arr.forEach(e => {
      if (e._fullData?._date) return;
      const fd = _readLocalAnalysis(e.sym);
      if (fd) { e._fullData = fd; changed = true; }
    });
    return changed;
  };
  // Restore localStorage wl_analysis_{sym} from history _fullData so fetchStockAnalysis
  // finds the cache (and never hits the network) — even on a device that never analyzed it.
  const _restoreHistCache = arr => {
    arr.forEach(e => {
      if (!e._fullData?._date) return;
      try { const k = `wl_analysis_${e.sym}`; if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(e._fullData)); }
      catch (_) {}
    });
  };

  // ============ PERSISTENCE ============
  function saveLocalOnly(updateTimestamp = true) {
    try {
      localStorage.setItem("trendo_v4_holdings",     JSON.stringify(noMarket(HOLDINGS)));
      localStorage.setItem("trendo_v4_closed",       JSON.stringify(CLOSED_POSITIONS));
      localStorage.setItem("trendo_v4_notional",     String(totalNotional));
      localStorage.setItem("trendo_v4_watchlist",    JSON.stringify(WATCHLIST));
      localStorage.setItem("trendo_v4_sim_holdings", JSON.stringify(noMarket(SIM_HOLDINGS)));
      localStorage.setItem("trendo_v4_sim_closed",   JSON.stringify(SIM_CLOSED));
      localStorage.setItem("trendo_v4_sim_notional", String(simNotional));
      localStorage.setItem("trendo_v4_sim_pending",       JSON.stringify(SIM_PENDING));
      localStorage.setItem("trendo_v4_sim_close_pending", JSON.stringify(SIM_CLOSE_PENDING));
      localStorage.setItem("trendo_v4_sim_options",        JSON.stringify(SIM_OPTIONS));
      localStorage.setItem("trendo_v4_real_options",       JSON.stringify(REAL_OPTIONS));
      localStorage.setItem("trendo_v4_daily_pnl",    JSON.stringify(dailyPnlLog));
      localStorage.setItem("trendo_v4_analysis_hist", JSON.stringify(analysisHistory));
      // Skip timestamp update for price-only ticks so they don't make local appear "newer"
      // than cloud (which would cause syncPush to overwrite cloud SIM_HOLDINGS from another device)
      if (updateTimestamp) localStorage.setItem("trendo_v4_savedAt", new Date().toISOString());
    } catch (e) { /* storage unavailable */ }
  }

  function saveToStorage() {
    saveLocalOnly();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncPush, 2000);
    // Clear hist cache so new/closed positions get fresh history on next analytics visit
    histCache = {}; histPnlLog = {};
  }

  function loadFromStorage() {
    try {
      const h  = localStorage.getItem("trendo_v4_holdings");
      const c  = localStorage.getItem("trendo_v4_closed");
      const n  = localStorage.getItem("trendo_v4_notional");
      const w  = localStorage.getItem("trendo_v4_watchlist");
      const sh = localStorage.getItem("trendo_v4_sim_holdings");
      const sc = localStorage.getItem("trendo_v4_sim_closed");
      const sn = localStorage.getItem("trendo_v4_sim_notional");
      if (h)  { const parsed = JSON.parse(h);  HOLDINGS.splice(0, HOLDINGS.length, ...parsed); }
      if (c)  { const parsed = JSON.parse(c);  CLOSED_POSITIONS.splice(0, CLOSED_POSITIONS.length, ...parsed); }
      if (n)  totalNotional = parseFloat(n) || totalNotional;
      if (w)  { const parsed = JSON.parse(w);  WATCHLIST.splice(0, WATCHLIST.length, ...parsed); }
      if (sh) { const parsed = JSON.parse(sh); SIM_HOLDINGS.splice(0, SIM_HOLDINGS.length, ...parsed); }
      if (sc) { const parsed = JSON.parse(sc); SIM_CLOSED.splice(0, SIM_CLOSED.length, ...parsed); }
      if (sn) simNotional = parseFloat(sn) || simNotional;
      const sp  = localStorage.getItem("trendo_v4_sim_pending");
      if (sp)  { const parsed = JSON.parse(sp);  SIM_PENDING.splice(0, SIM_PENDING.length, ...parsed); }
      const scp = localStorage.getItem("trendo_v4_sim_close_pending");
      if (scp) { const parsed = JSON.parse(scp); SIM_CLOSE_PENDING.splice(0, SIM_CLOSE_PENDING.length, ...parsed); }
      const so = localStorage.getItem("trendo_v4_sim_options");
      if (so) { const parsed = JSON.parse(so); SIM_OPTIONS.splice(0, SIM_OPTIONS.length, ...parsed); }
      const ro = localStorage.getItem("trendo_v4_real_options");
      if (ro) { const parsed = JSON.parse(ro); REAL_OPTIONS.splice(0, REAL_OPTIONS.length, ...parsed); }
      const dp = localStorage.getItem("trendo_v4_daily_pnl");
      if (dp) { try { Object.assign(dailyPnlLog, JSON.parse(dp)); } catch (_) {} }
      const ah = localStorage.getItem("trendo_v4_analysis_hist");
      if (ah) { try { const p = JSON.parse(ah); if (Array.isArray(p)) analysisHistory.splice(0, analysisHistory.length, ...p); } catch (_) {} }
    } catch (e) { /* corrupted storage, use defaults */ }
    // Two-way reconcile of the analysis cache, synchronously (before any user click):
    //  - fill _fullData on entries that lack it, from local wl_analysis_* cache
    //  - restore wl_analysis_* from _fullData so fetchStockAnalysis hits cache, no API call
    _fillHistFullData(analysisHistory);
    _restoreHistCache(analysisHistory);
    // Migrate legacy wl_analysis_* entries (pre-v41 format) into analysisHistory on first load
    if (analysisHistory.length === 0) {
      try {
        const migrated = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k?.startsWith("wl_analysis_")) continue;
          try {
            const d = JSON.parse(localStorage.getItem(k) || "null");
            if (!d?._date) continue;
            const sym = k.slice("wl_analysis_".length).toUpperCase();
            migrated.push({
              sym,
              grade:   d.scores?.grade   ?? "",
              overall: d.scores?.overall ?? 50,
              name:    d.name ?? "",
              price:   typeof d.price === "number" ? d.price : null,
              savedAt: d._savedAt || new Date(d._date + "T12:00:00").getTime(),
              date:    d._date,
            });
          } catch (_) {}
        }
        if (migrated.length > 0) {
          migrated.sort((a, b) => b.savedAt - a.savedAt);
          if (migrated.length > 200) migrated.splice(200);
          analysisHistory.splice(0, analysisHistory.length, ...migrated);
        }
      } catch (_) {}
    }
    // Recalculate size% from qty after load (qty is source of truth)
    HOLDINGS.forEach(h => { if (h.qty && h.cost && totalNotional > 0) h.size = (h.qty * h.cost / totalNotional) * 100; });
    SIM_HOLDINGS.forEach(h => { if (h.qty && h.cost && simNotional > 0) h.size = (h.qty * h.cost / simNotional) * 100; });
    // prevClose is never saved (noMarket strips it), so nothing to wipe.
    // Any old localStorage snapshot that still has it gets cleared here permanently.
    [...HOLDINGS, ...SIM_HOLDINGS].forEach(h => { h.prevClose = null; h.changePct = null; });
  }

  // ============ TRADING DAYS CALCULATOR ============
  // Returns "YYYY-MM-DD" of the most recently completed US trading day.
  // Before 20:00 UTC (4pm ET) treat today as not yet closed → use yesterday.
  function getLastTradingDayStr() {
    const f = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const d = new Date(); d.setHours(0,0,0,0);
    const utcMins = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
    if (utcMins < 20 * 60) d.setDate(d.getDate() - 1);
    const hols = new Set([...usMarketHolidays(d.getFullYear()), ...usMarketHolidays(d.getFullYear() - 1)]);
    while (d.getDay() === 0 || d.getDay() === 6 || hols.has(f(d))) d.setDate(d.getDate() - 1);
    return f(d);
  }

  function usMarketHolidays(y) {
    const f = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const obs = (m, day) => {
      const d = new Date(y, m-1, day);
      if (d.getDay()===6) d.setDate(day-1); else if (d.getDay()===0) d.setDate(day+1);
      return f(d);
    };
    const nth = (m, dow, n) => {
      const d = new Date(y, m-1, 1); let c = 0;
      while (c < n) { if (d.getDay()===dow) c++; if (c < n) d.setDate(d.getDate()+1); }
      return f(d);
    };
    const lastMon = m => {
      const d = new Date(y, m, 0);
      while (d.getDay()!==1) d.setDate(d.getDate()-1);
      return f(d);
    };
    const goodFriday = () => {
      const a=y%19,b=Math.floor(y/100),c=y%100,d2=Math.floor(b/4),e=b%4,
            g=Math.floor((b-Math.floor((b+8)/25)+1)/3),
            h2=(19*a+b-d2-g+15)%30,i=Math.floor(c/4),k=c%4,
            l=(32+2*e+2*i-h2-k)%7,m2=Math.floor((a+11*h2+22*l)/451),
            mo=Math.floor((h2+l-7*m2+114)/31),dy=(h2+l-7*m2+114)%31+1;
      const d = new Date(y, mo-1, dy-2);
      return f(d);
    };
    return [
      obs(1,1), nth(1,1,3), nth(2,1,3), goodFriday(),
      lastMon(5), ...(y>=2022?[obs(6,19)]:[]),
      obs(7,4), nth(9,1,1), nth(11,4,4), obs(12,25)
    ];
  }

  function calcTradingDays(entryStr, endStr) {
    if (!entryStr) return 0;
    const f = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    // Start counting from the day AFTER entry
    const start = new Date(entryStr + 'T00:00:00');
    start.setDate(start.getDate() + 1);

    // End: provided close date, or last completed trading day
    let end;
    if (endStr) {
      end = new Date(endStr + 'T00:00:00');
    } else {
      // US market closes at 4pm ET = 20:00 UTC; before that, today hasn't closed
      end = new Date(); end.setHours(0,0,0,0);
      const utcMins = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
      if (utcMins < 20 * 60) end.setDate(end.getDate() - 1);
      // Walk back past weekends/holidays to last trading day
      const hols0 = new Set([...usMarketHolidays(end.getFullYear()), ...usMarketHolidays(end.getFullYear() - 1)]);
      while (end.getDay() === 0 || end.getDay() === 6 || hols0.has(f(end)))
        end.setDate(end.getDate() - 1);
    }

    if (start > end) return 0;
    const hols = new Set();
    for (let yr = start.getFullYear(); yr <= end.getFullYear(); yr++)
      usMarketHolidays(yr).forEach(h => hols.add(h));
    let count = 0;
    const d = new Date(start);
    while (d <= end) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6 && !hols.has(f(d))) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  }

  // ============ DERIVED FIELD RECOMPUTE ============
  function recomputeHolding(h, notional) {
    const base = notional ?? totalNotional;
    h.size = base > 0 ? (h.qty * h.cost / base) * 100 : h.size;
    // Floating P&L includes accumulated CC premium (real income);
    // rMult stays price-based so it keeps measuring the original plan.
    h.pnlDollar = Math.round((h.last - h.cost) * h.qty + ccNet(h));
    h.pnlPct = (h.cost > 0 && h.qty > 0) ? h.pnlDollar / (h.cost * h.qty) : 0;
    h.risk1R = h.stop ? h.cost - h.stop : 0;
    h.rMult = h.risk1R !== 0 ? (h.last - h.cost) / h.risk1R : 0;
    if (h.entry) h.days = calcTradingDays(h.entry);
  }

  // ── Covered Call premium records ─────────────────────────────────────────
  // h.cc = [{ id, date, premium (per share), shares }]
  // Premiums lower the *effective* cost basis for display only — h.cost stays
  // untouched so R-multiple / stop distance keep measuring the original plan.
  function ccNet(h) {
    return (h.cc || []).reduce((s, c) => s + (c.total || 0), 0);
  }
  function ccAdjCost(h) {
    const net = ccNet(h);
    return net > 0 && h.qty > 0 ? h.cost - net / h.qty : h.cost;
  }

  // Today's % change for the ticker tape / daily P&L modules.
  // Derived from the holding's own last + prevClose (the SAME two numbers we display),
  // so price and % are always self-consistent. prevClose is persisted and frozen outside
  // market hours, so this stays correct even when a single fetch cycle flakes — no more
  // "+0.00% then loads one by one" gradual population.
  function computeChangePct(h) {
    return (h.prevClose > 0 && h.last > 0)
      ? (h.last - h.prevClose) / h.prevClose * 100
      : null;
  }

  // Today's dollar P&L for ONE holding — computed directly as (last - prevClose) * qty.
  // Both the "今日盈亏" card and the per-stock breakdown use this single helper, so the
  // card total is always exactly the sum of the rows shown. Computing from prevClose
  // directly (instead of reconstructing via changePct) keeps $ and % self-consistent even
  // when changePct came from a different source (e.g. crypto server todaysChangePerc).
  function todayPnlOf(h) {
    return (h.prevClose > 0 && h.last > 0 && h.qty)
      ? Math.round((h.last - h.prevClose) * h.qty)
      : 0;
  }

  // ============ MODAL MANAGEMENT ============
  function openModal(modalId) {
    const modal = $(`#${modalId}`);
    if (modal) modal.classList.add("open");
  }
  function closeModal(modalId) {
    const modal = $(`#${modalId}`);
    if (modal) modal.classList.remove("open");
  }

  // ============ TAB & DATA ROUTING ============
  function getTableData() {
    return activeTab === "open" ? HOLDINGS : CLOSED_POSITIONS;
  }

  // ============ HOLDINGS TABLE ============

  function renderTable() {
    // header
    const thead = $("#thead-row");
    thead.innerHTML = COLS.filter(c => c.on && !(activeTab === "closed" && c.closedHide)).map(c => {
      const sorted = sortKey === c.id ? "sorted" : "";
      const label = (activeTab === "closed" && c.id === "last") ? "平仓价"
                  : (activeTab === "closed" && c.id === "pnl")  ? "盈亏"
                  : c.label;
      return `<th class="${c.r ? "right" : ""} ${sorted}" data-col="${c.id}">${label}</th>`;
    }).join("");
    $$("#thead-row th").forEach(th => th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortKey === col) sortDir *= -1; else { sortKey = col; sortDir = -1; }
      renderTable();
    }));

    // filter + sort
    const data = getTableData();
    let rows = data.filter(h => {
      if (activeTab === "closed") {
        const pnl = h.pnlFinal ?? h.pnlDollar ?? 0;
        if (closedFilter === "profit" && pnl <= 0) return false;
        if (closedFilter === "loss"   && pnl >= 0) return false;
        if (closedFilter === "even"   && pnl !== 0) return false;
      } else {
        if (filter === "equity" && h.kind !== "equity") return false;
        if (filter === "etf"    && h.kind !== "etf") return false;
        if (filter === "crypto" && h.kind !== "crypto") return false;
        if (filter === "risk"   && !["Pullback", "Near Stop"].includes(progressBucket(h))) return false;
        if (filter === "target" && progressBucket(h) !== "Near Target") return false;
      }
      if (query) {
        const q = query.toLowerCase();
        if (!(h.sym.toLowerCase().includes(q) || h.name.toLowerCase().includes(q))) return false;
      }
      return true;
    });

    const keyFn = {
      tk: h => h.sym, bxbars: h => h.bx.dailyBars, cost: h => h.cost, last: h => h.last,
      qty: h => h.qty, pnl: h => h.pnlDollar, stop: h => h.stop, target: h => h.target,
      progstatus: h => progressBucket(h),
    }[sortKey] || (h => h.pnlDollar);
    rows.sort((a, b) => {
      const va = keyFn(a), vb = keyFn(b);
      if (va < vb) return -1 * sortDir;
      if (va > vb) return 1 * sortDir;
      return 0;
    });

    // update toggle icon
    const _vtBtn = document.getElementById("holdings-view-toggle");
    if (_vtBtn) {
      _vtBtn.title = holdingsViewMode === "card" ? "切换为列表视图" : "切换为卡片视图";
      _vtBtn.innerHTML = holdingsViewMode === "card"
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>`;
    }

    // show/hide containers
    const _hw = document.getElementById("holdings")?.parentElement;
    const _hc = document.getElementById("holdings-cards");
    if (holdingsViewMode === "card") {
      if (_hw) _hw.style.display = "none";
      if (_hc) _hc.style.display = "flex";
      renderHoldingsCards(rows);
    } else {
      if (_hw) _hw.style.display = "";
      if (_hc) _hc.style.display = "none";

      // body
      const cols = COLS.filter(c => c.on && !(activeTab === "closed" && c.closedHide));
      const colSpan = cols.length + 1; // +1 for actions column
      const makeHoldingRow = (h, i) => {
        const isSel = selectedSym === h.sym ? "selected" : "";
        const cells = cols.map(c => renderCell(h, c.id)).join("");
        const actions = activeTab === "open"
          ? `<td style="width:60px;padding:6px 4px"><div class="row-actions">
               <button class="close-pos-btn" data-sym="${h.sym}" title="平仓 (归档)"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></button>
               <button class="delete-btn" data-sym="${h.sym}" title="永久删除"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
             </div></td>`
          : `<td style="width:60px;padding:6px 4px"><div class="row-actions">
               <button class="restore-btn" data-sym="${h.sym}" title="撤回至持仓"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>
               <button class="delete-btn" data-sym="${h.sym}" data-from="closed" title="永久删除"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
             </div></td>`;
        return `<tr class="${isSel}" data-sym="${h.sym}" data-idx="${i}">${cells}${actions}</tr>`;
      };

      if (activeTab === "open") {
        const groups = {};
        rows.forEach(h => {
          const d = h.entry?.slice(0, 10) || "—";
          (groups[d] = groups[d] || []).push(h);
        });
        const thisYear = new Date().getFullYear();
        $("#tbody").innerHTML = Object.keys(groups)
          .sort((a, b) => b.localeCompare(a))
          .map(date => {
            const dt = date !== "—" ? new Date(date + "T00:00:00") : null;
            const label = dt
              ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(dt.getFullYear() !== thisYear && { year: "numeric" }) })
              : "—";
            const hdr = `<tr class="date-group-hdr"><td colspan="${colSpan}">${label}</td></tr>`;
            return hdr + groups[date].map(h => makeHoldingRow(h, rows.indexOf(h))).join("");
          }).join("");
      } else {
        $("#tbody").innerHTML = rows.map((h, i) => makeHoldingRow(h, i)).join("");
      }

      $$("#tbody tr").forEach(tr => {
        tr.addEventListener("click", e => {
          if (e.target.closest(".close-pos-btn, .delete-btn, .restore-btn")) return;
          openDrawer(rows[parseInt(tr.dataset.idx)]);
        });
      });

      $$(".close-pos-btn").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          openCloseModal(btn.dataset.sym);
        });
      });

      $$(".delete-btn").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          openDeleteModal(btn.dataset.sym, btn.dataset.from || "open");
        });
      });
      $$(".restore-btn").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          restoreClosedPosition(btn.dataset.sym);
        });
      });
    }

    // counts
    const rc = $("#row-count"); if (rc) rc.textContent = rows.length;
    $("#c-open").textContent   = HOLDINGS.length;
    $("#c-closed").textContent = CLOSED_POSITIONS.length;
    if (activeTab === "closed") {
      const cp = CLOSED_POSITIONS;
      const profit = cp.filter(h => (h.pnlFinal ?? h.pnlDollar ?? 0) > 0).length;
      const loss   = cp.filter(h => (h.pnlFinal ?? h.pnlDollar ?? 0) < 0).length;
      const even   = cp.filter(h => (h.pnlFinal ?? h.pnlDollar ?? 0) === 0).length;
      const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
      set("#c-cl-all",    cp.length);
      set("#c-cl-profit", profit);
      set("#c-cl-loss",   loss);
      set("#c-cl-even",   even);
    } else {
      $("#c-all").textContent  = data.length;
      $("#c-eq").textContent   = data.filter(h => h.kind === "equity").length;
      $("#c-etf").textContent  = data.filter(h => h.kind === "etf").length;
      $("#c-cr").textContent   = data.filter(h => h.kind === "crypto").length;
      $("#c-rk").textContent   = data.filter(h => ["Pullback", "Near Stop"].includes(progressBucket(h))).length;
      $("#c-tg").textContent   = data.filter(h => progressBucket(h) === "Near Target").length;
    }
  }

  function holdingCard(h, opts = {}) {
    const isClosed = activeTab === "closed";
    const bucket = progressBucket(h);
    const bs = BUCKET_STATUS[bucket] || { label: "—", cls: "ok", color: "var(--accent)" };
    const pnl = isClosed ? (h.pnlFinal ?? h.pnlDollar ?? 0) : (h.pnlDollar ?? 0);
    const pct = h.pnlPct ?? 0;
    const rVal = h.rMult ?? 0;
    const pnlSign = fmt.sign(pnl);
    const rSign = fmt.sign(rVal);
    const displayPrice = isClosed ? (h.closePrice ?? h.last) : h.last;

    let progPct = 0;
    let progColor = "var(--accent)";
    if (!isClosed && h.cost && h.stop && h.target && h.last) {
      const baseCost = ccAdjCost(h);
      if (h.last >= baseCost) {
        progPct = Math.min(1, (h.last - baseCost) / (h.target - baseCost));
      } else {
        progPct = -Math.min(1, (baseCost - h.last) / (baseCost - h.stop));
      }
      progColor = bs.color;
    }

    const statusLabel = isClosed ? (pnl > 0 ? "盈利" : pnl < 0 ? "亏损" : "持平") : bs.label.split(" · ")[0];
    const statusCls   = isClosed ? (pnl > 0 ? "ok" : pnl < 0 ? "danger" : "neu") : bs.cls;

    const flagBtn = opts.sim && !isClosed
      ? `<button class="hc-action sim-flag-btn ${h.flagged ? 'flagged' : ''}" data-sym="${h.sym}" title="候选标记"><svg width="11" height="11" viewBox="0 0 24 24" fill="${h.flagged ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>`
      : "";

    const actions = !isClosed
      ? `${flagBtn}<button class="hc-action close-pos-btn" data-sym="${h.sym}" title="平仓"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></button>
         <button class="hc-action delete-btn" data-sym="${h.sym}" title="删除"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`
      : `<button class="hc-action ${opts.sim ? 'sim-restore-btn' : 'restore-btn'}" data-sym="${h.sym}" title="撤回至持仓"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>
         <button class="hc-action delete-btn" data-sym="${h.sym}" data-from="closed" title="删除"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;

        const selectedCls = opts.selected ? " selected" : "";
    const flaggedCls  = opts.sim && h.flagged ? " sim-flagged" : "";

    return `<div class="hc-card${selectedCls}${flaggedCls}" data-sym="${h.sym}">
      <div class="hc-top">
        <div class="tk">
          <div class="avatar${h.kind === "crypto" ? " crypto" : ""}">
            ${logoImg(h)}${h.sym.slice(0, h.kind === "crypto" ? 3 : 4)}
          </div>
          <div class="meta">
            <div class="sym">${h.sym}</div>
            <div class="nm">${h.name}</div>
          </div>
        </div>
        <div class="hc-head-right">
          <div class="hc-head-top">
            ${!isClosed ? (() => {
              const grade = h.bx?.entryFinalGrade;
              if (!grade) return "";
              const meta = BX_GRADE_META[grade] || BX_GRADE_META["C"];
              const rs = h.bx?.entryRsResult;
              const rsLabel = rs ? `<span class="hc-grade-rs">${rs.score}/${rs.max}</span>` : "";
              return `<span class="hc-grade-chip" style="color:${meta.color};border-color:${meta.color};background:color-mix(in oklch,${meta.color} 12%,transparent)">${grade}</span>${rsLabel}`;
            })() : ""}
            <span class="status ${statusCls}"><span class="dot"></span>${statusLabel}</span>
          </div>
          <div class="hc-actions">${actions}</div>
        </div>
      </div>
      <div class="hc-body">
        <div class="hc-pnl-row">
          <span class="hc-pnl ${pnlSign}">${fmt.signed(pnl)}</span>
          <span class="hc-pct ${pnlSign}">${fmt.pct(pct)}</span>
          <span class="hc-sep muted">·</span>
          <span class="hc-days muted">${h.days ?? 0}天</span>
        </div>
        ${!isClosed ? `<div class="hc-prog-wrap">
          <div class="hc-prog-fill" style="width:${(Math.abs(progPct)*100).toFixed(1)}%;background:${progColor};"></div>
        </div>` : ""}
        <div class="hc-price-row">
          <span class="hc-entry-price">${ccNet(h) > 0 ? `<span class="cc-tag">cc</span>入 $${price(ccAdjCost(h))}` : `入 $${price(h.cost)}`}</span>
          <span class="hc-price-arrow">→</span>
          <span class="hc-cur-price">$${price(displayPrice)}</span>
        </div>
      </div>
    </div>`;
  }

  function renderHoldingsCards(rows) {
    const el = document.getElementById("holdings-cards");
    if (!el) return;
    if (!rows.length) { el.innerHTML = `<div class="hc-empty">暂无持仓</div>`; return; }
    if (activeTab === "open") {
      const groups = {};
      rows.forEach(h => { const d = h.entry?.slice(0, 10) || "—"; (groups[d] = groups[d] || []).push(h); });
      const thisYear = new Date().getFullYear();
      el.innerHTML = Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(date => {
        const dt = date !== "—" ? new Date(date + "T00:00:00") : null;
        const label = dt ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(dt.getFullYear() !== thisYear && { year: "numeric" }) }) : "—";
        return `<div class="hc-date-hdr">${label}</div>` + groups[date].map(h => holdingCard(h)).join("");
      }).join("");
    } else {
      el.innerHTML = rows.map(h => holdingCard(h)).join("");
    }
    el.querySelectorAll(".hc-card").forEach(card => {
      card.addEventListener("click", e => {
        if (e.target.closest(".hc-action")) return;
        const h = rows.find(r => r.sym === card.dataset.sym);
        if (h) openDrawer(h);
      });
    });
    el.querySelectorAll(".close-pos-btn").forEach(btn =>
      btn.addEventListener("click", e => { e.stopPropagation(); openCloseModal(btn.dataset.sym); }));
    el.querySelectorAll(".delete-btn").forEach(btn =>
      btn.addEventListener("click", e => { e.stopPropagation(); openDeleteModal(btn.dataset.sym, btn.dataset.from || "open"); }));
    el.querySelectorAll(".restore-btn").forEach(btn =>
      btn.addEventListener("click", e => { e.stopPropagation(); restoreClosedPosition(btn.dataset.sym); }));
  }

  function renderSimHoldingsCards(rows) {
    const el = document.getElementById("sim-holdings-cards");
    if (!el) return;
    if (!rows.length) { el.innerHTML = '<div class="hc-empty">暂无持仓</div>'; return; }
    const prevTab = activeTab;
    activeTab = simActiveTab;
    if (simActiveTab === "open") {
      const groups = {};
      rows.forEach(h => { const d = h.entry?.slice(0, 10) || "—"; (groups[d] = groups[d] || []).push(h); });
      const thisYear = new Date().getFullYear();
      el.innerHTML = Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(date => {
        const dt = date !== "—" ? new Date(date + "T00:00:00") : null;
        const label = dt ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(dt.getFullYear() !== thisYear && { year: "numeric" }) }) : "—";
        return `<div class="hc-date-hdr">${label}</div>` + groups[date].map(h => holdingCard(h, { sim: true, selected: simSelectedSym === h.sym })).join("");
      }).join("");
    } else {
      el.innerHTML = rows.map(h => holdingCard(h, { sim: true, selected: simSelectedSym === h.sym })).join("");
    }
    activeTab = prevTab;
    el.querySelectorAll(".hc-card").forEach(card => {
      card.addEventListener("click", e => {
        if (e.target.closest(".hc-action")) return;
        const h = rows.find(r => r.sym === card.dataset.sym);
        if (h) openSimDrawer(h, simActiveTab);
      });
    });
    el.querySelectorAll(".sim-flag-btn").forEach(btn =>
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const h = SIM_HOLDINGS.find(x => x.sym === btn.dataset.sym);
        if (!h) return;
        h.flagged = !h.flagged;
        saveToStorage();
        renderSimTable();
      }));
    el.querySelectorAll(".close-pos-btn").forEach(btn =>
      btn.addEventListener("click", e => { e.stopPropagation(); openCloseModal(btn.dataset.sym); }));
    el.querySelectorAll(".delete-btn").forEach(btn =>
      btn.addEventListener("click", e => { e.stopPropagation(); openDeleteModal(btn.dataset.sym, btn.dataset.from || "open"); }));
    el.querySelectorAll(".sim-restore-btn").forEach(btn =>
      btn.addEventListener("click", e => { e.stopPropagation(); simRestoreClosedPosition(btn.dataset.sym); }));
  }

  function renderCell(h, id) {
    switch (id) {
      case "tk": {
        const initials = h.sym.slice(0, h.kind === "crypto" ? 3 : 4);
        return `<td class="ticker"><div class="tk">
            <div class="avatar ${h.kind === "crypto" ? "crypto" : ""}">
              ${logoImg(h)}
              ${initials}
            </div>
            <div class="meta"><div class="sym">${h.sym}</div><div class="nm">${h.name}</div></div>
          </div></td>`;
      }
      case "bxbars": {
        const grade = h.bx?.entryFinalGrade;
        if (grade) {
          const meta = BX_GRADE_META[grade] || BX_GRADE_META["C"];
          const rs = h.bx?.entryRsResult;
          const rsLabel = rs ? `<span class="bxg-rs">${rs.score}/${rs.max}</span>` : "";
          return `<td><div class="bxg-cell"><span class="bxg-val" style="color:${meta.color}">${grade}</span>${rsLabel}</div></td>`;
        }
        return `<td><span style="color:var(--fg-3);font-size:12px">—</span></td>`;
      }
      case "cost": return ccNet(h) > 0
        ? `<td class="right num muted" style="font-size:12px" title="原始成本 $${price(h.cost)} · 累计权利金 +$${ccNet(h).toFixed(0)}"><span class="cc-tag">cc</span>$${price(ccAdjCost(h))}</td>`
        : `<td class="right num muted" style="font-size:12px">$${price(h.cost)}</td>`;
      case "last": {
        const p = (activeTab === "closed" && h.closePrice != null) ? h.closePrice : h.last;
        return `<td class="right num" style="font-weight:600;font-size:12px">$${price(p)}</td>`;
      }
      case "qty": return `<td class="right num muted" style="font-size:12px">${h.qty.toLocaleString("en-US")}</td>`;
      case "pnl": return `<td class="right"><div class="pnl-cell"><span class="num ${fmt.sign(h.pnlDollar)}" style="font-size:15px;font-weight:700;letter-spacing:-0.01em">${fmt.signed(h.pnlDollar)}</span><span class="num ${fmt.sign(h.pnlDollar)}" style="font-size:12px;opacity:0.6">${fmt.pct(h.pnlPct)}</span></div></td>`;
      case "stop": {
        const isOpen = h.closePrice == null;
        const bucket = isOpen ? progressBucket(h) : "";
        const nearStop = isOpen && (bucket === "Near Stop" || bucket === "Pullback");
        const dot = nearStop ? `<span class="alert-dot stop-dot"></span>` : "";
        return `<td class="right num" style="color:color-mix(in oklch,var(--down) 70%,transparent);font-size:12px">${dot}$${price(h.stop)}</td>`;
      }
      case "target": {
        const isOpen = h.closePrice == null;
        const nearTarget = isOpen && progressBucket(h) === "Near Target";
        const dot = nearTarget ? `<span class="alert-dot target-dot"></span>` : "";
        return `<td class="right num" style="color:color-mix(in oklch,var(--up) 70%,transparent);font-size:12px">${dot}$${price(h.target)}</td>`;
      }
      case "progstatus": {
        if (activeTab === "closed") {
          const pnl = h.pnlFinal ?? h.pnlDollar ?? 0;
          const stCls = pnl > 0 ? "ok" : pnl < 0 ? "danger" : "neu";
          const stLbl = pnl > 0 ? "盈利 · Win" : pnl < 0 ? "亏损 · Loss" : "持平 · Even";
          return `<td><span class="status ${stCls}"><span class="dot"></span>${stLbl}</span></td>`;
        }
        const bucket = progressBucket(h);
        const status = BUCKET_STATUS[bucket];
        return `<td><span class="status ${status.cls}"><span class="dot"></span>${status.label}</span></td>`;
      }
      case "setup": return `<td><span class="setup-chip">${h.setup}</span></td>`;
      case "entry": return `<td class="num muted" style="font-size:11.5px">${fmt.date(h.entry)}</td>`;
      case "days": return `<td class="right num muted" style="font-size:11.5px">${h.days}d</td>`;
      case "spark": {
        const color = h.pnlPct >= 0 ? "var(--up)" : "var(--down)";
        return `<td class="spark-cell">${sparkSVG(h.spark, 72, 22, color)}</td>`;
      }
      case "size": {
        const w = Math.min(100, (h.size / 15) * 100);
        return `<td class="right"><div class="posbar"><span class="num muted">${h.size.toFixed(1)}%</span><div class="bar"><div class="fill" style="width:${w}%"></div></div></div></td>`;
      }
      case "pnld": return `<td class="right num ${fmt.sign(h.pnlDollar)}" style="font-weight:600">${fmt.signed(h.pnlDollar)}</td>`;
      case "pnlp": return `<td class="right num ${fmt.sign(h.pnlPct)}">${fmt.pct(h.pnlPct)}</td>`;
      case "rmult": return renderRCell(h);
      case "status": return `<td><span class="status ${statusClass(h.status)}"><span class="dot"></span>${STATUS_LABEL[h.status]}</span></td>`;
    }
    return "<td></td>";
  }

  function statusClass(s) {
    return { ok: "ok", warn: "warn", danger: "danger", target: "target", trim: "target", earnings: "warn", neutral: "neutral" }[s] || "neutral";
  }

  function renderRCell(h) {
    const r = h.rMult;
    const capped = Math.max(-1.5, Math.min(3, r));
    // track spans -1.5R..+3R, zero at 33.33%
    const minR = -1.5, maxR = 3;
    const zeroPct = (0 - minR) / (maxR - minR);
    const nowPct = (capped - minR) / (maxR - minR);
    let left, width, cls;
    if (r >= 0) {
      left = zeroPct * 100; width = (nowPct - zeroPct) * 100; cls = "";
    } else {
      left = nowPct * 100; width = (zeroPct - nowPct) * 100; cls = "neg";
    }
    return `<td class="right">
      <div class="rbar">
        <span class="num ${fmt.sign(r)}" style="min-width:46px;display:inline-block;text-align:right">${fmt.rMult(r)}</span>
        <div class="track"><div class="zero"></div><div class="fill ${cls}" style="left:${left}%;width:${width}%"></div></div>
      </div>
    </td>`;
  }

  // ============ DRAWER ============
  function _drawerNavList(isSim) {
    const tbodySel = isSim ? "#sim-tbody" : "#tbody";
    const trs = $$(`${tbodySel} tr[data-idx]`);
    if (trs.length) return { mode: "table", trs };
    const data = isSim
      ? (simActiveTab === "open" ? SIM_HOLDINGS : SIM_CLOSED)
      : (activeTab === "open" ? HOLDINGS : CLOSED_POSITIONS);
    return { mode: "data", data };
  }

  function updateDrawerNavCounter(isSim) {
    const counter = $("#drawer-nav-counter");
    if (!counter) return;
    const curSym = isSim ? simSelectedSym : selectedSym;
    const nav = _drawerNavList(isSim);
    if (nav.mode === "table") {
      const idx = nav.trs.findIndex(tr => tr.dataset.sym === curSym);
      if (idx >= 0 && nav.trs.length > 1) { counter.textContent = `${idx + 1} / ${nav.trs.length}`; counter.style.display = ""; return; }
    } else {
      const idx = nav.data.findIndex(h => h.sym === curSym);
      if (idx >= 0 && nav.data.length > 1) { counter.textContent = `${idx + 1} / ${nav.data.length}`; counter.style.display = ""; return; }
    }
    counter.style.display = "none";
  }

  // Direction of the last swipe ("next" | "prev"), consumed by _playDrawerSwipeAnim()
  // on the next drawer render so list-click opens stay un-animated.
  let _drawerSwipeDir = null;
  let _drawerSwipeTimer = null;
  function _playDrawerSwipeAnim() {
    const dir = _drawerSwipeDir;
    _drawerSwipeDir = null;
    if (!dir) return;
    const drawer = $("#drawer");
    if (!drawer) return;
    const cls = dir === "next" ? "swipe-next" : "swipe-prev";
    drawer.classList.remove("swipe-next", "swipe-prev");
    void drawer.offsetWidth; // reflow so the animation restarts on rapid swipes
    drawer.classList.add(cls);
    clearTimeout(_drawerSwipeTimer);
    _drawerSwipeTimer = setTimeout(() => drawer.classList.remove("swipe-next", "swipe-prev"), 320);
  }

  function wireDrawerSwipe(isSim) {
    const head = $(".drawer-head", $("#drawer"));
    if (!head) return;
    let tx0 = 0, ty0 = 0;
    head.addEventListener("touchstart", e => {
      tx0 = e.touches[0].clientX;
      ty0 = e.touches[0].clientY;
    }, { passive: true });
    head.addEventListener("touchend", e => {
      const dx = e.changedTouches[0].clientX - tx0;
      const dy = e.changedTouches[0].clientY - ty0;
      if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
      const dir = dx < 0 ? 1 : -1;
      _drawerSwipeDir = dir > 0 ? "next" : "prev"; // swipe left → next, right → prev
      const curSym = isSim ? simSelectedSym : selectedSym;
      const nav = _drawerNavList(isSim);
      if (nav.mode === "table") {
        const curIdx = nav.trs.findIndex(tr => tr.dataset.sym === curSym);
        const next = dir > 0 ? (curIdx + 1) % nav.trs.length : (curIdx <= 0 ? nav.trs.length - 1 : curIdx - 1);
        nav.trs[next].click();
      } else if (nav.data.length) {
        const curIdx = nav.data.findIndex(h => h.sym === curSym);
        const next = dir > 0 ? (curIdx + 1) % nav.data.length : (curIdx <= 0 ? nav.data.length - 1 : curIdx - 1);
        if (isSim) openSimDrawer(nav.data[next], simActiveTab);
        else openDrawer(nav.data[next]);
      }
    }, { passive: true });
    updateDrawerNavCounter(isSim);
  }

  function openDrawer(h) {
    if (!h) return;
    selectedSym = h.sym;
    renderTable();
    $("#drawer").innerHTML = drawerHTML(h);
    wireBX(h);
    if (activeTab === "open") {
      wireDrawerEdits(h);
      wireDrawerCloseButton();
      wireAddToPosition(h, HOLDINGS, totalNotional, () => { renderTable(); renderOverview(); });
      wireCCRecords(h, false);
    } else {
      wireClosedDrawerEdits(h, false);
      wireDrawerRestoreButton(h, false);
    }
    wireExecRecordDeletes(h, false);
    wireDrawerSwipe(false);
    $("#drawer").classList.add("open");
    $("#backdrop").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
    _playDrawerSwipeAnim();
  }

  function wireAddToPosition(h, holdings, notional, onDone) {
    const btn = $("#drawer-add-btn");
    if (!btn) return;
    btn.onclick = () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      $("#add-to-title").textContent = `加仓 · ${h.sym}`;
      $("#add-price").value = h.last || h.cost;
      $("#add-qty").value = "";
      $("#add-date").value = todayStr;
      openModal("add-to-modal");
    };
    // Use onclick so re-wiring on each drawer open replaces the old handler
    $("#add-to-form").onsubmit = e => {
      e.preventDefault();
      const addPrice = parseFloat($("#add-price").value);
      const addQty   = parseInt($("#add-qty").value);
      const addDate  = $("#add-date").value || new Date().toISOString().slice(0, 10);
      if (!addPrice || !addQty) { alert("请填写加仓价格和数量"); return; }

      const oldQty  = h.qty;
      const oldCost = h.cost;
      const newQty  = oldQty + addQty;
      const newCost = (oldCost * oldQty + addPrice * addQty) / newQty;

      h.qty  = newQty;
      h.cost = parseFloat(newCost.toFixed(4));
      h.size = notional > 0 ? (newQty * h.cost / notional) * 100 : h.size;
      h.risk1R = h.stop ? h.cost - h.stop : 0;

      if (!Array.isArray(h.entries)) {
        h.entries = [{ type: "open", date: h.entry, price: oldCost, qty: oldQty }];
      }
      h.entries.push({ type: "add", date: addDate, price: addPrice, qty: addQty });

      recomputeHolding(h, notional);
      saveToStorage();
      closeModal("add-to-modal");
      onDone();

      const execList = $(".exec-list", $("#drawer"));
      if (execList) {
        execList.innerHTML = h.entries.map(ex => `
          <div class="exec-item">
            <span class="exec-type ${ex.type === 'open' ? 'open' : 'add'}">${ex.type === "open" ? "开仓" : "加仓"}</span>
            <span class="exec-date">${fmt.date(ex.date)}</span>
            <span class="exec-price mono">$${price(ex.price)}</span>
            <span class="exec-qty muted">${ex.qty} 股</span>
          </div>`).join("");
      }
    };
  }

  function wireCCRecords(h, isSim) {
    const btn = $("#drawer-cc-btn");
    if (btn) {
      btn.onclick = () => {
        $("#cc-title").textContent = `记录权利金 · ${h.sym}`;
        $("#cc-date").value = new Date().toISOString().slice(0, 10);
        $("#cc-total").value = "";
        openModal("cc-modal");
      };
      // onclick so re-wiring on each drawer open replaces the old handler
      $("#cc-form").onsubmit = e => {
        e.preventDefault();
        const total = parseFloat($("#cc-total").value);
        const date  = $("#cc-date").value || new Date().toISOString().slice(0, 10);
        if (!total || total <= 0) { alert("请填写权利金总额"); return; }
        if (!Array.isArray(h.cc)) h.cc = [];
        h.cc.push({ id: Date.now().toString(36), date, total });
        recomputeHolding(h, isSim ? simNotional : totalNotional);
        saveToStorage();
        closeModal("cc-modal");
        if (isSim) { renderSimOverview(); openSimDrawer(h, simActiveTab); }
        else       { renderOverview();    openDrawer(h); }
      };
    }
    $$(".cc-del", $("#drawer")).forEach(del => {
      del.addEventListener("click", e => {
        e.stopPropagation();
        h.cc = (h.cc || []).filter(c => c.id !== del.dataset.ccId);
        recomputeHolding(h, isSim ? simNotional : totalNotional);
        saveToStorage();
        if (isSim) { renderSimOverview(); openSimDrawer(h, simActiveTab); }
        else       { renderOverview();    openDrawer(h); }
      });
    });
  }

  function wireExecRecordDeletes(h, isSim) {
    const closedArr = isSim ? SIM_CLOSED : CLOSED_POSITIONS;
    const reopen = () => {
      if (isSim) { renderSimTable(); renderSimOverview(); openSimDrawer(h, h.closedAt ? "closed" : "open"); }
      else        { renderTable();    renderOverview();    openDrawer(h); }
    };
    $$(".exec-del", $("#drawer")).forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        if (btn.dataset.execType === "entry") {
          const idx = parseInt(btn.dataset.execIdx);
          if (Array.isArray(h.entries) && idx >= 0 && idx < h.entries.length) {
            h.entries.splice(idx, 1);
            saveToStorage();
            reopen();
          }
        } else if (btn.dataset.execType === "partial") {
          const closedAt = btn.dataset.execClosedat;
          const qty = parseFloat(btn.dataset.execQty);
          const idx = closedArr.findIndex(c =>
            c.sym === h.sym && c.entry === h.entry &&
            Math.abs(c.cost - h.cost) < 0.001 &&
            c.closedAt === closedAt && Math.abs(c.qty - qty) < 0.001);
          if (idx !== -1) { closedArr.splice(idx, 1); saveToStorage(); reopen(); }
        }
      });
    });
  }

  function wireDrawerCloseButton() {
    const closeBtn = $("#drawer-close-position");
    if (!closeBtn) return;
    closeBtn.addEventListener("click", () => openCloseModal(selectedSym));
  }
  function closeDrawer() {
    selectedSym = null;
    $("#drawer").classList.remove("open");
    $("#backdrop").classList.remove("open");
    $("#drawer").setAttribute("aria-hidden", "true");
    renderTable();
  }

  function drawerHTML(h, isSim = false) {
    const isClosed = activeTab === "closed";
    const closedArr = isSim ? SIM_CLOSED : CLOSED_POSITIONS;
    // Partial close records for this symbol (for open positions that have been partially exited)
    const partialCloses = closedArr
      .filter(c => c.sym === h.sym && c.entry === h.entry && Math.abs(c.cost - h.cost) < 0.001 && c.exitReason === "partial")
      .sort((a, b) => (a.closedAt || "").localeCompare(b.closedAt || ""));
    // Status badge
    let badgeColor, badgeTxt;
    if (isClosed) {
      badgeColor = "var(--fg-2)"; badgeTxt = "已平仓 · Closed";
    } else {
      const bucket = progressBucket(h);
      const bs = BUCKET_STATUS[bucket];
      badgeColor = bs.color; badgeTxt = bs.label;
    }
    const kindLabel = h.kind === "crypto" ? "Crypto" : h.kind === "etf" ? "ETF" : "Equity";
    const displayPrice = isClosed ? (h.closePrice ?? h.last) : h.last;
    const pnlAmt = isClosed ? (h.pnlFinal ?? h.pnlDollar) : h.pnlDollar;
    const dispDays = calcTradingDays(h.entry, isClosed ? h.closedAt : undefined);
    const pnlPct = isClosed ? h.pnlPct : h.pnlPct;
    const pnlSign = fmt.sign(pnlAmt);
    return `
      <div class="drawer-head">
        <div class="drawer-top">
          <div class="tk">
            <div class="avatar ${h.kind === "crypto" ? "crypto" : ""}">
              ${logoImg(h)}
              ${h.sym.slice(0, h.kind === "crypto" ? 3 : 4)}
            </div>
          </div>
          <div>
            <div class="mono" style="font-size:17px;font-weight:600">${h.sym}</div>
            <div class="muted" style="font-size:11.5px">${h.name} · ${kindLabel}</div>
          </div>
          <span class="statlight" style="color:${badgeColor}; background: color-mix(in oklch, ${badgeColor} 15%, transparent);">
            <span class="dot" style="background:${badgeColor}"></span>${badgeTxt}
          </span>
          <span id="drawer-nav-counter" class="drawer-nav-counter" style="display:none"></span>
          <button class="close" id="drawer-close" title="关闭 (Esc)">✕</button>
        </div>
        <div class="hero-price">
          <span class="p">$${price(displayPrice)}</span>
          ${isClosed ? `<span class="muted" style="font-size:11px;font-family:var(--f-mono);align-self:center">平仓价</span>` : ""}
          <span class="pct ${pnlSign}">${fmt.pct(pnlPct)}</span>
          <span class="pnl ${pnlSign}">${fmt.signed(pnlAmt)}</span>
          <span class="hero-r ${h.rMult != null ? fmt.sign(h.rMult) : ''}">${h.rMult != null ? fmt.rMult(h.rMult) : "—"}</span>
          <span class="hero-date muted">${isClosed ? `平仓 ${fmt.date(h.closedAt)}` : `持仓 ${dispDays}d · since ${fmt.date(h.entry)}`}</span>
        </div>
        ${levelBar(h)}
        ${!isClosed ? `<div class="drawer-actions">
          <button class="btn btn-add-pos" id="drawer-add-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            加仓
          </button>
          <button class="btn btn-exit-pos" id="drawer-close-position">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            平仓出场
          </button>
        </div>` : `<div class="drawer-actions">
          <button class="btn btn-restore-pos" id="drawer-restore-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
            撤回平仓
          </button>
        </div>`}
      </div>

      <div class="drawer-body">
        <!-- 1. 概况 -->
        <div class="drawer-section">
          <h4><span class="idx">01</span>${isClosed ? "平仓记录" : "持仓概况"}</h4>
          ${isClosed ? `
          <div class="kv-grid">
            <div><div class="k">入场成本${ccNet(h) > 0 ? `<span class="edit-hint">CC调整后</span>` : ""}</div><div class="v mono" ${ccNet(h) > 0 ? `title="原始成本 $${price(h.cost)} · 累计权利金 +$${ccNet(h).toFixed(0)}"` : ""}>${ccNet(h) > 0 ? `<span class="cc-tag">cc</span>$${price(ccAdjCost(h))}` : `$${price(h.cost)}`}</div></div>
            <div><div class="k">出场价格<span class="edit-hint">点击编辑</span></div><div class="v"><span class="pos-edit-closed mono" data-closed-field="closePrice" contenteditable="true" spellcheck="false">$${price(h.closePrice ?? h.last)}</span></div></div>
            <div><div class="k">盈亏金额</div><div class="v big ${fmt.sign(pnlAmt)}">${fmt.signed(pnlAmt)}</div></div>
            <div><div class="k">盈亏百分比</div><div class="v ${fmt.sign(pnlAmt)}">${fmt.pct(h.pnlPct)}</div></div>
            <div><div class="k">R 倍数</div><div class="v big ${fmt.sign(h.rMult)}">${fmt.rMult(h.rMult)}</div></div>
            <div><div class="k">持有天数</div><div class="v">${dispDays}<span class="sub">交易日</span></div></div>
          </div>` : `
          <div class="kv-grid">
            <div><div class="k">入场成本${ccNet(h) > 0 ? `<span class="edit-hint">CC调整后</span>` : ""}</div><div class="v mono" ${ccNet(h) > 0 ? `title="原始成本 $${price(h.cost)} · 累计权利金 +$${ccNet(h).toFixed(0)}"` : ""}>${ccNet(h) > 0 ? `<span class="cc-tag">cc</span>$${price(ccAdjCost(h))}` : `$${price(h.cost)}`}</div></div>
            <div><div class="k">现价<span class="edit-hint">点击编辑</span></div><div class="v"><span class="pos-edit mono" data-pos-field="last" contenteditable="true" spellcheck="false">$${price(h.last)}</span></div></div>
            <div><div class="k">止损<span class="edit-hint">点击编辑</span></div><div class="v"><span class="pos-edit" data-pos-field="stop" contenteditable="true" spellcheck="false">$${price(h.stop)}</span></div></div>
            <div><div class="k">目标<span class="edit-hint">点击编辑</span></div><div class="v"><span class="pos-edit" data-pos-field="target" contenteditable="true" spellcheck="false">$${price(h.target)}</span></div></div>
            <div><div class="k">仓位占比<span class="edit-hint">点击编辑</span></div><div class="v"><span class="pos-edit" data-pos-field="size" contenteditable="true" spellcheck="false">${h.size.toFixed(1)}</span><span class="sub">%</span></div></div>
            <div><div class="k">盈亏比 (R:R)</div><div class="v big up">${((h.target - ccAdjCost(h)) / (ccAdjCost(h) - h.stop)).toFixed(2)}<span class="sub">R</span></div></div>
          </div>`}
        </div>

        <!-- 2. BX Trend -->
        ${bxSectionHTML(h)}

        <!-- 3. 交易计划 + 执行记录 + Journal -->
        <div class="drawer-section">
          <h4><span class="idx">03</span>交易计划</h4>
          <div class="plan-prices">
            <div class="plan-price-item">
              <div class="k">止损价格</div>
              <div class="v mono down">$${price(h.stop)}</div>
              <div class="sub">${(() => { const adj = ccAdjCost(h); return adj > h.stop ? `-${((adj - h.stop) / adj * 100).toFixed(1)}%` : "—"; })()}</div>
            </div>
            <div class="plan-price-item">
              <div class="k">止盈价格</div>
              <div class="v mono up">$${price(h.target)}</div>
              <div class="sub">${(() => { const adj = ccAdjCost(h); return h.target > adj ? `+${((h.target - adj) / adj * 100).toFixed(1)}%` : "—"; })()}</div>
            </div>
            <div class="plan-price-item">
              <div class="k">盈亏比</div>
              <div class="v big ${(() => { const adj = ccAdjCost(h); return (h.target - adj) > (adj - h.stop) ? 'up' : 'down'; })()}">${(() => { const adj = ccAdjCost(h); return adj > h.stop && h.target > adj ? ((h.target - adj) / (adj - h.stop)).toFixed(2) : "—"; })()}<span class="sub"> R</span></div>
            </div>
          </div>

          <div class="plan-subhead">执行记录</div>
          <div class="exec-list">
            ${(h.entries || []).map((e, i) => `
              <div class="exec-item">
                <span class="exec-type ${e.type === 'open' ? 'open' : 'add'}">${e.type === "open" ? "开仓" : "加仓"}</span>
                <span class="exec-date">${fmt.date(e.date)}</span>
                <span class="exec-price mono">$${price(e.price)}</span>
                <span class="exec-qty muted">${e.qty} 股</span>
                <button class="exec-del" data-exec-type="entry" data-exec-idx="${i}" title="删除记录">✕</button>
              </div>`).join("") || `
              <div class="exec-item">
                <span class="exec-type open">开仓</span>
                <span class="exec-date">${fmt.date(h.entry)}</span>
                <span class="exec-price mono">$${price(h.cost)}</span>
                <span class="exec-qty muted">${h.qty} 股</span>
              </div>`}
            ${partialCloses.map(c => `
              <div class="exec-item">
                <span class="exec-type" style="background:color-mix(in oklch,var(--warn) 18%,transparent);color:var(--warn)">减仓</span>
                <span class="exec-date">${fmt.date(c.closedAt)}</span>
                <span class="exec-price mono">$${price(c.closePrice)}</span>
                <span class="exec-qty muted">${c.qty} 股</span>
                <span class="exec-qty muted ${fmt.sign(c.pnlFinal)}" style="margin-left:auto">${fmt.signed(c.pnlFinal)}</span>
                <button class="exec-del" data-exec-type="partial" data-exec-closedat="${c.closedAt}" data-exec-qty="${c.qty}" title="删除记录">✕</button>
              </div>`).join("")}
            ${h.closedAt ? `
              <div class="exec-item">
                <span class="exec-type" style="background:color-mix(in oklch,var(--fg-3) 18%,transparent);color:var(--fg-2)">平仓</span>
                <span class="exec-date">${fmt.date(h.closedAt)}</span>
                <span class="exec-price mono">$${price(h.closePrice ?? h.last)}</span>
                <span class="exec-qty muted">${h.qty} 股</span>
              </div>` : ""}
          </div>

          <div class="plan-subhead" style="display:flex;align-items:center;gap:8px">权利金记录 · Covered Call
            ${ccNet(h) > 0 ? `<span class="cc-net mono">累计 +$${ccNet(h).toFixed(0)} · 成本 −${(ccNet(h) / h.qty / h.cost * 100).toFixed(1)}%</span>` : ""}
            ${!isClosed ? `<button class="cc-add-btn" id="drawer-cc-btn" type="button">+ 记录权利金</button>` : ""}
          </div>
          <div class="exec-list" id="cc-list">
            ${(h.cc || []).map(c => `
              <div class="exec-item">
                <span class="exec-type cc">权利金</span>
                <span class="exec-date">${fmt.date(c.date)}</span>
                <span class="exec-price mono up" style="margin-left:auto">+$${(c.total || 0).toFixed(0)}</span>
                ${!isClosed ? `<button class="cc-del" data-cc-id="${c.id}" title="删除">✕</button>` : ""}
              </div>`).join("") || `<div class="exec-item muted" style="font-size:11px">暂无记录</div>`}
          </div>

          <div class="plan-subhead">Journal 笔记</div>
          <textarea class="journal-note-area drawer-journal-note" data-sym="${h.sym}"
            placeholder="记录入场思路、心态、执行情况…" rows="4">${h.journalNote || ""}</textarea>
        </div>
      </div>
    `;
  }

  function levelBar(h) {
    const dispCost = ccAdjCost(h);
    const vals = [h.stop, dispCost, h.last, h.target].sort((a, b) => a - b);
    const lo = vals[0] * 0.98, hi = vals[3] * 1.02;
    const px = v => ((v - lo) / (hi - lo)) * 100;
    return `
      <div class="levelbar">
        <div class="track"></div>
        <div class="marker stop" style="left:${px(h.stop)}%">
          <span class="tag below" style="color:var(--down)">止损 $${price(h.stop)}</span>
          <div class="node"></div>
        </div>
        <div class="marker entry" style="left:${px(dispCost)}%">
          <span class="tag below">成本${ccNet(h) > 0 ? `<span class="cc-tag">cc</span>` : ""} $${price(dispCost)}</span>
          <div class="node"></div>
        </div>
        <div class="marker now" style="left:${px(h.last)}%">
          <span class="tag above" style="color:var(--accent)">现价 $${price(h.last)}</span>
          <div class="node"></div>
        </div>
        <div class="marker target" style="left:${px(h.target)}%">
          <span class="tag below" style="color:var(--up)">目标 $${price(h.target)}</span>
          <div class="node"></div>
        </div>
      </div>`;
  }


  // ============ BOTTOM: review / errors / events ============
  function getReviewData() {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1); // Monday
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return CLOSED_POSITIONS.filter(h => {
      if (!h.closedAt) return false;
      const d = new Date(h.closedAt);
      if (reviewPeriod === "week")  return d >= weekStart;
      if (reviewPeriod === "month") return d >= monthStart;
      return true;
    });
  }

  // Group partial/full closes of the same position into one trade record.
  // Key: sym + entry + cost — all records sharing these belong to one trade.
  function groupTrades(closedArr) {
    const map = new Map();
    for (const h of closedArr) {
      const key = `${h.sym}|${h.entry}|${h.cost}`;
      if (!map.has(key)) map.set(key, { ...h, _pnl: 0, _qty: 0, _lastClose: "" });
      const t = map.get(key);
      t._pnl += (h.pnlFinal ?? 0);
      t._qty += (h.qty ?? 0);
      if ((h.closedAt || "") > (t._lastClose || "")) t._lastClose = h.closedAt || "";
    }
    return [...map.values()].map(t => {
      const risk1R = (t.cost && t.stop && t.cost > t.stop) ? (t.cost - t.stop) * t._qty : 0;
      return {
        ...t,
        pnlFinal:  t._pnl,
        pnlDollar: t._pnl,
        closedAt:  t._lastClose,
        qty:       t._qty,
        rMult:     risk1R > 0 ? Math.round(t._pnl / risk1R * 10) / 10 : (t.rMult ?? 0),
        days:      calcTradingDays(t.entry, t._lastClose),
      };
    });
  }

  // ============ EVENTS CALENDAR ============
  function renderEvents() {
    const el = document.getElementById("events");
    if (!el) return;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + 14);
    const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    const entries = [];
    const addFrom = (arr, src) => arr.forEach(h => {
      if (!h.earnings) return;
      const d = new Date(h.earnings); d.setHours(0, 0, 0, 0);
      if (d >= today && d <= cutoff) entries.push({ h, date: d, src });
    });
    addFrom(HOLDINGS, "real");
    addFrom(SIM_HOLDINGS, "sim");
    entries.sort((a, b) => a.date - b.date);

    if (!entries.length) {
      el.innerHTML = `<div class="events-empty">未来两周内无财报事件</div>`;
      return;
    }

    el.innerHTML = entries.map(({ h, date, src }) => {
      const days = Math.round((date - today) / 86400000);
      const urgColor = days <= 2 ? "var(--down)" : days <= 6 ? "var(--warn)" : "var(--fg-2)";
      const daysLabel = days === 0 ? "今天" : days === 1 ? "明天" : `${days}天后`;
      const srcBadge  = src === "sim"
        ? `<span class="evt-src sim">模拟</span>`
        : `<span class="evt-src real">持仓</span>`;
      return `
        <div class="event">
          <div class="when"><span class="d">${String(date.getDate()).padStart(2,"0")}</span>${MO[date.getMonth()]} · ${WD[date.getDay()]}</div>
          <div class="evt-sym-col"><span class="sym">${h.sym}</span>${srcBadge}</div>
          <div class="evt-days" style="color:${urgColor}">${daysLabel}</div>
        </div>`;
    }).join("");
  }

  function renderBottom() {
    const data = groupTrades(getReviewData());
    const total = data.length;
    const wins  = data.filter(h => (h.pnlFinal ?? 0) > 0).length;
    const losses = data.filter(h => (h.pnlFinal ?? 0) < 0).length;
    const evens = total - wins - losses;
    const winRatePct = total > 0 ? (wins / total * 100).toFixed(1) : null;
    const avgR   = total > 0 ? (data.reduce((s,h) => s + (h.rMult || 0), 0) / total).toFixed(2) : null;
    const avgDays = total > 0 ? (data.reduce((s,h) => s + (h.days || 1), 0) / total).toFixed(1) : null;
    const totalPnl = total > 0 ? Math.round(data.reduce((s,h) => s + (h.pnlFinal ?? 0), 0)) : null;

    const periodTitles = { week: "本周复盘", month: "本月复盘", all: "全部复盘" };

    // Dynamic date ranges — computed fresh each render
    const MO_S = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const _now = new Date();
    const _wStart = new Date(_now); _wStart.setDate(_now.getDate() - (_now.getDay() || 7) + 1); // Mon
    const _wEnd   = new Date(_wStart); _wEnd.setDate(_wStart.getDate() + 4); // Fri
    const _weekStr = _wStart.getMonth() === _wEnd.getMonth()
      ? `${MO_S[_wStart.getMonth()]} ${_wStart.getDate()} – ${_wEnd.getDate()}`
      : `${MO_S[_wStart.getMonth()]} ${_wStart.getDate()} – ${MO_S[_wEnd.getMonth()]} ${_wEnd.getDate()}`;
    const periodRanges = {
      week:  _weekStr,
      month: `${MO_S[_now.getMonth()]} ${_now.getFullYear()}`,
      all:   "All Time"
    };

    // Grade breakdown
    const gradeBuckets = {};
    GRADE_LADDER.forEach(g => { gradeBuckets[g] = []; });
    data.forEach(h => {
      const g = h.bx?.entryFinalGrade;
      if (g && gradeBuckets[g]) gradeBuckets[g].push(h);
      else if (g) gradeBuckets[g] = [h];
    });
    const noGrade = data.filter(h => !h.bx?.entryFinalGrade);
    const gradeMaxCnt = Math.max(1, ...Object.values(gradeBuckets).map(b => b.length), noGrade.length);

    function gradeReviewRow(grade, positions) {
      const cnt = positions.length;
      if (cnt === 0) return "";
      const w = positions.filter(p => (p.pnlFinal ?? p.pnlDollar ?? 0) > 0).length;
      const totalDollar = Math.round(positions.reduce((s, p) => s + (p.pnlFinal ?? p.pnlDollar ?? 0), 0));
      const avgPct = (positions.reduce((s, p) => s + (p.pnlPct ?? 0), 0) / cnt * 100).toFixed(1);
      const barW = Math.round(cnt / gradeMaxCnt * 100);
      const dColor = totalDollar >= 0 ? "var(--up)" : "var(--down)";
      const meta = BX_GRADE_META[grade] || { color: "var(--fg-3)" };
      return `
        <div class="bx-review-row">
          <div class="bx-review-chip">
            <span style="display:inline-block;min-width:28px;text-align:center;font-family:var(--f-mono);font-size:11px;font-weight:700;color:${meta.color}">${grade}</span>
          </div>
          <div class="bx-review-body">
            <div class="bx-review-track">
              <div class="bx-review-fill" style="width:${barW}%;background:${dColor}"></div>
            </div>
            <div class="bx-review-meta">
              <span class="mono" style="font-size:10px;color:var(--fg-2)">${cnt} 笔 · ${Math.round(w / cnt * 100)}% 胜</span>
              <span class="mono" style="font-size:10px;color:${dColor}">${fmt.signed(totalDollar)} · ${parseFloat(avgPct) >= 0 ? "+" : ""}${avgPct}%</span>
            </div>
          </div>
        </div>`;
    }

    // Total P&L badge
    const pnlBadgeHTML = totalPnl !== null
      ? `<span class="review-pnl-badge ${totalPnl >= 0 ? "up" : "down"}">${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toLocaleString("en-US")}</span>`
      : "";

    // Recent closed trades list (sorted by closedAt desc, max 6)
    const recentTrades = [...data]
      .sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))
      .slice(0, 6);
    const tradesHTML = recentTrades.length === 0
      ? `<div style="color:var(--fg-3);font-size:12px;padding:10px 0;text-align:center">暂无交易记录</div>`
      : recentTrades.map(h => {
          const pnl = h.pnlFinal ?? h.pnlDollar ?? 0;
          const cls = pnl >= 0 ? "up" : "down";
          const rVal = h.rMult != null ? ((h.rMult >= 0 ? "+" : "") + h.rMult.toFixed(1) + "R") : "—";
          const dateStr = h.closedAt ? h.closedAt.slice(5, 10).replace("-", "/") : "—";
          return `
            <div class="review-trade-row">
              <span class="review-trade-sym">${h.sym}</span>
              <span class="review-trade-date">${dateStr}</span>
              <span class="review-trade-r ${cls}">${rVal}</span>
              <span class="review-trade-pnl ${cls}">${fmt.signed(Math.round(pnl))}</span>
            </div>`;
        }).join("");

    const reviewPanel = $("#review-panel");
    reviewPanel.innerHTML = `
      <div class="panel-head">
        <div class="panel-title">${periodTitles[reviewPeriod]} <span class="count">${periodRanges[reviewPeriod]}</span>${pnlBadgeHTML}</div>
        <div style="margin-left:auto;display:flex;gap:4px">
          <button class="filter-chip ${reviewPeriod === "week"  ? "active" : ""}" data-period="week">本周</button>
          <button class="filter-chip ${reviewPeriod === "month" ? "active" : ""}" data-period="month">本月</button>
          <button class="filter-chip ${reviewPeriod === "all"   ? "active" : ""}" data-period="all">所有</button>
        </div>
      </div>
      <div class="metric-grid" style="grid-template-columns:repeat(3,1fr); border:0; border-radius:0; background:transparent;">
        <div class="metric">
          <div class="label">胜率</div>
          <div class="v ${winRatePct !== null && parseFloat(winRatePct) >= 50 ? "up" : (winRatePct !== null ? "down" : "")}">${winRatePct !== null ? winRatePct : "—"}<span class="u">${winRatePct !== null ? "%" : ""}</span></div>
          <div class="sub label" style="text-transform:none;letter-spacing:0">${total > 0 ? `${wins}胜 / ${losses}负${evens > 0 ? ` / ${evens}平` : ""} / ${total}笔` : "暂无数据"}</div>
        </div>
        <div class="metric">
          <div class="label">平均盈亏比</div>
          <div class="v">${avgR !== null ? avgR : "—"}<span class="u">${avgR !== null ? "R" : ""}</span></div>
          <div class="sub label" style="text-transform:none;letter-spacing:0">${avgR !== null ? (parseFloat(avgR) >= 2.0 ? '<span class="up">达标 ≥2R</span>' : '<span class="down">未达标</span>') : ""}</div>
        </div>
        <div class="metric">
          <div class="label">平均持有</div>
          <div class="v">${avgDays !== null ? avgDays : "—"}<span class="u">${avgDays !== null ? "天" : ""}</span></div>
          <div class="sub label" style="text-transform:none;letter-spacing:0">${total > 0 ? `共 ${total} 笔平仓` : ""}</div>
        </div>
      </div>
      <div class="panel-head" style="border-top:1px solid var(--line); border-bottom:0">
        <div class="panel-title" style="font-size:11.5px;letter-spacing:0.08em;text-transform:uppercase;color:var(--fg-2);font-weight:500">开仓评级分布</div>
      </div>
      <div style="padding:10px 16px 14px">
        ${total === 0
          ? `<div style="color:var(--fg-3);font-size:12px;padding:14px 0;text-align:center">暂无已平仓数据<br><span style="font-size:10.5px;margin-top:4px;display:block">平仓后将在此显示评级分布统计</span></div>`
          : [...GRADE_LADDER].reverse().map(g => gradeReviewRow(g, gradeBuckets[g] || [])).join("")
            + (noGrade.length > 0 ? gradeReviewRow("—", noGrade) : "")}
      </div>
      <div class="panel-head" style="border-top:1px solid var(--line); border-bottom:0">
        <div class="panel-title" style="font-size:11.5px;letter-spacing:0.08em;text-transform:uppercase;color:var(--fg-2);font-weight:500">最近平仓</div>
        ${recentTrades.length < data.length ? `<span style="margin-left:auto;font-size:10.5px;color:var(--fg-3);font-family:var(--f-mono)">显示最近 ${recentTrades.length} / ${data.length} 笔</span>` : ""}
      </div>
      <div style="padding:8px 16px 14px">
        ${tradesHTML}
      </div>
    `;

    // Wire period buttons
    $$("[data-period]", reviewPanel).forEach(btn => {
      btn.addEventListener("click", () => { reviewPeriod = btn.dataset.period; renderBottom(); });
    });

    renderEvents();
  }

  // ============ TAB SWITCHING ============
  function wireTableTabs() {
    $$("#desk-view .panel-head .tab").forEach(tab => {
      tab.addEventListener("click", () => {
        $$("#desk-view .panel-head .tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        activeTab = tab.dataset.tab;
        filter = "all"; closedFilter = "all";
        const isOpen = activeTab === "open";
        const fo = $("#filters-open"), fc = $("#filters-closed");
        if (fo) fo.style.display = isOpen ? "" : "none";
        if (fc) fc.style.display = isOpen ? "none" : "";
        $$("[data-filter]").forEach(x => x.classList.toggle("active", x.dataset.filter === "all"));
        $$("[data-filter-closed]").forEach(x => x.classList.toggle("active", x.dataset.filterClosed === "all"));
        closeDrawer();
        renderTable();
      });
    });
  }

  // ============ MODAL HANDLERS ============
  function wireNewPositionModal() {
    const form = $("#new-position-form");
    const openBtn = $("#new-pos-btn");
    const closeBtn = $("#new-pos-close");
    const cancelBtn = $("#new-pos-cancel");

    // Auto-uppercase ticker as user types
    $("#form-ticker").addEventListener("input", e => {
      const el = e.target, pos = el.selectionStart;
      el.value = el.value.toUpperCase();
      el.setSelectionRange(pos, pos);
    });

    // Auto-fetch name when ticker is entered — equity/ETF via /api/quote?stocks=
    // (Finnhub/Yahoo, returns a name); crypto via a static map, since /api/quote's
    // crypto leg (Polygon snapshot) never returns a name field to fetch.
    const autoFillName = async () => {
      const sym = $("#form-ticker").value.toUpperCase().trim();
      const nameEl = $("#form-name");
      if (!sym || !nameEl || nameEl.value.trim()) return;
      const kind = $("#form-kind-seg .active")?.dataset.kind || "equity";
      if (kind === "crypto") {
        const nm = CRYPTO_NAMES[sym];
        if (nm) { nameEl.value = nm; nameEl.placeholder = nm; }
        else nameEl.placeholder = "名称（可留空）";
        return;
      }
      nameEl.placeholder = "获取中…";
      try {
        const res = await fetch(`/api/quote?stocks=${encodeURIComponent(sym)}`);
        const { results } = await res.json();
        const fetched = results?.[sym]?.name;
        if (fetched) { nameEl.value = fetched; nameEl.placeholder = fetched; }
        else nameEl.placeholder = "公司名称（可留空）";
      } catch (_) { nameEl.placeholder = "公司名称（可留空）"; }
    };
    $("#form-ticker").addEventListener("blur", autoFillName);

    const readFormBX = () => {
      const body = $("#form-bx-body");
      const dailyBars = body?.querySelector("[data-fbx='dailyBars'].active")?.dataset.val || "0-5";
      const current   = parseFloat(body?.querySelector("[data-fbx='current'].active")?.dataset.val) || 0;
      const weekly    = parseFloat(body?.querySelector("[data-fbx='weekly'].active")?.dataset.val) || 0;
      const monthly   = parseFloat(body?.querySelector("[data-fbx='monthly'].active")?.dataset.val) || 0;
      const snameEl = $("#fbx-sname");
      const sname   = snameEl?.textContent.trim() || "—";
      const scolor  = snameEl?.style.background || "oklch(0.35 0.01 250)";
      return {
        dailyBars, current, weekly, monthly,
        sector:  { name: sname, color: scolor, score: "0", slope: 0, slopeDir: 0 },
        overall: { score: "0", slope: 0, slopeDir: 0 }
      };
    };

    const resetFormBX = () => {
      const toggle = $("#form-bx-toggle"), body = $("#form-bx-body");
      if (toggle) toggle.classList.remove("open");
      if (!body) return;
      body.style.display = "none";
      [["dailyBars","0-5"],["current","0"],["weekly","0"],["monthly","0"]].forEach(([field, def]) => {
        $$(`[data-fbx="${field}"]`, body).forEach(b => b.classList.toggle("active", b.dataset.val === def));
      });
      const snameEl = $("#fbx-sname");
      if (snameEl) { snameEl.textContent = "—"; snameEl.style.background = "oklch(0.35 0.01 250)"; }
      $$(".bx-color-opt", body).forEach(b => b.classList.toggle("active", b.dataset.colorVal === "oklch(0.35 0.01 250)"));
      const etfInput = $("#fbx-sector-etf");
      if (etfInput) etfInput.value = "";
      $$("[data-fbx-st]", body).forEach(b => b.classList.toggle("active", b.dataset.fbxSt === "null"));
      const esc = $("#entry-scorecard");
      if (esc) esc.style.display = "none";
    };

    const todayStr = () => new Date().toISOString().slice(0, 10);
    const resetDateFields = () => {
      const fd = $("#form-date"); if (fd) fd.value = todayStr();
      const fe = $("#form-earnings"); if (fe) fe.value = "";
    };

    const resetOrderType = () => {
      const isSim = newPositionContext === "sim";
      const orderRow = $("#form-order-type-row");
      if (orderRow) orderRow.style.display = isSim ? "" : "none";
      // Reset to manual
      if (orderSeg) {
        $$("button", orderSeg).forEach(b => b.classList.toggle("active", b.dataset.order === "manual"));
      }
      updateOrderUI();
    };
    openBtn.addEventListener("click", () => { newPositionContext = "desk"; resetDateFields(); resetOrderType(); openModal("new-position-modal"); });
    $("#mobile-fab")?.addEventListener("click", () => {
      if (currentPage === "sim") {
        newPositionContext = "sim";
        const fd = $("#form-date"); if (fd) fd.value = new Date().toISOString().slice(0, 10);
        const fe = $("#form-earnings"); if (fe) fe.value = "";
        const orderRow = $("#form-order-type-row");
        if (orderRow) orderRow.style.display = "";
        const orderSeg = $("#form-order-seg");
        if (orderSeg) $$("button", orderSeg).forEach(b => b.classList.toggle("active", b.dataset.order === "manual"));
        const entryRow = $("#form-entry-row"), limitRow = $("#form-limit-row"), mHint = $("#form-market-hint-row");
        if (entryRow) entryRow.style.display = "";
        if (limitRow) limitRow.style.display = "none";
        if (mHint)    mHint.style.display    = "none";
        const ei = $("#form-entry"); if (ei) ei.required = true;
        openModal("new-position-modal");
      } else {
        newPositionContext = "desk"; resetDateFields(); resetOrderType(); openModal("new-position-modal");
      }
    });
    closeBtn.addEventListener("click", () => { newPositionContext = "desk"; resetFormBX(); closeModal("new-position-modal"); });
    cancelBtn.addEventListener("click", () => { newPositionContext = "desk"; resetFormBX(); closeModal("new-position-modal"); });
    let _npMousedownOnBg = false;
    $("#new-position-modal").addEventListener("mousedown", e => { _npMousedownOnBg = e.target === e.currentTarget; });
    $("#new-position-modal").addEventListener("click", e => { if (_npMousedownOnBg && e.target === e.currentTarget) { newPositionContext = "desk"; resetFormBX(); closeModal("new-position-modal"); } });

    // Kind segmented control
    const kindSeg = $("#form-kind-seg");
    if (kindSeg) {
      kindSeg.addEventListener("click", e => {
        const btn = e.target.closest("button[data-kind]");
        if (!btn) return;
        $$("button", kindSeg).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        // Re-resolve the name if the ticker was typed before the kind was set
        // (e.g. a crypto ticker typed while "美股" was still the default) —
        // autoFillName() no-ops if a name is already filled in.
        autoFillName();
      });
    }

    // Order type segmented control (sim only)
    const orderSeg = $("#form-order-seg");
    const updateOrderUI = () => {
      const active = orderSeg?.querySelector(".active")?.dataset.order || "manual";
      const entryRow      = $("#form-entry-row");
      const limitRow      = $("#form-limit-row");
      const marketHintRow = $("#form-market-hint-row");
      if (entryRow)      entryRow.style.display      = active === "manual" ? "" : "none";
      if (limitRow)      limitRow.style.display      = active === "limit"  ? "" : "none";
      if (marketHintRow) marketHintRow.style.display  = active === "market" ? "" : "none";
      // required only for manual entry
      const entryInput = $("#form-entry");
      if (entryInput) entryInput.required = active === "manual";
    };
    if (orderSeg) {
      orderSeg.addEventListener("click", e => {
        const btn = e.target.closest("button[data-order]");
        if (!btn) return;
        $$("button", orderSeg).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        updateOrderUI();
      });
    }

    // Wire earnings auto-fetch button
    const fetchEarnBtn = $("#form-earnings-fetch");
    if (fetchEarnBtn) {
      fetchEarnBtn.addEventListener("click", async () => {
        const sym = $("#form-ticker").value.toUpperCase().trim();
        if (!sym) { alert("请先填写 Ticker Symbol"); return; }
        fetchEarnBtn.disabled = true;
        fetchEarnBtn.textContent = "获取中…";
        try {
          const r = await fetch(`/api/earnings?sym=${encodeURIComponent(sym)}`);
          const data = await r.json();
          if (data.date) {
            const fe = $("#form-earnings"); if (fe) fe.value = data.date;
            fetchEarnBtn.textContent = "✓ 已获取";
          } else {
            fetchEarnBtn.textContent = "未找到";
          }
        } catch {
          fetchEarnBtn.textContent = "失败";
        }
        setTimeout(() => { fetchEarnBtn.disabled = false; fetchEarnBtn.textContent = "自动获取"; }, 2000);
      });
    }

    // Inject color swatches into BX form color divider
    const fbxColorDiv = $("#fbx-color-div");
    if (fbxColorDiv) {
      SWATCH_COLORS.forEach(c => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bx-color-opt" + (c === "oklch(0.35 0.01 250)" ? " active" : "");
        btn.style.background = c;
        btn.dataset.colorVal = c;
        btn.title = c;
        fbxColorDiv.appendChild(btn);
      });
    }

    // Toggle BX section open/close
    const formBxToggle = $("#form-bx-toggle"), formBxBody = $("#form-bx-body");
    if (formBxToggle && formBxBody) {
      formBxToggle.addEventListener("click", () => {
        const fd = $("#form-date");
        const savedDate = fd?.value;
        const open = formBxBody.style.display !== "none";
        formBxBody.style.display = open ? "none" : "";
        formBxToggle.classList.toggle("open", !open);
        // Chrome may trigger autofill and clear the date when new inputs become visible
        if (!open && fd && savedDate) requestAnimationFrame(() => { if (!fd.value) fd.value = savedDate; });
      });
    }

    // BX form interactions: button groups, slope inputs, color swatches
    if (formBxBody) {
      // Button groups (dailyBars / weekly / monthly)
      formBxBody.addEventListener("click", e => {
        const btn = e.target.closest("[data-fbx]");
        if (!btn) return;
        const field = btn.dataset.fbx;
        $$(`[data-fbx="${field}"]`, formBxBody).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });

      // Color swatch selection
      formBxBody.addEventListener("click", e => {
        const swatch = e.target.closest(".bx-color-opt");
        if (!swatch) return;
        const c = swatch.dataset.colorVal;
        $$(".bx-color-opt", formBxBody).forEach(b => b.classList.remove("active"));
        swatch.classList.add("active");
        const snameEl = $("#fbx-sname");
        if (snameEl) snameEl.style.background = c;
      });

      // Entry scorecard: refresh on BX or ST chip change
      const _refreshScorecard = () => {
        const cur = parseFloat(formBxBody.querySelector("[data-fbx='current'].active")?.dataset.val) || 0;
        const wk  = parseFloat(formBxBody.querySelector("[data-fbx='weekly'].active")?.dataset.val)  || 0;
        const mo  = parseFloat(formBxBody.querySelector("[data-fbx='monthly'].active")?.dataset.val) || 0;
        const grade = calcBXGrade(cur, wk, mo);
        renderEntryScorecard(grade, _pendingRsResult, false, null, _pendingST);
      };
      formBxBody.addEventListener("click", e => {
        if (e.target.closest("[data-fbx='current'],[data-fbx='weekly'],[data-fbx='monthly']")) {
          setTimeout(_refreshScorecard, 10);
        }
        const stBtn = e.target.closest("[data-fbx-st]");
        if (stBtn) {
          $$("[data-fbx-st]", formBxBody).forEach(b => b.classList.remove("active"));
          stBtn.classList.add("active");
          const v = stBtn.dataset.fbxSt;
          _pendingST = v === "true" ? true : v === "false" ? false : null;
          setTimeout(_refreshScorecard, 10);
        }
      });
    }

    // RS / ST state captured at form interaction time, read at submit
    let _pendingRsResult = null;
    let _pendingRsEtf    = null;
    let _pendingST       = null;
    const rsCalcBtn   = $("#fbx-rs-calc");
    const etfInput    = $("#fbx-sector-etf");
    if (rsCalcBtn) {
      rsCalcBtn.addEventListener("click", async () => {
        const sym      = $("#form-ticker")?.value.toUpperCase().trim();
        if (!sym) return;
        const sectorEtf = etfInput?.value.toUpperCase().trim() || null;
        const kind = $("#form-kind-seg .active")?.dataset.kind || "equity";
        const body = $("#form-bx-body");
        const cur  = parseFloat(body?.querySelector("[data-fbx='current'].active")?.dataset.val) || 0;
        const wk   = parseFloat(body?.querySelector("[data-fbx='weekly'].active")?.dataset.val)  || 0;
        const mo   = parseFloat(body?.querySelector("[data-fbx='monthly'].active")?.dataset.val) || 0;
        const grade = calcBXGrade(cur, wk, mo);
        renderEntryScorecard(grade, null, true, null, _pendingST);
        try {
          const rsData   = await computeEntryRS(sym, sectorEtf, kind);
          const rsResult = calcRSScore(rsData);
          _pendingRsResult = rsResult;
          _pendingRsEtf    = sectorEtf;
          renderEntryScorecard(grade, rsResult, false, null, _pendingST);
        } catch (_) {
          renderEntryScorecard(grade, null, false, null, _pendingST);
        }
      });
    }
    if (etfInput) {
      etfInput.addEventListener("input", () => { etfInput.value = etfInput.value.toUpperCase(); });
      etfInput.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); rsCalcBtn?.click(); } });
    }

    form.addEventListener("submit", e => {
      e.preventDefault();
      const sym    = $("#form-ticker").value.toUpperCase().trim();
      const name   = ($("#form-name")?.value.trim()) || sym;
      const stop   = parseFloat($("#form-stop").value)   || 0;
      const target = parseFloat($("#form-target").value) || 0;
      const qty    = parseInt($("#form-qty").value);
      const isSim  = newPositionContext === "sim";

      const orderType  = isSim ? ($("#form-order-seg .active")?.dataset.order || "manual") : "manual";
      const limitPrice = orderType === "limit" ? parseFloat($("#form-limit-price").value) : null;
      const entry      = orderType === "manual" ? parseFloat($("#form-entry").value) : null;

      const entryDateStr = ($("#form-date") && $("#form-date").value) || todayStr();
      const earningsStr  = ($("#form-earnings") && $("#form-earnings").value) || null;

      if (!sym || !qty) { alert("请填写 Ticker 和数量"); return; }
      if (orderType === "manual" && !entry) { alert("请填写入场价"); return; }
      if (orderType === "limit"  && !limitPrice) { alert("请填写限价"); return; }
      if (!isSim && (!stop || !target)) { alert("真实仓位必须填写止损和止盈"); return; }
      if (!isSim && entry && (stop >= entry || entry >= target)) {
        alert("Invalid price levels: stop < entry < target");
        return;
      }

      const kindBtn = $("#form-kind-seg .active");
      const kind = kindBtn ? kindBtn.dataset.kind : "equity";

      // Market / limit order → add to pending queue (sim only)
      if (isSim && (orderType === "market" || orderType === "limit")) {
        if (SIM_PENDING.find(p => p.sym === sym)) { alert("该 Ticker 已有挂单"); return; }
        if (SIM_HOLDINGS.find(h => h.sym === sym)) { alert("Position already exists"); return; }
        SIM_PENDING.push({
          id: Date.now().toString(36),
          sym, name, kind, qty, stop, target,
          orderType, limitPrice,
          entryDate: entryDateStr,
          earnings: earningsStr,
          createdAt: new Date().toISOString(),
          bx: (() => {
            const bxData = readFormBX();
            const ebxg = calcBXGrade(bxData.current, bxData.weekly, bxData.monthly);
            const afterRs = _pendingRsResult ? rsAdjustGrade(ebxg, _pendingRsResult) : ebxg;
            const efg     = stAdjustGrade(afterRs, _pendingST);
            bxData.entryBxGrade    = ebxg;
            bxData.entryST         = _pendingST;
            bxData.entryFinalGrade = efg;
            bxData.entryRsResult   = _pendingRsResult;
            bxData.entrySectorEtf  = _pendingRsEtf;
            return bxData;
          })()
        });
        saveToStorage();
        form.reset();
        _pendingRsResult = null;
        _pendingRsEtf    = null;
        _pendingST       = null;
        resetFormBX();
        closeModal("new-position-modal");
        renderSimPending();
        newPositionContext = "desk";
        // Immediately try to execute (in case price already known)
        lastPriceFetch = 0;
        fetchPrices();
        return;
      }

      const targetHoldings = isSim ? SIM_HOLDINGS : HOLDINGS;
      if (targetHoldings.find(h => h.sym === sym)) { alert("Position already exists"); return; }

      const entryDate = new Date(entryDateStr + "T00:00:00");
      const today     = new Date(); today.setHours(0, 0, 0, 0);
      const daysHeld  = Math.max(1, Math.round((today - entryDate) / 86400000) + 1);

      const base   = isSim ? simNotional : totalNotional;
      const size   = base > 0 ? (qty * entry / base) * 100 : 2.5;
      const newPos = {
        sym, qty, name,
        kind,
        entry: entryDateStr,
        cost: entry, last: entry,
        size,
        stop, target,
        setup: "Manual Entry",
        thesis: "",
        earnings: earningsStr, holdEarn: false,
        status: "ok",
        pnlPct: 0, pnlDollar: 0,
        risk1R: stop ? entry - stop : 0,
        rMult: 0,
        days: daysHeld,
        spark: [entry],
        bx: (() => {
          const bxData = readFormBX();
          const ebxg = calcBXGrade(bxData.current, bxData.weekly, bxData.monthly);
          const afterRs = _pendingRsResult ? rsAdjustGrade(ebxg, _pendingRsResult) : ebxg;
          const efg     = stAdjustGrade(afterRs, _pendingST);
          bxData.entryBxGrade    = ebxg;
          bxData.entryST         = _pendingST;
          bxData.entryFinalGrade = efg;
          bxData.entryRsResult   = _pendingRsResult;
          bxData.entrySectorEtf  = _pendingRsEtf;
          return bxData;
        })()
      };

      targetHoldings.push(newPos);
      saveToStorage();
      form.reset();
      _pendingRsResult = null;
      _pendingRsEtf    = null;
      _pendingST       = null;
      resetFormBX();
      closeModal("new-position-modal");
      if (newPositionContext === "sim") { renderSimTable(); renderSimOverview(); }
      else { renderTable(); renderOverview(); }
      newPositionContext = "desk";
      lastPriceFetch = 0;
      fetchPrices();
    });
  }

  function wireEquityModal() {
    // Use event delegation so it survives renderOverview() re-renders
    document.addEventListener("click", e => {
      if (e.target.closest(".nav-edit-btn")) {
        $("#equity-nav").value = totalNotional;
        openModal("equity-modal");
      }
    });

    $("#equity-close").addEventListener("click", () => closeModal("equity-modal"));
    $("#equity-cancel").addEventListener("click", () => closeModal("equity-modal"));
    let _eqMousedownOnBg = false;
    $("#equity-modal").addEventListener("mousedown", e => { _eqMousedownOnBg = e.target === e.currentTarget; });
    $("#equity-modal").addEventListener("click", e => { if (_eqMousedownOnBg && e.target === e.currentTarget) closeModal("equity-modal"); });

    $("#equity-form").addEventListener("submit", e => {
      e.preventDefault();
      const newNav = parseFloat($("#equity-nav").value);
      if (newNav > 0) {
        totalNotional = newNav;
        HOLDINGS.forEach(h => recomputeHolding(h, newNav));
        saveToStorage();
        renderTable();
        renderOverview();
        closeModal("equity-modal");
      }
    });
  }

  // ============ POSITION CLOSING ============

  function openCloseModal(sym) {
    const holdings = currentPage === "sim" ? SIM_HOLDINGS : HOLDINGS;
    const pos = holdings.find(h => h.sym === sym);
    if (!pos) return;
    pendingCloseSym = sym;
    pendingCloseCtx = currentPage === "sim" ? "sim" : "desk";
    if (wireClosePositionModal._resetOrderType) wireClosePositionModal._resetOrderType();
    const input = $("#close-pos-price-input");
    const qtyInput = $("#close-pos-qty-input");
    input.value = pos.last;
    qtyInput.value = pos.qty;
    qtyInput.max = pos.qty;
    const hint = $("#close-pos-qty-hint");
    if (hint) hint.textContent = `持有 ${pos.qty} 股`;
    $("#close-pos-sym-label").textContent = sym;
    updateClosePnlPreview(pos, pos.last, pos.qty);
    const today = new Date().toISOString().slice(0, 10);
    const dateInput = $("#close-pos-date-input");
    dateInput.value = today;
    dateInput.min = pos.entry?.slice(0, 10) || "";
    dateInput.max = today;
    openModal("close-pos-modal");
    setTimeout(() => { input.select(); }, 80);
  }

  function updateClosePnlPreview(pos, closePrice, qty) {
    const q = qty ?? pos.qty;
    // Premium counts only on a full close — partial exits leave it on the remainder
    const ccN = q >= pos.qty ? ccNet(pos) : 0;
    const pnlDollar = (closePrice - pos.cost) * q + ccN;
    const pnlPct = pos.cost > 0 ? pnlDollar / (pos.cost * q) : 0;
    const sign = pnlDollar >= 0 ? "up" : "down";
    const ccHint = ccN > 0 ? ` <span style="font-size:11px;opacity:0.55;margin-left:6px">(含权利金 +$${ccN.toFixed(0)})</span>` : "";
    const partial = q < pos.qty ? ` <span style="font-size:11px;opacity:0.55;margin-left:6px">(${q}/${pos.qty} 股)</span>` : ccHint;
    const preview = $("#close-pos-pnl-preview");
    if (preview) {
      preview.innerHTML = `
        <span class="${sign}" style="font-size:20px;font-weight:700;font-family:var(--f-mono);letter-spacing:-0.5px">${fmt.signed(pnlDollar)}</span>
        <span class="${sign}" style="font-size:12px;font-weight:600;margin-left:10px;opacity:0.85">${fmt.pct(pnlPct)}</span>${partial}`;
    }
  }

  function wireClosePositionModal() {
    const input      = $("#close-pos-price-input");
    const limitInput = $("#close-limit-price-input");
    const qtyInput   = $("#close-pos-qty-input");

    const getCloseOrderType = () => $("#close-order-seg .active")?.dataset.closeOrder || "manual";

    const updateCloseOrderUI = () => {
      const t = getCloseOrderType();
      const priceRow  = $("#close-price-row");
      const limitRow  = $("#close-limit-row");
      const hintRow   = $("#close-market-hint-row");
      const dateRow   = $("#close-date-row");
      const preview   = $("#close-pos-pnl-preview");
      if (priceRow)  priceRow.style.display  = t === "manual"  ? "" : "none";
      if (limitRow)  limitRow.style.display  = t === "limit"   ? "" : "none";
      if (hintRow)   hintRow.style.display   = t === "market"  ? "" : "none";
      if (dateRow)   dateRow.style.display   = t === "manual"  ? "" : "none";
      if (preview)   preview.style.display   = t === "manual"  ? "" : "none";
      $("#close-pos-confirm-btn").textContent = t === "manual" ? "确认平仓" : "提交挂单";
    };

    const closeOrderSeg = $("#close-order-seg");
    if (closeOrderSeg) {
      closeOrderSeg.addEventListener("click", e => {
        const btn = e.target.closest("[data-close-order]");
        if (!btn) return;
        $$("button", closeOrderSeg).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        updateCloseOrderUI();
      });
    }

    const refreshPreview = () => {
      if (!pendingCloseSym || getCloseOrderType() !== "manual") return;
      const holdings = pendingCloseCtx === "sim" ? SIM_HOLDINGS : HOLDINGS;
      const pos = holdings.find(h => h.sym === pendingCloseSym);
      if (!pos) return;
      const price = parseFloat(input.value);
      const qty   = Math.min(parseInt(qtyInput.value) || pos.qty, pos.qty);
      if (!isNaN(price) && price > 0) updateClosePnlPreview(pos, price, qty);
    };

    input.addEventListener("input", refreshPreview);
    qtyInput.addEventListener("input", refreshPreview);

    const closeFn = () => { pendingCloseSym = null; closeModal("close-pos-modal"); };
    $("#close-pos-modal-x").addEventListener("click", closeFn);
    $("#close-pos-cancel-btn").addEventListener("click", closeFn);

    const backdrop = $("#close-pos-modal");
    let _cpMousedownOnBg = false;
    backdrop.addEventListener("mousedown", e => { _cpMousedownOnBg = e.target === backdrop; });
    backdrop.addEventListener("click", e => { if (_cpMousedownOnBg && e.target === backdrop) { pendingCloseSym = null; closeModal("close-pos-modal"); } });

    $("#close-pos-confirm-btn").addEventListener("click", () => {
      if (!pendingCloseSym) return;
      const orderType = getCloseOrderType();
      const holdings = pendingCloseCtx === "sim" ? SIM_HOLDINGS : HOLDINGS;
      const pos = holdings.find(h => h.sym === pendingCloseSym);
      if (!pos) return;
      const closeQty = Math.min(Math.max(1, parseInt(qtyInput.value) || pos.qty), pos.qty);

      // Sim pending close orders
      if (pendingCloseCtx === "sim" && (orderType === "market" || orderType === "limit")) {
        const lp = orderType === "limit" ? parseFloat(limitInput.value) : null;
        if (orderType === "limit" && (!lp || lp <= 0)) { limitInput.focus(); return; }
        if (SIM_CLOSE_PENDING.find(p => p.sym === pendingCloseSym)) { alert("该持仓已有平仓挂单"); return; }
        SIM_CLOSE_PENDING.push({
          id: Date.now().toString(36), sym: pendingCloseSym,
          qty: closeQty, orderType, limitPrice: lp,
          createdAt: new Date().toISOString()
        });
        saveToStorage(); renderSimPending();
        pendingCloseSym = null;
        closeModal("close-pos-modal");
        return;
      }

      // Manual / real holdings — immediate close
      const val = parseFloat(input.value);
      if (isNaN(val) || val <= 0) { input.focus(); return; }
      const dateVal = $("#close-pos-date-input").value || new Date().toISOString().slice(0, 10);
      closePosition(pendingCloseSym, val, dateVal, closeQty);
      pendingCloseSym = null;
      closeModal("close-pos-modal");
    });

    // expose reset fn for use when opening modal
    wireClosePositionModal._resetOrderType = () => {
      const isSim = pendingCloseCtx === "sim";
      const row = $("#close-order-type-row");
      if (row) row.style.display = isSim ? "" : "none";
      if (closeOrderSeg) {
        $$("button", closeOrderSeg).forEach(b => b.classList.toggle("active", b.dataset.closeOrder === (isSim ? "market" : "manual")));
      }
      updateCloseOrderUI();
    };
  }

  // closePosition — full or partial close (real or sim based on ctx)
  function closePosition(sym, closePrice, closeDate, closeQty) {
    const isSim = pendingCloseCtx === "sim";
    const holdings = isSim ? SIM_HOLDINGS : HOLDINGS;
    const closed   = isSim ? SIM_CLOSED   : CLOSED_POSITIONS;
    const pos = holdings.find(h => h.sym === sym);
    if (!pos) return;

    const cp  = (closePrice != null && closePrice > 0) ? closePrice : pos.last;
    const qty = (closeQty != null && closeQty > 0 && closeQty < pos.qty) ? closeQty : pos.qty;
    const cd  = closeDate || new Date().toISOString().slice(0, 10);

    if (qty < pos.qty) {
      // Partial close — create a closed record for the sold portion.
      // CC premium stays attached to the remaining open position (cc stripped
      // here) and only rolls into pnlFinal on the final full close.
      const notional = isSim ? simNotional : totalNotional;
      const closedRecord = { ...pos, qty, closedAt: cd, closePrice: cp,
        cc: undefined,
        days: calcTradingDays(pos.entry, cd),
        pnlDollar: Math.round((cp - pos.cost) * qty),
        pnlPct: pos.cost > 0 ? (cp - pos.cost) / pos.cost : 0,
        pnlFinal: Math.round((cp - pos.cost) * qty),
        rMult: pos.risk1R > 0 ? (cp - pos.cost) / pos.risk1R : 0,
        exitReason: "partial" };
      closed.push(closedRecord);
      // Update remaining open position
      pos.qty = pos.qty - qty;
      pos.size = notional > 0 ? (pos.qty * pos.cost / notional) * 100 : pos.size;
      recomputeHolding(pos, notional);
    } else {
      // Full close — accumulated CC premium settles into the final P&L
      pos.closedAt = cd;
      pos.closePrice = cp;
      pos.days = calcTradingDays(pos.entry, cd);
      pos.pnlDollar = Math.round((cp - pos.cost) * pos.qty + ccNet(pos));
      pos.pnlPct = (pos.cost > 0 && pos.qty > 0) ? pos.pnlDollar / (pos.cost * pos.qty) : 0;
      pos.rMult = pos.risk1R > 0 ? (cp - pos.cost) / pos.risk1R : 0;
      pos.pnlFinal = pos.pnlDollar;
      pos.exitReason = "manual";
      holdings.splice(holdings.indexOf(pos), 1);
      closed.push(pos);
      // Remove any open pending orders for this sym — prevents stale orders from
      // re-opening the position after a close (e.g. duplicate orders from two devices).
      if (isSim) {
        for (let i = SIM_PENDING.length - 1; i >= 0; i--) {
          if (SIM_PENDING[i].sym === sym) SIM_PENDING.splice(i, 1);
        }
      }
    }

    const isFull = !holdings.find(h => h.sym === sym); // removed from holdings = full close
    saveToStorage();
    if (isSim) {
      if (isFull && simSelectedSym === sym) closeSimDrawer();
      renderSimTable(); renderSimOverview(); renderSimAnalytics();
    } else {
      if (isFull && selectedSym === sym) closeDrawer();
      renderTable(); renderOverview();
    }
  }

  function openDeleteModal(sym, from) {
    pendingDeleteSym = sym;
    pendingDeleteFrom = from || "open";
    pendingDeleteCtx = currentPage === "sim" ? "sim" : "desk";
    const msg = $("#delete-confirm-msg");
    if (msg) msg.textContent = `永久删除 ${sym}？此操作不可撤销。`;
    openModal("delete-confirm-modal");
  }

  function wireDeleteModal() {
    const deleteCancelFn = () => {
      pendingDeleteSym = null; pendingDeleteFrom = null;
      closeModal("delete-confirm-modal");
    };
    $("#delete-confirm-modal-x").addEventListener("click", deleteCancelFn);
    $("#delete-cancel-btn").addEventListener("click", deleteCancelFn);

    const deleteBackdrop = $("#delete-confirm-modal");
    deleteBackdrop.addEventListener("click", e => {
      if (e.target === deleteBackdrop) deleteCancelFn();
    });

    $("#delete-confirm-btn").addEventListener("click", () => {
      if (!pendingDeleteSym) return;
      if (pendingDeleteCtx === "sim") {
        if (pendingDeleteFrom === "closed") simDeleteClosedPosition(pendingDeleteSym);
        else simDeletePosition(pendingDeleteSym);
      } else {
        if (pendingDeleteFrom === "closed") deleteClosedPosition(pendingDeleteSym);
        else deletePosition(pendingDeleteSym);
      }
      pendingDeleteSym = null; pendingDeleteFrom = null; pendingDeleteCtx = "desk";
      closeModal("delete-confirm-modal");
    });
  }

  // deletePosition → permanently removes from HOLDINGS (not archived)
  function deletePosition(sym) {
    const idx = HOLDINGS.findIndex(h => h.sym === sym);
    if (idx === -1) return;
    HOLDINGS.splice(idx, 1);
    saveToStorage();
    if (selectedSym === sym) closeDrawer();
    renderTable();
    renderOverview();
  }

  // deleteClosedPosition → permanently removes from CLOSED_POSITIONS
  function deleteClosedPosition(sym) {
    const idx = CLOSED_POSITIONS.findIndex(h => h.sym === sym);
    if (idx === -1) return;
    CLOSED_POSITIONS.splice(idx, 1);
    saveToStorage();
    if (selectedSym === sym) closeDrawer();
    renderTable();
  }

  function restoreClosedPosition(sym) {
    const records = CLOSED_POSITIONS.filter(h => h.sym === sym);
    if (!records.length) return;
    if (HOLDINGS.find(x => x.sym === sym)) { alert("持仓中已有该股票"); return; }
    const totalQty = records.reduce((s, h) => s + (h.qty || 0), 0);
    const base = records[0];
    const { closedAt, closePrice, pnlFinal, exitReason, ...restored } = base;
    restored.qty = totalQty;
    restored.last = restored.cost;
    recomputeHolding(restored, totalNotional);
    HOLDINGS.push(restored);
    for (let i = CLOSED_POSITIONS.length - 1; i >= 0; i--) {
      if (CLOSED_POSITIONS[i].sym === sym) CLOSED_POSITIONS.splice(i, 1);
    }
    saveToStorage();
    if (selectedSym === sym) closeDrawer();
    renderTable(); renderOverview();
  }

  function simRestoreClosedPosition(sym) {
    const records = SIM_CLOSED.filter(h => h.sym === sym);
    if (!records.length) return;
    if (SIM_HOLDINGS.find(x => x.sym === sym)) { alert("模拟仓中已有该持仓"); return; }
    const totalQty = records.reduce((s, h) => s + (h.qty || 0), 0);
    const base = records[0];
    const { closedAt, closePrice, pnlFinal, exitReason, ...restored } = base;
    restored.qty = totalQty;
    restored.last = restored.cost;
    recomputeHolding(restored, simNotional);
    SIM_HOLDINGS.push(restored);
    for (let i = SIM_CLOSED.length - 1; i >= 0; i--) {
      if (SIM_CLOSED[i].sym === sym) SIM_CLOSED.splice(i, 1);
    }
    saveToStorage();
    if (simSelectedSym === sym) closeSimDrawer();
    renderSimOverview(); renderSimTable(); renderSimAnalytics();
  }

  function wireDrawerRestoreButton(h, isSim) {
    const btn = $("#drawer-restore-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (isSim) simRestoreClosedPosition(h.sym);
      else restoreClosedPosition(h.sym);
    });
  }

  // ============ SEARCH / FILTERS / KEYBOARD ============
  function wireControls() {
    // Nav page switching
    $$(".navlink[data-page]").forEach(a => {
      a.addEventListener("click", e => { e.preventDefault(); switchPage(a.dataset.page); });
    });

    // Inspirations sub-tabs (Journal / Preparation)
    $$("[data-insp-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        inspSubTab = btn.dataset.inspTab;
        $$("[data-insp-tab]").forEach(b => b.classList.toggle("active", b.dataset.inspTab === inspSubTab));
        const jp = document.getElementById("insp-journal-panel");
        const wp = document.getElementById("insp-watchlist-panel");
        if (jp) jp.style.display = inspSubTab === "journal" ? "" : "none";
        if (wp) wp.style.display = inspSubTab === "watchlist" ? "" : "none";
        if (inspSubTab === "journal") renderJournal();
        else renderWatchlist();
      });
    });

    // Options sub-tabs (Live / Sim)
    $$("[data-opts-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        currentOptMode = btn.dataset.optsTab;
        $$("[data-opts-tab]").forEach(b => b.classList.toggle("active", b.dataset.optsTab === currentOptMode));
        const rp = document.getElementById("opts-real-panel");
        const sp = document.getElementById("opts-sim-panel");
        if (rp) rp.style.display = currentOptMode === "real" ? "" : "none";
        if (sp) sp.style.display = currentOptMode === "sim" ? "" : "none";
        renderOptions();
      });
    });

    $("#search-input").addEventListener("input", e => { query = e.target.value; renderTable(); });
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-filter]");
      if (!b) return;
      filter = b.dataset.filter;
      $$("[data-filter]").forEach(x => x.classList.toggle("active", x.dataset.filter === filter));
      renderTable();
    });
    document.addEventListener("click", e => {
      const b = e.target.closest("[data-filter-closed]");
      if (!b) return;
      closedFilter = b.dataset.filterClosed;
      $$("[data-filter-closed]").forEach(x => x.classList.toggle("active", x.dataset.filterClosed === closedFilter));
      renderTable();
    });
    $("#backdrop").addEventListener("click", () => {
      if (currentPage === "sim") closeSimDrawer(); else closeDrawer();
    });
    document.addEventListener("click", e => {
      if (e.target && e.target.id === "drawer-close") {
        if (currentPage === "sim") closeSimDrawer(); else closeDrawer();
      }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        if (currentPage === "sim") closeSimDrawer(); else closeDrawer();
        $("#tweaks").classList.remove("open");
      }
      if (e.key === "/" && document.activeElement.tagName !== "INPUT" && !document.activeElement.isContentEditable) { e.preventDefault(); $("#search-input").focus(); }
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA" && !document.activeElement.isContentEditable) {
        e.preventDefault(); $("#new-pos-btn")?.click();
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") &&
          !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName) &&
          !document.activeElement.isContentEditable &&
          !document.querySelector(".modal.open")) {
        const isSim = currentPage === "sim";
        const curSym = isSim ? simSelectedSym : selectedSym;

        // Try list-mode rows first
        const tbodySel = isSim ? "#sim-tbody" : "#tbody";
        const trs = $$(`${tbodySel} tr[data-idx]`);

        if (trs.length) {
          e.preventDefault();
          const curIdx = trs.findIndex(tr => tr.dataset.sym === curSym);
          const nextIdx = e.key === "ArrowDown"
            ? (curIdx + 1) % trs.length
            : (curIdx <= 0 ? trs.length - 1 : curIdx - 1);
          trs[nextIdx].click();
          trs[nextIdx].scrollIntoView({ block: "nearest", behavior: "smooth" });
        } else if (curSym) {
          // Card mode — navigate through the data array directly
          e.preventDefault();
          const data = isSim
            ? (simActiveTab === "open" ? SIM_HOLDINGS : SIM_CLOSED)
            : (activeTab === "open" ? HOLDINGS : CLOSED_POSITIONS);
          const curIdx = data.findIndex(h => h.sym === curSym);
          if (data.length) {
            const nextIdx = e.key === "ArrowDown"
              ? (curIdx + 1) % data.length
              : (curIdx <= 0 ? data.length - 1 : curIdx - 1);
            if (isSim) openSimDrawer(data[nextIdx], simActiveTab);
            else        openDrawer(data[nextIdx]);
            const cardSel = isSim ? "#sim-holdings-cards" : "#holdings-cards";
            document.querySelector(`${cardSel} [data-sym="${data[nextIdx].sym}"]`)
              ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }
        }
      }
    });
  }

  // ============ TWEAKS ============
  function wireTweaks() {
    // cols list
    const cl = $("#cols-list");
    cl.innerHTML = COLS.map(c => `
      <label><input type="checkbox" data-col="${c.id}" ${c.on ? "checked" : ""} ${c.locked ? "disabled" : ""}/> ${c.label}${c.locked ? " <span class='muted' style='font-size:10px'>(锁定)</span>" : ""}</label>
    `).join("");
    cl.addEventListener("change", e => {
      const id = e.target.dataset.col;
      const col = COLS.find(c => c.id === id);
      col.on = e.target.checked;
      renderTable();
      persist();
    });

    $("#tweaks-toggle").addEventListener("click", () => $("#tweaks").classList.toggle("open"));
    $("#tweaks-close").addEventListener("click", () => $("#tweaks").classList.remove("open"));

    function setSegActive(segKey, val) {
      const seg = document.querySelector(`.seg[data-seg="${segKey}"]`);
      if (!seg) return;
      $$("button", seg).forEach(b => b.classList.toggle("active", b.dataset.val === String(val)));
    }

    $$(".seg").forEach(seg => {
      seg.addEventListener("click", e => {
        if (e.target.tagName !== "BUTTON") return;
        $$("button", seg).forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        const key = seg.dataset.seg, val = e.target.dataset.val;
        if (key === "density") document.body.dataset.density = val;
        if (key === "font")    document.body.dataset.font = val;
        if (key === "theme")   document.body.dataset.theme = val;
        if (key === "tape") {
          const tapeEl = document.querySelector(".tape");
          if (tapeEl) tapeEl.style.display = val === "hide" ? "none" : "";
          localStorage.setItem("trendo_ui_tape", val);
        }
        if (key === "refresh") {
          priceIntervalMs = +val * 1000;
          lastPriceFetch = 0;
          localStorage.setItem("trendo_refresh_interval", val);
        }
        persist();
      });
    });

    const hueSlider = $("#hue-slider");
    hueSlider.addEventListener("input", e => {
      const h = e.target.value;
      document.documentElement.style.setProperty("--accent-h", h);
      $("#hue-val").textContent = h + "°";
      applySidebarActiveColor(currentPage);
      persist();
    });

    // Click-outside closes tweaks panel
    document.addEventListener("click", e => {
      const tweaksEl = $("#tweaks");
      if (!tweaksEl?.classList.contains("open")) return;
      if (!tweaksEl.contains(e.target) && !$("#tweaks-toggle")?.contains(e.target)) {
        tweaksEl.classList.remove("open");
      }
    });

    // theme toggle (dark / light)
    const tt = $("#theme-toggle");
    if (tt) tt.addEventListener("click", () => {
      const cur = document.body.dataset.theme || "dark";
      document.body.dataset.theme = cur === "dark" ? "light" : "dark";
      setSegActive("theme", document.body.dataset.theme);
      persist();
    });

    // ── Load saved prefs ──
    const sv = k => localStorage.getItem(k);
    const t = sv("trendo_ui_theme");   if (t) { document.body.dataset.theme = t;   setSegActive("theme", t); }
    const d = sv("trendo_ui_density"); if (d) { document.body.dataset.density = d; setSegActive("density", d); }
    const f = sv("trendo_ui_font");
    const fv = f === "sans" ? "geist" : (f || "geist"); // migrate legacy "sans" value
    document.body.dataset.font = fv; setSegActive("font", fv);
    const hue = sv("trendo_ui_hue");
    if (hue) {
      document.documentElement.style.setProperty("--accent-h", hue);
      hueSlider.value = hue;
      $("#hue-val").textContent = hue + "°";
    }
    const tape = sv("trendo_ui_tape");
    if (tape === "hide") {
      const tapeEl = document.querySelector(".tape");
      if (tapeEl) tapeEl.style.display = "none";
      setSegActive("tape", "hide");
    }
    const ri = sv("trendo_refresh_interval");
    if (ri) setSegActive("refresh", ri);
  }

  function persist() {
    localStorage.setItem("trendo_ui_density", document.body.dataset.density || "medium");
    localStorage.setItem("trendo_ui_font",    document.body.dataset.font    || "geist");
    localStorage.setItem("trendo_ui_theme",   document.body.dataset.theme   || "dark");
    const hs = $("#hue-slider");
    if (hs) localStorage.setItem("trendo_ui_hue", hs.value);
    try {
      const state = {
        density: document.body.dataset.density,
        font: document.body.dataset.font,
        theme: document.body.dataset.theme,
        accentHue: hs ? +hs.value : 195,
        hiddenCols: COLS.filter(c => !c.on).map(c => c.id),
      };
      window.parent.postMessage({ type: "__edit_mode_set_keys", edits: state }, "*");
    } catch (e) { /* no host */ }
  }

  // ============ TWEAKS HOST HOOK ============
  function wireHost() {
    window.addEventListener("message", e => {
      const d = e.data || {};
      if (d.type === "__activate_edit_mode") $("#tweaks").classList.add("open");
      if (d.type === "__deactivate_edit_mode") $("#tweaks").classList.remove("open");
    });
    try { window.parent.postMessage({ type: "__edit_mode_available" }, "*"); } catch (e) { }
  }

  // ============ CLOCK ============
  function tick() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    const lu = $("#last-updated");
    if (lu) lu.textContent = "更新于 " + hh + ":" + mm + ":" + ss;

    const now = Date.now();
    // Off-hours throttle: with the US market closed and no crypto in the book, every
    // quote is frozen at the last close — polling at 30s just burns serverless CPU
    // (each poll = 2 upstream fetches per symbol). Stretch to 10min; pull-to-refresh,
    // tab re-focus and order submission still force an immediate fetch (lastPriceFetch=0).
    const hasCrypto = [...SIM_HOLDINGS, ...HOLDINGS, ...SIM_PENDING].some(h => h.kind === "crypto");
    let effInterval = priceIntervalMs;
    // Off-hours (market closed, no crypto): every quote is frozen at the last close, so
    // stretch to 10min.
    if (!isUSMarketOpen() && !hasCrypto) effInterval = Math.max(effInterval, 600000);
    // Backgrounded tab: nobody is watching the numbers. A dashboard left open on a second
    // monitor / background tab was polling every 30s all session and burning serverless CPU
    // for a page in view of no one. Stretch to 5min while hidden — pending orders still fill
    // (background order-check worker + the visibilitychange handler forces an immediate
    // catch-up fetch the moment the tab is foregrounded again).
    if (document.hidden) effInterval = Math.max(effInterval, 300000);
    if (now - lastPriceFetch >= effInterval) {
      lastPriceFetch = now;
      fetchPrices();
    }
  }

  function buildHistoricalPnl() {
    histPnlLog = {};
    const todayStr = new Date().toISOString().slice(0, 10);
    const allPos   = [...HOLDINGS, ...CLOSED_POSITIONS];
    if (!allPos.length || !Object.keys(histCache).length) return;

    // Collect all trading dates we have prices for (exclude today — live value wins)
    const dateSet = new Set();
    Object.values(histCache).forEach(prices =>
      Object.keys(prices).forEach(d => { if (d < todayStr) dateSet.add(d); })
    );
    const allDates = [...dateSet].sort();

    allDates.forEach(date => {
      let total = 0, hasAny = false;
      allPos.forEach(pos => {
        const entryDate = pos.entry?.slice(0, 10);
        const closeDate = pos.closedAt?.slice(0, 10);
        if (!entryDate || date < entryDate) return;
        if (closeDate && date > closeDate) return;

        const ySym   = pos.kind === "crypto" ? `${pos.sym}-USD` : pos.sym;
        const prices = histCache[ySym];
        if (!prices || prices[date] == null) return;

        // Previous close for this symbol (fall back to cost on entry day)
        const symDates = Object.keys(prices).sort();
        const idx      = symDates.indexOf(date);
        const prevDate = idx > 0 ? symDates[idx - 1] : null;
        const prevClose = (!prevDate || prevDate < entryDate)
          ? pos.cost
          : (prices[prevDate] ?? pos.cost);

        total  += Math.round((prices[date] - prevClose) * pos.qty);
        hasAny  = true;
      });
      if (hasAny) histPnlLog[date] = total;
    });
  }

  async function fetchAndBuildHistory() {
    const allPos = [...HOLDINGS, ...CLOSED_POSITIONS];
    if (!allPos.length) {
      histLoading = false;
      if (currentPage === "analytics") renderAnalytics();
      return;
    }

    const fromDate = allPos
      .map(h => h.entry?.slice(0, 10))
      .filter(Boolean)
      .sort()[0];
    if (!fromDate) {
      histLoading = false;
      if (currentPage === "analytics") renderAnalytics();
      return;
    }

    // Symbols not yet cached
    const needed = [...new Set(
      allPos.map(h => h.kind === "crypto" ? `${h.sym}-USD` : h.sym)
    )].filter(s => !histCache[s]);

    if (needed.length) {
      histLoading = true;
      if (currentPage === "analytics") renderAnalytics();
      try {
        const r = await fetch(`/api/history?symbols=${needed.join(",")}&from=${fromDate}`);
        if (r.ok) {
          const { results } = await r.json();
          if (results) Object.assign(histCache, results);
        }
      } catch (_) {}
      histLoading = false;
    } else {
      histLoading = false;
    }

    buildHistoricalPnl();
    if (currentPage === "analytics") renderAnalytics();
  }

  function recordDailyPnl() {
    if (!HOLDINGS.length) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const delta = HOLDINGS.reduce((s, h) =>
      s + Math.round(((h.last || 0) - (h.prevClose || h.last || 0)) * (h.qty || 0)), 0);
    dailyPnlLog[todayStr] = delta;
    // Prune entries older than 1 year
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    Object.keys(dailyPnlLog).forEach(d => { if (d < cutoffStr) delete dailyPnlLog[d]; });
  }

  function isUSMarketOpen() {
    const now = new Date();
    const day = now.getUTCDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;
    const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (mins < 13 * 60 + 30 || mins >= 21 * 60) return false; // 13:30–21:00 UTC covers EDT+EST
    // Check US market holidays using Eastern Time calendar date
    try {
      const etDate = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // "YYYY-MM-DD"
      const etYear = +etDate.slice(0, 4);
      if (usMarketHolidays(etYear).includes(etDate)) return false;
    } catch (_) {}
    return true;
  }

  async function fetchPrices() {
    const all = [...SIM_HOLDINGS, ...HOLDINGS];
    // Include pending order symbols so we can execute them
    const pendingSyms = [
      ...SIM_PENDING.map(p => p.sym),
      ...SIM_CLOSE_PENDING.map(p => p.sym),
    ];
    // Underlying ETFs for the options wheel module. The full 6-ETF watch list (spot
    // pills) is only needed while the panel is actually on screen; everywhere else
    // fetch just the symbols with live positions (expiry settlement + card math).
    // Carrying all 6 ETFs on every 30s poll 24/7 multiplied serverless CPU usage.
    const optSyms = currentPage === "options"
      ? _optWatchSyms()
      : _optLiveSyms();

    // Pending symbols go first so they are never truncated by the API limit
    const allSyms = [...pendingSyms, ...optSyms, ...all.map(h => h.sym)];
    if (!allSyms.length) return;

    const stocks  = [...new Set(allSyms.filter(sym => {
      const h = all.find(x => x.sym === sym) || SIM_PENDING.find(p => p.sym === sym);
      return (h?.kind || "equity") !== "crypto";
    }))];
    const cryptos = [...new Set(allSyms.filter(sym => {
      const h = all.find(x => x.sym === sym) || SIM_PENDING.find(p => p.sym === sym);
      return (h?.kind || "equity") === "crypto";
    }))];

    // Split stocks into small chunks and call /api/quote once per chunk. With 60+ holdings,
    // a single request makes the serverless function fire 130+ concurrent upstream fetches,
    // which Yahoo rate-limits and which can blow Vercel's 10s limit → empty response →
    // "行情加载中". ~22 symbols per request keeps each invocation small and fast; the
    // requests run in parallel so total latency stays ~one request.
    const CHUNK = 15;
    const reqs = [];
    for (let i = 0; i < stocks.length; i += CHUNK) {
      const p = new URLSearchParams();
      p.set("stocks", stocks.slice(i, i + CHUNK).join(","));
      if (i === 0 && cryptos.length) p.set("crypto", cryptos.join(","));
      reqs.push(p);
    }
    if (!stocks.length && cryptos.length) {
      const p = new URLSearchParams();
      p.set("crypto", cryptos.join(","));
      reqs.push(p);
    }

    try {
      const settled = await Promise.all(reqs.map(p =>
        fetch(`/api/quote?${p}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      ));
      // Merge every chunk's results into one map. Skip if every request failed.
      const results = {};
      let gotAny = false;
      settled.forEach(j => {
        if (j?.results) { Object.assign(results, j.results); gotAny = true; }
      });
      if (!gotAny) return;

      let changed = false;
      let needsRender = false;
      all.forEach(h => {
        const q = results[h.sym];
        if (!q) return;
        // Polygon last-resort fallback returns prevClose === last with changePct null
        // (it only knows yesterday's bar). Never let it overwrite a genuine prevClose —
        // that flattens the daily change to ±$0 / 0.00% until the next clean fetch.
        const isFlattened = q.changePct == null && q.prevClose === q.last;
        const notional = SIM_HOLDINGS.includes(h) ? simNotional : totalNotional;
        if (q.name && h.name === h.sym) { h.name = q.name; changed = true; }
        // Keep prevClose in sync with `last` from the SAME fetch. The server's prevClose is
        // the genuine last completed-session close (Yahoo derivedPc), so the daily change
        // stays broker-like across pre-market / after-hours / weekends already.
        // We must NOT freeze prevClose on its own: `last` updates every cycle, so a frozen
        // prevClose drifts days apart from `last` over a closed market and inflates the
        // "today" change (e.g. a 4-day move shown as a single day's -23%).
        const hasValidPrev = q.prevClose > 0 && !isFlattened;
        if (hasValidPrev) {
          if (q.prevClose !== h.prevClose) { h.prevClose = q.prevClose; changed = true; }
        } else if (q.last != null && h.prevClose != null && !(isFlattened && h.prevClose > 0)) {
          // Server returned a fresh `last` but no usable prevClose for this symbol. Our
          // stored prevClose is from an earlier fetch; pairing it with the fresh `last`
          // would show a bogus multi-day % (e.g. INTC +8.82% off a stale ~99 close while
          // the real prevClose is ~110). Clear it so the row shows ±$0 until a complete
          // quote (last + prevClose) arrives — never a wrong number.
          h.prevClose = null;
          changed = true;
        }
        if (q.last != null && Math.abs(q.last - (h.last || 0)) > 0.0001) {
          h.last = q.last;
          changed = true;
          recomputeHolding(h, notional);
        }
        // Recompute changePct from this holding's own last + prevClose (not the per-cycle
        // server value, which can flake to 0 off-market). Keeps the tape stable & consistent.
        const cp = computeChangePct(h);
        if (cp !== h.changePct) {
          h.changePct = cp;
          needsRender = true; // daily P&L display only — does NOT trigger save/sync
        }
      });

      // Refresh options-module spot prices and re-render its panel if anything moved
      let optSpotChanged = false;
      _optWatchSyms().forEach(sym => {
        const q = results[sym];
        if (q?.last > 0 && _optSpot[sym] !== q.last) { _optSpot[sym] = q.last; optSpotChanged = true; }
      });
      if (optSpotChanged && currentPage === "options") renderOptions();

      // Auto-execute pending orders
      const executed = [];
      SIM_PENDING.forEach(order => {
        const q = results[order.sym];
        if (q == null || q.last == null) return;
        const execPrice = q.last;
        const shouldExecute = isUSMarketOpen() && (
          order.orderType === "market" ||
          (order.orderType === "limit" && execPrice <= order.limitPrice));
        if (!shouldExecute) return;
        if (SIM_HOLDINGS.find(h => h.sym === order.sym)) { executed.push(order.id); return; } // already open — clean up stale order

        const entryDate = new Date(order.entryDate + "T00:00:00");
        const today     = new Date(); today.setHours(0, 0, 0, 0);
        const daysHeld  = Math.max(1, Math.round((today - entryDate) / 86400000) + 1);
        const size      = simNotional > 0 ? (order.qty * execPrice / simNotional) * 100 : 2.5;

        const newPos = {
          sym: order.sym, name: order.name || order.sym, kind: order.kind,
          qty: order.qty, cost: execPrice, last: execPrice,
          prevClose: q.prevClose ?? execPrice,
          stop: order.stop, target: order.target,
          entry: order.entryDate,
          size, earnings: order.earnings, holdEarn: false,
          setup: order.orderType === "market" ? "市价单" : `限价单 @${order.limitPrice}`,
          thesis: "",
          status: "ok", pnlPct: 0, pnlDollar: 0,
          risk1R: order.stop ? execPrice - order.stop : 0,
          rMult: 0, days: daysHeld, spark: [execPrice],
          bx: order.bx,
        };
        recomputeHolding(newPos, simNotional);
        SIM_HOLDINGS.push(newPos);
        executed.push(order.id);
        changed = true;
      });

      if (executed.length) {
        executed.forEach(id => {
          const idx = SIM_PENDING.findIndex(p => p.id === id);
          if (idx !== -1) SIM_PENDING.splice(idx, 1);
        });
        renderSimPending();
      }

      // Execute pending close orders
      const closedIds = [];
      SIM_CLOSE_PENDING.forEach(order => {
        const q = results[order.sym];
        if (q == null || q.last == null) return;
        const execPrice = q.last;
        const shouldClose = isUSMarketOpen() && (
          order.orderType === "market" ||
          (order.orderType === "limit" && execPrice >= order.limitPrice));
        if (!shouldClose) return;
        const prevCtx = pendingCloseCtx;
        pendingCloseCtx = "sim";
        const today = new Date().toISOString().slice(0, 10);
        closePosition(order.sym, execPrice, today, order.qty);
        pendingCloseCtx = prevCtx;
        closedIds.push(order.id);
        changed = true;
      });
      if (closedIds.length) {
        closedIds.forEach(id => {
          const idx = SIM_CLOSE_PENDING.findIndex(p => p.id === id);
          if (idx !== -1) SIM_CLOSE_PENDING.splice(idx, 1);
        });
        renderSimPending();
      }

      const hasStructural = executed.length > 0 || closedIds.length > 0;
      if (hasStructural) {
        recordDailyPnl();
        saveToStorage();
      } else if (changed) {
        recordDailyPnl();
        saveLocalOnly(false); // price-only: local only, don't update savedAt / cloud
      }
      if (changed || needsRender) {
        renderTape();
        renderOverview();
        renderTable();
        if (currentPage === "sim")       { renderSimOverview();   renderSimTable();   }
        if (currentPage === "analytics") renderAnalytics();
      }

    } catch (_) {
      // Network error or API key not set — keep static prices silently
    }

    // Trigger news refresh after prices update
    if (currentPage === "desk" && HOLDINGS.length > 0) {
      fetchNews(HOLDINGS.filter(h => h.kind !== "crypto").map(h => h.sym));
    }
  }

  // ============ NEWS ============
  let newsCache = { symsKey: "", ts: 0, articles: [], logos: {} };
  const NEWS_TTL = 30 * 60 * 1000; // 30 minutes

  function timeAgo(isoStr) {
    if (!isoStr) return "";
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins  = Math.floor(diff / 60000);
    if (mins < 1)   return "刚刚";
    if (mins < 60)  return `${mins}分钟前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}小时前`;
    return `${Math.floor(hrs / 24)}天前`;
  }

  async function fetchNews(syms) {
    if (!syms.length) return;
    const symsKey = [...syms].sort().join(",");
    const now = Date.now();
    // Use cache if same holdings and not stale
    if (newsCache.symsKey === symsKey && now - newsCache.ts < NEWS_TTL) {
      renderNews(newsCache.articles, newsCache.logos);
      return;
    }

    // Show panel in loading state
    const panel = $("#news-panel");
    const label = $("#news-section-label");
    if (panel) {
      panel.style.display = "";
      const feed = $("#news-feed");
      if (feed) feed.innerHTML = `<div class="news-loading">加载新闻中...</div>`;
    }
    if (label) label.style.display = "";

    try {
      const r = await fetch(`/api/news?syms=${syms.join(",")}`);
      if (!r.ok) throw new Error("api error");
      const { articles, logos = {} } = await r.json();
      newsCache = { symsKey, ts: Date.now(), articles, logos };
      renderNews(articles, logos);
    } catch (_) {
      const feed = $("#news-feed");
      if (feed) feed.innerHTML = `<div class="news-loading">新闻暂时无法加载</div>`;
    }
  }

  function renderNews(articles, logos = {}) {
    const feed  = $("#news-feed");
    const panel = $("#news-panel");
    const label = $("#news-section-label");
    const count = $("#news-count");
    if (!feed) return;

    if (!articles || !articles.length) {
      if (panel) panel.style.display = "none";
      if (label) label.style.display = "none";
      return;
    }

    // Group by symbol — max 6 articles per sym
    const bySymbol = {};
    for (const a of articles) {
      if (!bySymbol[a.sym]) bySymbol[a.sym] = [];
      if (bySymbol[a.sym].length < 6) bySymbol[a.sym].push(a);
    }

    // Compute weighted sentiment per symbol
    // Polygon ML articles (sentimentSource="ml") count double — higher reliability
    const symSummaries = Object.entries(bySymbol).map(([sym, arts]) => {
      let posW = 0, negW = 0;
      let posCount = 0, negCount = 0, neuCount = 0;
      for (const a of arts) {
        const w = a.sentimentSource === "ml" ? 2 : 1;
        if (a.sentiment === "positive")      { posW += w; posCount++; }
        else if (a.sentiment === "negative") { negW += w; negCount++; }
        else                                  { neuCount++; }
      }
      const overall = posW > negW ? "positive" : negW > posW ? "negative" : "neutral";
      return { sym, arts, overall, posCount, negCount, neuCount };
    });

    if (!symSummaries.length) {
      if (panel) panel.style.display = "none";
      if (label) label.style.display = "none";
      return;
    }

    // Sort: by holding entry date descending (most recently opened first)
    const entryMap = {};
    HOLDINGS.forEach(h => { entryMap[h.sym] = h.entry || ""; });
    symSummaries.sort((a, b) => (entryMap[b.sym] || "").localeCompare(entryMap[a.sym] || ""));

    if (panel) panel.style.display = "";
    if (label) label.style.display = "";
    if (count) count.textContent = `${symSummaries.length} 只`;

    const sentLabel = s => s === "positive" ? "利多" : s === "negative" ? "利空" : "中性";
    const sentCls   = s => s === "positive" ? "pos"  : s === "negative" ? "neg"  : "neu";

    feed.innerHTML = symSummaries.map(({ sym, arts, overall, posCount, negCount, neuCount }) => {
      const logoUrl  = logos[sym] || "";
      const initials = sym.slice(0, 3);
      const imgTag   = logoUrl
        ? `<img src="${logoUrl}" alt="" loading="lazy" onerror="this.style.display='none'">`
        : "";

      const parts = [];
      if (posCount) parts.push(`<span style="color:var(--up)">${posCount}利多</span>`);
      if (negCount) parts.push(`<span style="color:var(--down)">${negCount}利空</span>`);
      if (neuCount) parts.push(`<span style="color:var(--fg-3)">${neuCount}中性</span>`);
      const countsHTML = parts.join('<span style="color:var(--fg-4)"> · </span>');

      const detailsId = `nd-${sym}`;
      const detailHTML = arts.map(a => {
        const safeTitle  = a.title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const safeSource = (a.source || "").replace(/</g, "&lt;");
        const s = a.sentiment || "neutral";
        return `<a class="news-detail-item" href="${a.url}" target="_blank" rel="noopener noreferrer">
          <span class="news-sent ${sentCls(s)}" style="flex-shrink:0;margin-top:1px">${sentLabel(s)}</span>
          <div class="news-detail-body">
            <div class="news-detail-title">${safeTitle}</div>
            <div class="news-detail-meta">${safeSource}${safeSource ? " · " : ""}${timeAgo(a.publishedAt)}</div>
          </div>
        </a>`;
      }).join("");

      return `<div class="news-sym-row">
        <div class="news-sym-header" data-nd="${detailsId}">
          <div class="news-avatar">${initials}${imgTag}</div>
          <div class="news-sym-main">
            <span class="news-sym-ticker">${sym}</span>
            <span class="news-sym-counts">${countsHTML}</span>
          </div>
          <span class="news-sent ${sentCls(overall)}">${sentLabel(overall)}</span>
          <span class="news-nd-arrow">›</span>
        </div>
        <div class="news-sym-details" id="${detailsId}" style="display:none">
          ${detailHTML}
        </div>
      </div>`;
    }).join("");

    // Wire expand/collapse per symbol
    feed.querySelectorAll("[data-nd]").forEach(header => {
      header.addEventListener("click", () => {
        const details = document.getElementById(header.dataset.nd);
        const arrow   = header.querySelector(".news-nd-arrow");
        if (!details) return;
        const open = details.style.display !== "none";
        details.style.display = open ? "none" : "";
        if (arrow) arrow.style.transform = open ? "" : "rotate(90deg)";
      });
    });
  }

  // ============ PAGE SWITCHING ============
  // Apply sidebar navlink color via inline style (bypasses Chrome's deferred
  // repaint of position:fixed elements for CSS class-based color changes).
  function applySidebarActiveColor(page) {
    const links = $$(`#sidebar .navlink[data-page]`);
    if (!links.length) return;
    const h = document.documentElement.style.getPropertyValue("--accent-h").trim() || "195";
    const accent = `oklch(0.78 0.12 ${h})`;
    links.forEach(a => {
      a.style.color      = a.dataset.page === page ? accent : "";
      a.style.fontWeight = a.dataset.page === page ? "600"  : "";
    });
  }

  function switchPage(page) {
    currentPage = page;
    localStorage.setItem("trendo_last_page", page);
    const VIEWS = { desk: "desk-view", inspirations: "inspirations-view", sim: "sim-view", analytics: "analytics-view", options: "options-view", market: "market-view" };
    const mainEl = document.querySelector("main");
    Object.entries(VIEWS).forEach(([p, id]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (p === page) {
        el.style.display = "";
        el.classList.remove("page-enter");
        void el.offsetWidth;
        el.classList.add("page-enter");
      } else {
        el.style.display = "none";
      }
    });
    if (mainEl) {
      if (page === "desk") {
        mainEl.style.display = "";
        mainEl.classList.remove("page-enter");
        void mainEl.offsetWidth;
        mainEl.classList.add("page-enter");
      } else {
        mainEl.style.display = "none";
      }
    }
    $$(".navlink[data-page]").forEach(a => a.classList.toggle("active", a.dataset.page === page));
    applySidebarActiveColor(page);
    if (page === "inspirations") { if (inspSubTab === "journal") renderJournal(); else renderWatchlist(); }
    if (page === "sim")          renderSim();
    if (page === "analytics")    { fetchAndBuildHistory(); }
    if (page === "options")      renderOptions();
    if (page === "market")       fetchMarketData();
    if (page === "desk" && HOLDINGS.length > 0) {
      fetchNews(HOLDINGS.filter(h => h.kind !== "crypto").map(h => h.sym));
      initHoldingsBriefCard();
    }
  }

  // ============ JOURNAL ============
  function _journalSaveField(arr, sym, entry, cost, fn) {
    // Update all matching records (handles grouped/partial trades sharing same sym+entry+cost)
    let saved = false;
    arr.forEach(x => {
      if (x.sym === sym && x.entry === entry && Math.abs(x.cost - parseFloat(cost)) < 0.001) {
        fn(x); saved = true;
      }
    });
    if (saved) saveToStorage();
  }

  function journalSummaryHTML(closedItems, openItems = []) {
    const taggedClosed = closedItems.filter(x => x.h.journalTags?.length);
    const taggedOpen   = openItems.filter(x => x.h.journalTags?.length);
    if (taggedClosed.length < 2 && taggedOpen.length === 0) return "";

    const countTags = items => {
      const cnt = {};
      items.forEach(x => (x.h.journalTags || []).forEach(id => { cnt[id] = (cnt[id] || 0) + 1; }));
      return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 4);
    };
    const tagLabel = id => JOURNAL_TAGS.find(t => t.id === id)?.label || id;
    const tagColor = id => JOURNAL_TAGS.find(t => t.id === id)?.color || "var(--fg-3)";
    const mkRows = rows => rows.length
      ? rows.map(([id, n]) => `<div class="jts-row">
          <span class="jts-tag" style="color:${tagColor(id)}">${tagLabel(id)}</span>
          <span class="jts-count">×${n}</span>
        </div>`).join("")
      : `<div class="jts-empty">暂无标注</div>`;
    const mkCols = (leftHead, leftRows, rightHead, rightRows) => `
      <div class="jts-cols">
        <div class="jts-col">
          <div class="jts-col-head" style="color:var(--up)">${leftHead}</div>
          ${mkRows(leftRows)}
        </div>
        <div class="jts-divider"></div>
        <div class="jts-col">
          <div class="jts-col-head" style="color:var(--down)">${rightHead}</div>
          ${mkRows(rightRows)}
        </div>
      </div>`;

    // Closed / partial section (盈利 vs 亏损 by realized P&L)
    let closedSection = "";
    if (taggedClosed.length >= 2) {
      const wins   = taggedClosed.filter(x => (x.h.pnlFinal ?? 0) > 0);
      const losses = taggedClosed.filter(x => (x.h.pnlFinal ?? 0) < 0);
      const topWin  = countTags(wins);
      const topLoss = countTags(losses);
      if (topWin.length || topLoss.length)
        closedSection = mkCols("盈利主因", topWin, "亏损主因", topLoss);
    }

    // Open holdings section (浮盈 vs 浮亏 by floating P&L)
    let openSection = "";
    if (taggedOpen.length >= 1) {
      const gainers = taggedOpen.filter(x => (x.h.pnlDollar ?? 0) > 0);
      const losers  = taggedOpen.filter(x => (x.h.pnlDollar ?? 0) < 0);
      openSection = mkCols("浮盈主因", countTags(gainers), "浮亏主因", countTags(losers));
    }

    if (!closedSection && !openSection) return "";

    const hasBoth = closedSection && openSection;
    const totalTagged = taggedClosed.length + taggedOpen.length;
    return `<div class="jt-summary">
      <div class="jts-header">
        <span class="jts-title">归因摘要</span>
        <span class="jts-sub">Insight · ${totalTagged} 笔已标注</span>
      </div>
      ${hasBoth ? `<div class="jts-sub-header">已平仓 · ${taggedClosed.length} 笔</div>` : ""}
      ${closedSection}
      ${hasBoth ? `<div class="jts-sub-header" style="margin-top:12px">持仓中 · ${taggedOpen.length} 笔</div>` : ""}
      ${openSection}
    </div>`;
  }

  function renderJournal() {
    const feed = $("#journal-feed");
    if (!feed) return;

    // Build open items — attach their partial close records
    const openItems = HOLDINGS.map(h => {
      const partials = CLOSED_POSITIONS.filter(c =>
        c.sym === h.sym && c.entry === h.entry &&
        Math.abs(c.cost - h.cost) < 0.001 && c.exitReason === "partial"
      ).sort((a, b) => (a.closedAt || "").localeCompare(b.closedAt || ""));
      return { h, from: "open", partials };
    }).sort((a, b) => b.h.entry.localeCompare(a.h.entry));

    // Build closed grouped trades — skip positions that still have an open holding.
    const openKeys = new Set(HOLDINGS.map(h => `${h.sym}|${h.entry}|${h.cost}`));
    const rawRecordsMap = new Map();
    CLOSED_POSITIONS.forEach(c => {
      const key = `${c.sym}|${c.entry}|${c.cost}`;
      (rawRecordsMap.get(key) || rawRecordsMap.set(key, []).get(key)).push(c);
    });
    const grouped = groupTrades(CLOSED_POSITIONS);
    const closedItems = grouped
      .filter(t => !openKeys.has(`${t.sym}|${t.entry}|${t.cost}`))
      .map(t => ({
        h: t,
        from: "closed",
        records: (rawRecordsMap.get(`${t.sym}|${t.entry}|${t.cost}`) || [])
          .sort((a, b) => (a.closedAt || "").localeCompare(b.closedAt || "")),
      }))
      .sort((a, b) => (b.h.closedAt || "").localeCompare(a.h.closedAt || ""));

    // Build partial items — partial closes of still-open positions, bucketed by last close date
    const partialItems = [];
    openItems.forEach(item => {
      if (!item.partials.length) return;
      const { h, partials } = item;
      const sorted = [...partials].sort((a, b) => (a.closedAt||"").localeCompare(b.closedAt||""));
      const closedQty = partials.reduce((s, c) => s + (c.qty || 0), 0);
      const origQty   = closedQty + (h.qty || 0);
      const trimPct   = origQty > 0 ? Math.round(closedQty / origQty * 100) : 0;
      const pnlFinal  = partials.reduce((s, c) => s + (c.pnlFinal ?? 0), 0);
      const avgRMult  = partials.length ? partials.reduce((s, c) => s + (c.rMult||0), 0) / partials.length : null;
      partialItems.push({
        h: { ...h, closedAt: sorted[sorted.length-1].closedAt, pnlFinal, qty: closedQty, rMult: avgRMult, trimPct },
        from: "partial",
        records: sorted,
      });
    });

    // Apply filter
    const filteredOpen    = journalFilter === "closed" ? [] : openItems;
    const filteredClosed  = journalFilter === "open"   ? [] : closedItems;
    const filteredPartial = journalFilter === "open"   ? [] : partialItems;

    // Stats bar
    const allClosedTrades = groupTrades(CLOSED_POSITIONS);
    const wins = allClosedTrades.filter(t => t.pnlFinal > 0);
    const totalPnl = allClosedTrades.reduce((s, t) => s + t.pnlFinal, 0);
    const winRate = allClosedTrades.length ? Math.round(wins.length / allClosedTrades.length * 100) : null;
    const floatingPnl = HOLDINGS.reduce((s, h) => s + (h.pnlDollar || 0), 0);
    const showStatsBar = allClosedTrades.length > 0 || HOLDINGS.length > 0;
    const statsBar = showStatsBar ? `
      <div class="j-statsbar">
        ${allClosedTrades.length > 0 ? `
        <div class="j-statsbar-item">
          <span class="j-statsbar-label">已平仓</span>
          <span class="j-statsbar-value">${allClosedTrades.length} 笔</span>
        </div>
        <div class="j-statsbar-sep"></div>
        <div class="j-statsbar-item">
          <span class="j-statsbar-label">胜率</span>
          <span class="j-statsbar-value ${winRate >= 50 ? "up" : "down"}">${winRate}%</span>
        </div>
        <div class="j-statsbar-sep"></div>
        <div class="j-statsbar-item">
          <span class="j-statsbar-label">总盈亏</span>
          <span class="j-statsbar-value ${fmt.sign(totalPnl)}">${fmt.signed(Math.round(totalPnl))}</span>
        </div>
        <div class="j-statsbar-sep"></div>` : ""}
        <div class="j-statsbar-item">
          <span class="j-statsbar-label">持仓中</span>
          <span class="j-statsbar-value">${HOLDINGS.length} 笔</span>
        </div>
        ${HOLDINGS.length > 0 ? `
        <div class="j-statsbar-sep"></div>
        <div class="j-statsbar-item">
          <span class="j-statsbar-label">持仓浮盈</span>
          <span class="j-statsbar-value ${floatingPnl >= 0 ? "up" : "down"}">${fmt.signed(Math.round(floatingPnl))}</span>
        </div>` : ""}
      </div>` : "";

    // Attribution summary — closed/partial by realized P&L, open holdings by floating P&L
    const summaryHTML = journalSummaryHTML([...closedItems, ...partialItems], openItems);

    // Group into year-month buckets
    const MO_ZH = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
    const groups = {};
    filteredOpen.forEach(item => {
      const key = item.h.entry?.slice(0, 7) || "0000-00";
      if (!groups[key]) groups[key] = { open: [], closed: [], partial: [] };
      groups[key].open.push(item);
    });
    filteredClosed.forEach(item => {
      const key = item.h.closedAt?.slice(0, 7) || "0000-00";
      if (!groups[key]) groups[key] = { open: [], closed: [], partial: [] };
      groups[key].closed.push(item);
    });
    filteredPartial.forEach(item => {
      const key = item.h.closedAt?.slice(0, 7) || "0000-00";
      if (!groups[key]) groups[key] = { open: [], closed: [], partial: [] };
      groups[key].partial.push(item);
    });

    const groupsHTML = Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(key => {
      const { open: openG, closed: closedG, partial: partialG } = groups[key];
      const [yr, mo] = key.split("-");
      const label = key === "0000-00" ? "未知日期" : `${yr}年 ${MO_ZH[parseInt(mo) - 1]}`;
      const mWins = closedG.filter(x => (x.h.pnlFinal || 0) > 0);
      const mPnl  = [...closedG, ...partialG].reduce((s, x) => s + (x.h.pnlFinal || 0), 0);
      const mExitCount = closedG.length + partialG.length;
      let mStats = "";
      if (mExitCount > 0 && openG.length > 0)
        mStats = `${mExitCount}笔平 · ${mWins.length}胜 · ${fmt.signed(Math.round(mPnl))} · ${openG.length}笔持仓`;
      else if (mExitCount > 0)
        mStats = `${mExitCount}笔 · ${mWins.length}胜${closedG.length - mWins.length}负 · ${fmt.signed(Math.round(mPnl))}`;
      else if (openG.length > 0)
        mStats = `${openG.length}笔持仓中`;

      const needsSep = openG.length > 0 && (closedG.length > 0 || partialG.length > 0);
      const openHTML = openG.length ? `
        ${needsSep ? `<div class="jc-section-sep">持仓中</div>` : ""}
        ${openG.map(x => journalCardHTML(x.h, "open", x.partials)).join("")}` : "";
      const closedHTML = (closedG.length || partialG.length) ? `
        ${needsSep ? `<div class="jc-section-sep">已平仓</div>` : ""}
        ${closedG.map(x => journalCardHTML(x.h, "closed", [], x.records)).join("")}
        ${partialG.map(x => journalCardHTML(x.h, "partial", [], x.records)).join("")}` : "";

      return `<div class="jm-group">
        <div class="jm-header">
          <span class="jm-title">${label}</span>
          <span class="jm-rule"></span>
          ${mStats ? `<span class="jm-stats">${mStats}</span>` : ""}
        </div>
        ${openHTML}${closedHTML}
      </div>`;
    }).join("");

    feed.innerHTML = statsBar + summaryHTML + groupsHTML;

    $$("[data-journal-filter]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.journalFilter === journalFilter);
      btn.addEventListener("click", () => { journalFilter = btn.dataset.journalFilter; renderJournal(); });
    });

    // Tag chip wiring — toggle without full re-render
    $$(".jc-tag-chip", feed).forEach(chip => {
      chip.addEventListener("click", () => {
        const { tagId, sym, entry, cost, from } = chip.dataset;
        const arr = from === "closed" ? CLOSED_POSITIONS : HOLDINGS;
        // Read current tags from first matching record (all records in group share same tags)
        const first = arr.find(x => x.sym === sym && x.entry === entry && Math.abs(x.cost - parseFloat(cost)) < 0.001);
        if (!first) return;
        const tags = new Set(first.journalTags || []);
        if (tags.has(tagId)) tags.delete(tagId); else tags.add(tagId);
        const newTags = [...tags];
        _journalSaveField(arr, sym, entry, cost, x => { x.journalTags = newTags; });
        // Update in-memory closedItems/openItems so summary refresh sees fresh tags
        const _itemsToSearch = from === "closed" ? closedItems : openItems;
        const _itm = _itemsToSearch.find(x => x.h.sym === sym && x.h.entry === entry && Math.abs(x.h.cost - parseFloat(cost)) < 0.001);
        if (_itm) _itm.h.journalTags = newTags;
        // Update chip appearance in place
        const tagDef = JOURNAL_TAGS.find(t => t.id === tagId);
        const active = tags.has(tagId);
        chip.classList.toggle("active", active);
        if (tagDef) {
          chip.style.color       = active ? tagDef.color : "";
          chip.style.borderColor = active ? tagDef.color : "";
          chip.style.background  = active ? `color-mix(in oklch,${tagDef.color} 14%,transparent)` : "";
        }
        // Refresh attribution summary
        const sumEl = feed.querySelector(".jt-summary");
        const newSum = journalSummaryHTML([...closedItems, ...partialItems], openItems);
        if (sumEl) { if (newSum) sumEl.outerHTML = newSum; else sumEl.remove(); }
        else if (newSum) {
          const sb = feed.querySelector(".j-statsbar");
          if (sb) sb.insertAdjacentHTML("afterend", newSum);
          else feed.insertAdjacentHTML("afterbegin", newSum);
        }
      });
    });

    // Note area wiring
    $$(".journal-note-area", feed).forEach(ta => {
      autoResizeTA(ta);
      ta.addEventListener("input", () => autoResizeTA(ta));
      ta.addEventListener("blur", () => {
        const { sym, entry, cost, from } = ta.dataset;
        const arr = from === "closed" ? CLOSED_POSITIONS : HOLDINGS;
        _journalSaveField(arr, sym, entry, cost, x => { x.journalNote = ta.value; });
      });
    });
  }

  // partials: partial-close records for an open position (from="open")
  // records:  all exit records for a closed/partial-closed trade (from="closed"|"partial")
  function journalCardHTML(h, from, partials = [], records = []) {
    const isClosed = from === "closed" || from === "partial";
    const hasPartials = partials.length > 0;
    const multiExit = records.length > 1;
    const pnlAmt = isClosed ? (h.pnlFinal ?? h.pnlDollar) : h.pnlDollar;
    const pnlSign = pnlAmt != null ? fmt.sign(pnlAmt) : "neu";

    // Status badge
    let badgeColor, badgeTxt;
    if (from === "partial") {
      badgeColor = "oklch(0.76 0.13 60)";
      badgeTxt = `已减仓 ${h.trimPct || 0}%`;
      if (records.length > 1) badgeTxt += ` · ${records.length}次`;
    } else if (isClosed) {
      const _pa = pnlAmt ?? 0;
      badgeColor = _pa > 0 ? "var(--up)" : _pa < 0 ? "var(--down)" : "var(--neutral)";
      badgeTxt = _pa > 0 ? "盈利" : _pa < 0 ? "亏损" : "持平";
      if (multiExit) badgeTxt += ` · ${records.length}次出场`;
    } else if (hasPartials) {
      const closedQty = partials.reduce((s, c) => s + (c.qty || 0), 0);
      const origQty = closedQty + (h.qty || 0);
      const trimPct = origQty > 0 ? Math.round(closedQty / origQty * 100) : 0;
      badgeColor = "var(--warn)"; badgeTxt = `持仓 · 减仓${trimPct}%`;
    } else {
      const bs = BUCKET_STATUS[progressBucket(h)];
      badgeColor = bs.color; badgeTxt = bs.label.split("·")[0].trim();
    }

    const dateStr = isClosed
      ? `${fmt.date(h.entry)} → ${fmt.date(h.closedAt)} · ${h.days ?? "—"}d`
      : `${fmt.date(h.entry)} · ${h.days}d`;

    // BX days chip
    const bx = h.bx || {};
    const barsCls = bx.dailyBars === "0-5" ? "bxbar-early" : bx.dailyBars === "5-15" ? "bxbar-mid" : "bxbar-late";
    const barsLbl = bx.dailyBars === "0-5" ? "初期" : bx.dailyBars === "5-15" ? "中期" : "延续";
    const bxChip = bx.dailyBars
      ? `<span class="bx-bar-chip ${barsCls}" style="font-size:10px;padding:1px 6px">${bx.dailyBars}<span class="bx-bar-sub">${barsLbl}</span></span>`
      : "";

    // Tags section
    const selectedTags = new Set(h.journalTags || []);
    const groupOrder = ["市场", "入场", "管理"];
    const tagsByGroup = groupOrder.map(g => ({
      group: g,
      tags: JOURNAL_TAGS.filter(t => t.group === g),
    }));
    const tagsHTML = tagsByGroup.map(({ group, tags }) => `
      <div class="jc-tag-group">
        <span class="jc-tag-group-label">${group}</span>
        ${tags.map(t => {
          const active = selectedTags.has(t.id);
          const style = active
            ? `color:${t.color};border-color:${t.color};background:color-mix(in oklch,${t.color} 14%,transparent)`
            : "";
          return `<button class="jc-tag-chip${active ? " active" : ""}"
            data-tag-id="${t.id}" data-sym="${h.sym}" data-entry="${h.entry}" data-cost="${h.cost}" data-from="${from}"
            style="${style}">${t.label}</button>`;
        }).join("")}
      </div>`).join("");

    // Exit records mini-list — for multi-exit closed trades, and always for partial-close cards
    const exitsHTML = isClosed && (multiExit || from === "partial") && records.length > 0 ? `
      <div class="jc-exits">
        ${records.map(c => {
          const isFull = c.exitReason !== "partial";
          return `<div class="jc-exit-item">
            <span class="jc-exit-type ${isFull ? "jc-exit-full" : "jc-exit-partial"}">${isFull ? "平仓" : "减仓"}</span>
            <span class="jc-exit-date">${fmt.date(c.closedAt)}</span>
            <span class="jc-exit-price">@$${price(c.closePrice ?? c.last ?? c.cost)}</span>
            <span class="jc-exit-qty">${c.qty}股</span>
            <span class="jc-exit-pnl ${fmt.sign(c.pnlFinal ?? 0)}">${fmt.signed(c.pnlFinal ?? 0)}</span>
            ${c.rMult != null ? `<span class="jc-exit-r">${fmt.rMult(c.rMult)}</span>` : ""}
          </div>`;
        }).join("")}
      </div>` : "";

    return `<div class="journal-card">
      <div class="jc-head">
        <div class="jc-left">
          <div class="jc-ticker">
            <div class="avatar ${h.kind === "crypto" ? "crypto" : ""}">${logoImg(h)}${h.sym.slice(0, h.kind === "crypto" ? 3 : 4)}</div>
          </div>
          <div>
            <div class="jc-sym">${h.sym}</div>
            <div class="jc-name">${h.name || ""}</div>
          </div>
        </div>
        <div class="jc-right">
          <span class="statlight" style="color:${badgeColor};background:color-mix(in oklch,${badgeColor} 14%,transparent)"><span class="dot" style="background:${badgeColor}"></span>${badgeTxt}</span>
          ${pnlAmt != null ? `<span class="jc-pnl ${pnlSign}">${fmt.signed(pnlAmt)}</span>` : ""}
          ${isClosed && h.rMult != null ? `<span class="jc-rmult ${fmt.sign(h.rMult)}">${fmt.rMult(h.rMult)}</span>` : ""}
          ${bxChip}
          <span class="jc-date">${dateStr}</span>
        </div>
      </div>

      ${exitsHTML}

      <div class="jc-tags-section">${tagsHTML}</div>

      <textarea class="journal-note-area" data-sym="${h.sym}" data-entry="${h.entry}" data-cost="${h.cost}" data-from="${from}"
        placeholder="记录回顾思路、经验总结…" rows="2">${h.journalNote || ""}</textarea>
    </div>`;
  }

    // ============ ANALYTICS ============
  // ============ SIMULATION PAGE ============

  function renderSim() {
    renderSimOverview();
    renderSimPending();
    renderSimTable();
    renderSimAnalytics();
    renderSimDailySources();
  }

  // ── Options module — 滚动策略模拟（CSP 卖Put / CC 备兑Call），手动记录 ─────
  // 现价 = ETF 实时价（fetchPrices → _optSpot），期权行权价/权利金/到期日手动输入。
  // 到期预估按当前现价：OTM → 全收权利金；ITM → 权利金 − 内在价值。
  // 可选手动记录 Mark（从券商抄当前权利金）得到浮动盈亏。

  // DTE: expiry day itself = 0. Compare calendar dates (UTC midnight) to avoid the
  // ceil-of-a-fraction problem where "today at 2pm" → ceil(0.38) = 1 instead of 0.
  const _optDTE = expiryDate => {
    if (!expiryDate) return 0;
    const todayStr = new Date().toISOString().slice(0, 10);
    if (expiryDate <= todayStr) return 0;
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    return Math.round((new Date(expiryDate + "T00:00:00Z") - today) / 86400000);
  };

  // Symbols that genuinely need a live spot: open positions (expiry settlement,
  // cushion, ITM estimate) and CSP-assigned stock still held (live equity P&L).
  function _optLiveSyms() {
    return [...new Set([...SIM_OPTIONS, ...REAL_OPTIONS]
      .filter(p => p.status === "open" || (p.strat === "csp" && p.status === "assigned" && !p.assignedStockSold))
      .map(p => p.sym))];
  }

  function _optWatchSyms() {
    return [...new Set([...OPT_WATCH_SYMS, ..._optLiveSyms()])];
  }

  function _activeOpts() {
    return currentOptMode === "real" ? REAL_OPTIONS : SIM_OPTIONS;
  }

  // Live spot: quote map → any open stock holding with the same symbol → entry snapshot
  function optSpot(sym) {
    if (_optSpot[sym] > 0) return _optSpot[sym];
    const h = SIM_HOLDINGS.find(x => x.sym === sym) || HOLDINGS.find(x => x.sym === sym);
    return h?.last > 0 ? h.last : null;
  }

  // One-time migration of earlier-model entries into the manual wheel model
  function _optMigrate() {
    [...SIM_OPTIONS, ...REAL_OPTIONS].forEach(p => {
      if (!p.strat) {
        p.strat = p.type === "put" ? "csp" : "cc";
        p.qty = Math.abs(p.qty || 1);
      }
      if (!p.status) p.status = "open";
    });
    // Retroactive Wheel link: CC positions created before v280 have no linkedCspId.
    // Auto-detect: if an open/pending CC has the same symbol as an assigned CSP
    // in the same array that still holds stock, link them now.
    [SIM_OPTIONS, REAL_OPTIONS].forEach(arr => {
      arr.filter(p => p.strat === "cc" && !p.linkedCspId && (p.status === "open" || p.status === "pending"))
        .forEach(cc => {
          const csp = arr.find(p =>
            p.sym === cc.sym && p.strat === "csp" && p.status === "assigned" && !p.assignedStockSold
          );
          if (csp) cc.linkedCspId = csp.id;
        });
    });
  }

  function _optIntrinsic(pos, spot) {
    return pos.type === "put" ? Math.max(0, pos.strike - spot) : Math.max(0, spot - pos.strike);
  }

  // Auto-settle open positions past expiry using the live ETF price:
  // OTM → expire worthless (keep premium); ITM → assigned (premium − intrinsic)
  // CSP assigned: stock held at strike, equity P&L tracked until user records exit.
  // CC assigned: stock called away; equity gain = (strike − underlyingAtEntry) × qty × 100.
  function settleExpiredOptions() {
    let changed = false;
    const today = new Date().toISOString().slice(0, 10);
    for (const pos of [...SIM_OPTIONS, ...REAL_OPTIONS]) {
      if (pos.status !== "open") continue;
      if (pos.expiry >= today) continue;
      const spot = optSpot(pos.sym);
      if (!spot) continue;
      const intrinsic = _optIntrinsic(pos, spot);
      pos.settleSpot = spot;
      pos.closedAt = pos.expiry;
      if (intrinsic > 0.005) {
        pos.status = "assigned";
        if (pos.strat === "csp") {
          // Bought stock at strike; equity P&L tracked separately until sold
          pos.realized = pos.premium * 100 * pos.qty; // just the option premium
          if (pos.assignedStockSold === undefined) {
            pos.assignedStockSold = false;
            pos.assignedExitPrice = null;
            pos.assignedExitDate = null;
          }
        } else {
          // CC: stock called away at strike — capture both components now
          const stockGain = pos.underlyingAtEntry ? (pos.strike - pos.underlyingAtEntry) * 100 * pos.qty : 0;
          pos.realized = (pos.premium - intrinsic) * 100 * pos.qty + stockGain;
          // Auto-complete Wheel: linked CSP's stock was called away at this strike
          if (pos.linkedCspId) {
            const parentCsp = [...SIM_OPTIONS, ...REAL_OPTIONS].find(p => p.id === pos.linkedCspId);
            if (parentCsp && parentCsp.status === "assigned" && !parentCsp.assignedStockSold) {
              parentCsp.assignedStockSold = true;
              parentCsp.assignedExitPrice = pos.strike;
              parentCsp.assignedExitDate  = pos.closedAt;
            }
          }
        }
      } else {
        pos.status = "expired";
        pos.realized = pos.premium * 100 * pos.qty;
      }
      changed = true;
    }
    if (changed) saveToStorage();
  }

  // Canonical "what did this position actually earn" — used by stats and done-card
  function _optFinalPnl(pos) {
    if (pos.status === "open") return null;
    if (pos.strat === "csp" && pos.status === "assigned") {
      // Still holding the assigned stock: equity P&L is unrealized — exclude from stats.
      if (!pos.assignedStockSold) return null;
      // Stock sold: full cycle settled = option premium + stock exit gain/loss.
      if (pos.assignedExitPrice != null)
        return (pos.premium + pos.assignedExitPrice - pos.strike) * 100 * pos.qty;
      return null;
    }
    return pos.realized ?? 0;
  }

  // Returns { income, cost, net, incomeLabel, costLabel, costOp } for any settled position
  function _optPnlBreakdown(pos) {
    if (pos.status === "expired") {
      const income = pos.premium * 100 * pos.qty;
      return { income, cost: 0, net: income, incomeLabel: "权利金收入", costLabel: "买回成本", costOp: "sub" };
    }
    if (pos.status === "closed") {
      const income = pos.premium * 100 * pos.qty;
      const cost   = (pos.closePremium || 0) * 100 * pos.qty;
      return { income, cost, net: income - cost, incomeLabel: "权利金收入", costLabel: "买回成本", costOp: "sub" };
    }
    if (pos.status === "assigned" && pos.strat === "csp" && pos.assignedStockSold && pos.assignedExitPrice != null) {
      const income   = pos.premium * 100 * pos.qty;
      const stockPnl = (pos.assignedExitPrice - pos.strike) * pos.qty * 100;
      return { income, cost: stockPnl, net: income + stockPnl, incomeLabel: "期权收入", costLabel: "正股盈亏", costOp: "add" };
    }
    if (pos.status === "assigned" && pos.strat === "cc") {
      const optPnl    = pos.realized ?? 0;
      const stockGain = pos.underlyingAtEntry != null ? (pos.strike - pos.underlyingAtEntry) * 100 * pos.qty : null;
      const net       = stockGain != null ? optPnl + stockGain : optPnl;
      return { income: optPnl, cost: stockGain, net, incomeLabel: "期权盈亏", costLabel: stockGain != null ? "正股增益" : null, costOp: stockGain != null ? "add" : null };
    }
    return null;
  }

  // Renders the canonical 3-column P&L breakdown row: income [op] cost = net
  function _pnlBreakdownHTML(bd) {
    if (!bd) return "";
    const netCls = bd.net >= 0 ? "up" : "down";
    let costCol = "";
    if (bd.costLabel) {
      let costFmt, costCls;
      if (bd.costOp === "sub") {
        costFmt = bd.cost === 0 ? "—" : "−" + fmt.usd(bd.cost);
        costCls = bd.cost > 0 ? "down" : "";
      } else {
        costFmt = (bd.cost == null ? "—" : (bd.cost >= 0 ? "+" : "−") + fmt.usd(Math.abs(bd.cost)));
        costCls = bd.cost == null ? "" : bd.cost >= 0 ? "up" : "down";
      }
      costCol = `<div class="opts-pnl-op">${bd.costOp === "sub" ? "−" : "+"}</div>
        <div class="opts-pnl-col">
          <div class="opts-pnl-label">${bd.costLabel}</div>
          <div class="opts-pnl-val ${costCls}">${costFmt}</div>
        </div>`;
    }
    return `<div class="opts-pnl-row">
      <div class="opts-pnl-col">
        <div class="opts-pnl-label">${bd.incomeLabel}</div>
        <div class="opts-pnl-val up">+${fmt.usd(bd.income)}</div>
      </div>
      ${costCol}
      <div class="opts-pnl-op">=</div>
      <div class="opts-pnl-col opts-pnl-total">
        <div class="opts-pnl-label">净盈亏</div>
        <div class="opts-pnl-val ${netCls}">${bd.net >= 0 ? "+" : "−"}${fmt.usd(Math.abs(bd.net))}</div>
      </div>
    </div>`;
  }

  // ── Position cards ────────────────────────────────────────────────────────
  function _optOpenPosCard(pos) {
    const spot = optSpot(pos.sym);
    const isCSP = pos.strat === "csp";
    const dte = _optDTE(pos.expiry);
    const typeL = pos.type === "call" ? "C" : "P";
    const premTotal = pos.premium * 100 * pos.qty;

    // Expiry estimate & ITM warning — only when a live spot is known
    let estRow = "";
    if (spot) {
      const intrinsic = _optIntrinsic(pos, spot);
      const est = (pos.premium - intrinsic) * 100 * pos.qty;
      const estCls = est > 0 ? "up" : est < 0 ? "down" : "";
      const itmPct = (isCSP ? (pos.strike - spot) : (spot - pos.strike)) / spot * 100;
      const itmWarn = itmPct > 0 ? `<span class="opts-itm-warn"> · 入价内 ${itmPct.toFixed(1)}%</span>` : "";
      estRow = `<span class="opts-est-line">到期预估 <b class="${estCls}">${est >= 0 ? "+" : "−"}$${Math.abs(est).toFixed(0)}</b>
        <span class="muted" style="font-size:9px">${intrinsic > 0.005 ? "将被指派" : "OTM作废"}</span>${itmWarn}</span>`;
    }

    // Time decay progress (theta works for the seller as days elapse)
    const totalDays = Math.max(1, Math.round((new Date(pos.expiry) - new Date(pos.entryDate)) / 86400000));
    const elapsed = Math.min(totalDays, Math.max(0, Math.round((Date.now() - new Date(pos.entryDate).getTime()) / 86400000)));
    const timePct = elapsed / totalDays * 100;

    // Floating P&L via manually recorded current option price (broker's mark/mid)
    let markRow;
    if (pos.manualMark != null) {
      const float_    = (pos.premium - pos.manualMark) * 100 * pos.qty;
      const remaining = pos.manualMark * 100 * pos.qty;
      const cap       = pos.premium > 0 ? (pos.premium - pos.manualMark) / pos.premium * 100 : 0;
      const fCls      = float_ > 0 ? "up" : float_ < 0 ? "down" : "";
      markRow = `<span class="opts-mark-tag" data-opt-mark="${pos.id}" title="点击更新当前价">现价 $${pos.manualMark.toFixed(2)}<span class="muted" style="font-size:9px"> @${(pos.manualMarkAt || "").slice(5)}</span></span>
        <span class="muted">已捕获</span> <b class="${fCls}">${float_ >= 0 ? "+" : "−"}$${Math.abs(float_).toFixed(0)}</b>
        <span class="muted" style="font-size:9.5px">(${cap.toFixed(0)}%) · 尚余 $${remaining.toFixed(0)}</span>`;
    } else {
      markRow = `<span class="opts-mark-tag opts-mark-empty" data-opt-mark="${pos.id}">+ 记录浮盈</span>
        <span class="muted" style="font-size:9.5px">记录现价，查看已捕获权利金</span>`;
    }

    const cushionPct = spot ? (isCSP ? (spot - pos.strike) : (pos.strike - spot)) / spot * 100 : null;
    return `<div class="opts-pos-card opts-card-open">
      <div class="opts-card-hd">
        <span class="opts-badge ${isCSP ? "opts-badge-csp" : "opts-badge-cc"}">${isCSP ? "CSP" : "CC"}</span>
        <span class="opts-card-sym">${pos.sym} <span>$${pos.strike}${typeL}</span></span>
        <span class="opts-dte-tag">${dte}d</span>
        ${pos.entryDelta != null ? `<span class="opts-delta-tag">Δ${pos.entryDelta.toFixed(2)}</span>` : ""}
        ${pos.linkedCspId ? `<span class="opts-wheel-badge">轮组</span>` : ""}
        ${spot ? `<span class="opts-card-spot">$${spot.toFixed(2)}</span>` : ""}
        <div class="opts-card-hd-r">
          <button class="opts-mini-btn" data-opt-roll="${pos.id}">滚仓</button>
          <button class="opts-mini-btn" data-opt-close="${pos.id}">平仓</button>
          <button class="opts-mini-btn opts-del" data-opt-del="${pos.id}">✕</button>
        </div>
      </div>
      <div class="opts-card-metrics">
        <div class="opts-card-m"><div class="opts-card-ml">权利金/张</div><div class="opts-card-mv up">$${pos.premium.toFixed(2)}</div></div>
        <div class="opts-card-m"><div class="opts-card-ml">数量</div><div class="opts-card-mv">${pos.qty}张</div></div>
        <div class="opts-card-m"><div class="opts-card-ml">最大盈利</div><div class="opts-card-mv up" title="OTM到期时全额获得">+$${premTotal.toFixed(0)}</div></div>
        <div class="opts-card-m"><div class="opts-card-ml">${isCSP ? "安全垫" : "溢价距"}</div><div class="opts-card-mv ${cushionPct == null ? "dim" : cushionPct >= 0 ? "up" : "warn"}">${cushionPct == null ? "—" : (cushionPct >= 0 ? "+" : "") + cushionPct.toFixed(1) + "%"}</div></div>
      </div>
      <div class="opts-prog-wrap" title="时间损耗 ${elapsed}/${totalDays} 天"><div class="opts-prog-fill" style="width:${timePct.toFixed(0)}%"></div></div>
      <div class="opts-card-foot">
        ${estRow ? `<div>${estRow}</div>` : ""}
        <div class="opts-mark-row">${markRow}</div>
      </div>
    </div>`;
  }

  function _optPendingCard(pos) {
    const spot = optSpot(pos.sym);
    const dte = pos.expiry ? _optDTE(pos.expiry) : null;
    const isCSP = pos.strat === "csp";
    const cushion = (spot && pos.strike) ? ((isCSP ? (spot - pos.strike) : (pos.strike - spot)) / spot * 100) : null;
    const stratLabel = isCSP ? "CSP 卖 Put" : "CC 卖 Call";
    const targetStr = pos.targetPremium != null ? `目标 ≥$${pos.targetPremium.toFixed(2)}` : "未设目标价";
    const dteStr = dte != null ? `DTE ${dte}天` : "";
    const cushionStr = cushion != null ? `安全垫 ${cushion >= 0 ? "+" : ""}${cushion.toFixed(1)}%` : "";

    const typeL = pos.type === "call" ? "C" : "P";
    return `<div class="opts-pos-card opts-pending-card">
      <div class="opts-card-hd">
        <span class="opts-pending-badge">待执行</span>
        <span class="opts-badge ${isCSP ? "opts-badge-csp" : "opts-badge-cc"}">${isCSP ? "CSP" : "CC"}</span>
        <span class="opts-card-sym">${pos.sym} <span>$${pos.strike}${typeL}</span></span>
        ${dte != null ? `<span class="opts-dte-tag">${dte}d</span>` : ""}
        ${pos.entryDelta != null ? `<span class="opts-delta-tag">Δ${pos.entryDelta.toFixed(2)}</span>` : ""}
        ${spot ? `<span class="opts-card-spot">$${spot.toFixed(2)}</span>` : ""}
        <div class="opts-card-hd-r">
          <button class="btn primary opts-mini-btn" data-opt-fill="${pos.id}">记录成交</button>
          <button class="opts-mini-btn" data-opt-del-pending="${pos.id}">取消</button>
        </div>
      </div>
      <div class="opts-card-metrics">
        <div class="opts-card-m"><div class="opts-card-ml">目标权利金</div><div class="opts-card-mv">${pos.targetPremium != null ? "≥$" + pos.targetPremium.toFixed(2) : "未设"}</div></div>
        <div class="opts-card-m"><div class="opts-card-ml">数量</div><div class="opts-card-mv">${pos.qty}张</div></div>
        <div class="opts-card-m"><div class="opts-card-ml">到期日</div><div class="opts-card-mv">${pos.expiry ? pos.expiry.slice(5) : "—"}</div></div>
        <div class="opts-card-m"><div class="opts-card-ml">${isCSP ? "安全垫(现)" : "溢价(现)"}</div><div class="opts-card-mv ${cushion == null ? "dim" : cushion >= 0 ? "up" : "warn"}">${cushion == null ? "—" : (cushion >= 0 ? "+" : "") + cushion.toFixed(1) + "%"}</div></div>
      </div>
    </div>`;
  }

  function _optDoneMetaRow(pos) {
    const items = [];
    if (pos.entryDTE != null)   items.push({ l: "入场DTE", v: pos.entryDTE + "天", cls: "" });
    if (pos.entryDelta != null) items.push({ l: "入场Δ",   v: "Δ" + pos.entryDelta.toFixed(2), cls: "" });
    const daysHeld = pos.entryDate && pos.closedAt
      ? Math.max(1, Math.round((new Date(pos.closedAt) - new Date(pos.entryDate)) / 86400000))
      : null;
    if (daysHeld != null) items.push({ l: "持仓天数", v: daysHeld + "天", cls: "" });
    if (pos.status === "expired") {
      items.push({ l: "权利金捕获", v: "100%", cls: "up" });
    } else if (pos.status === "closed" && pos.closePremium != null && pos.premium > 0) {
      const capRate = (1 - pos.closePremium / pos.premium) * 100;
      items.push({ l: "权利金捕获", v: capRate.toFixed(0) + "%", cls: capRate >= 75 ? "up" : capRate >= 40 ? "" : "down" });
    }
    const ann = _optAnn(pos);
    if (ann !== -Infinity) items.push({ l: "年化收益", v: (ann >= 0 ? "+" : "") + ann.toFixed(1) + "%", cls: ann >= 0 ? "up" : "down" });
    if (!items.length) return "";
    return `<div class="opts-card-metrics">${items.map(i => `<div class="opts-card-m"><div class="opts-card-ml">${i.l}</div><div class="opts-card-mv ${i.cls}">${i.v}</div></div>`).join("")}</div>`;
  }

  function _optAnn(pos) {
    if (!pos.entryDate || !pos.closedAt) return -Infinity;
    if (pos.status === "open" || pos.status === "pending") return -Infinity;
    if (pos.strat === "csp" && pos.status === "assigned" && !pos.assignedStockSold) return -Infinity;
    const days = Math.max(1, Math.round((new Date(pos.closedAt) - new Date(pos.entryDate)) / 86400000));
    const finalPnl = _optFinalPnl(pos);
    if (finalPnl == null) return -Infinity;
    const capitalBase = pos.strat === "csp"
      ? pos.strike * 100 * pos.qty
      : (pos.underlyingAtEntry || pos.strike) * 100 * pos.qty;
    if (!capitalBase) return -Infinity;
    return finalPnl / capitalBase / days * 365 * 100;
  }

  function _optDonePosCard(pos) {
    const typeL = pos.type === "call" ? "C" : "P";
    const isCSP = pos.strat === "csp";
    const stMap = { expired: ["到期OTM", "var(--up)"], assigned: ["被指派", "var(--warn)"], closed: ["已平仓", "var(--fg-3)"] };
    const [stTxt, stColor] = stMap[pos.status] || ["—", "var(--fg-3)"];
    const delBtn = `<button class="opts-mini-btn opts-del" data-opt-del="${pos.id}" title="删除">✕</button>`;
    const stratBadge = `<span class="opts-badge ${isCSP ? "opts-badge-csp" : "opts-badge-cc"}">${isCSP ? "CSP" : "CC"}</span>`;

    // CSP assigned — still holding stock (live card, not "settled")
    if (pos.status === "assigned" && isCSP && !pos.assignedStockSold) {
      const spot       = optSpot(pos.sym);
      const premIncome = pos.premium * 100 * pos.qty;
      const stockShares = pos.qty * 100;
      const equityPnl  = spot ? (spot - pos.strike) * stockShares : null;
      const equityCls  = equityPnl == null ? "" : equityPnl >= 0 ? "up" : "down";
      const totalEst   = equityPnl != null ? premIncome + equityPnl : null;
      const totalCls   = totalEst == null ? "" : totalEst >= 0 ? "up" : "down";
      const cushionPct = spot ? (spot - pos.strike) / pos.strike * 100 : null;
      return `<div class="opts-pos-card opts-assigned-live">
        <div class="opts-card-hd">
          ${stratBadge}
          <span class="opts-card-sym">${pos.sym} <span>$${pos.strike}${typeL}</span></span>
          <span class="opts-st-tag" style="color:var(--warn);border-color:var(--warn)">持有正股</span>
          ${spot ? `<span class="opts-card-spot">$${spot.toFixed(2)}</span>` : ""}
          <div class="opts-card-hd-r">
            <button class="opts-mini-btn opts-sell-cc-btn" data-opt-sell-cc="${pos.id}" data-cc-sym="${pos.sym}" data-cc-qty="${pos.qty}" title="持有 ${stockShares} 股，可卖出 ${pos.qty} 张备兑 Call">+ CC</button>
            <button class="opts-mini-btn" data-opt-exit="${pos.id}">记录出仓</button>
            ${delBtn}
          </div>
        </div>
        <div class="opts-card-metrics">
          <div class="opts-card-m"><div class="opts-card-ml">持股成本</div><div class="opts-card-mv">$${pos.strike.toFixed(2)}</div></div>
          <div class="opts-card-m"><div class="opts-card-ml">持有股数</div><div class="opts-card-mv">${stockShares}股</div></div>
          <div class="opts-card-m"><div class="opts-card-ml">现价</div><div class="opts-card-mv">${spot ? "$" + spot.toFixed(2) : "—"}</div></div>
          <div class="opts-card-m"><div class="opts-card-ml">安全垫</div><div class="opts-card-mv ${cushionPct == null ? "" : cushionPct >= 0 ? "up" : "down"}">${cushionPct == null ? "—" : (cushionPct >= 0 ? "+" : "") + cushionPct.toFixed(1) + "%"}</div></div>
        </div>
        <div class="opts-pnl-row">
          <div class="opts-pnl-col"><div class="opts-pnl-label">期权收入</div><div class="opts-pnl-val up">+${fmt.usd(premIncome)}</div></div>
          <div class="opts-pnl-op">+</div>
          <div class="opts-pnl-col"><div class="opts-pnl-label">正股浮盈(估)</div><div class="opts-pnl-val ${equityCls}">${equityPnl == null ? "—" : (equityPnl >= 0 ? "+" : "−") + fmt.usd(Math.abs(equityPnl))}</div></div>
          <div class="opts-pnl-op">=</div>
          <div class="opts-pnl-col opts-pnl-total"><div class="opts-pnl-label">合计(估)</div><div class="opts-pnl-val ${totalCls}">${totalEst == null ? "—" : (totalEst >= 0 ? "+" : "−") + fmt.usd(Math.abs(totalEst))}</div></div>
        </div>
        ${(() => {
          const activeCC = _activeOpts().find(p => p.linkedCspId === pos.id && p.strat === "cc" && p.status === "open");
          if (!activeCC) return "";
          const ccDTE  = _optDTE(activeCC.expiry);
          const ccPrem = activeCC.premium * 100 * activeCC.qty;
          return `<div class="opts-linked-cc-row"><span class="opts-wheel-badge">轮组</span><span class="muted">备兑CC中:</span> $${activeCC.strike}C · 到期 ${activeCC.expiry.slice(5)} · DTE ${ccDTE}d · <b class="up">+${fmt.usd(ccPrem)}</b></div>`;
        })()}
      </div>`;
    }

    // All other settled cards — unified P&L breakdown layout
    const bd = _optPnlBreakdown(pos);
    const total    = bd?.net ?? (pos.realized ?? 0);
    const totalCls = total >= 0 ? "up" : "down";

    // Header tag text/color by settlement type
    let tagTxt = stTxt, tagColor = stColor;
    if (pos.status === "assigned" && isCSP && pos.assignedStockSold) { tagTxt = "指派+出仓"; tagColor = "var(--fg-3)"; }

    // Secondary info line
    let metaLine = "";
    if (pos.status === "expired") {
      metaLine = `到期日 ${pos.expiry || ""} · 卖出 $${pos.premium.toFixed(2)} ×${pos.qty}张`;
    } else if (pos.status === "closed") {
      metaLine = `卖出 $${pos.premium.toFixed(2)} · 买回 $${(pos.closePremium||0).toFixed(2)} ×${pos.qty}张 · ${pos.closedAt || ""}`;
    } else if (pos.status === "assigned" && isCSP) {
      const stockShares = pos.qty * 100;
      metaLine = `指派 $${pos.strike.toFixed(2)} · 出仓 $${pos.assignedExitPrice?.toFixed(2)} × ${stockShares}股 · ${pos.assignedExitDate || ""}`;
    } else if (pos.status === "assigned" && !isCSP) {
      metaLine = `卖出 $${pos.premium.toFixed(2)} ×${pos.qty}张 · 结算 $${(pos.settleSpot||0).toFixed(2)} · ${pos.closedAt || ""}`;
    }

    return `<div class="opts-pos-card opts-card-done">
      <div class="opts-card-hd">
        ${stratBadge}
        <span class="opts-card-sym">${pos.sym} <span>$${pos.strike}${typeL}</span></span>
        <span class="opts-st-tag" style="color:${tagColor};border-color:${tagColor}">${tagTxt}</span>
        <div class="opts-card-hd-r"><div class="opts-card-amt ${totalCls}">${total >= 0 ? "+" : "−"}${fmt.usd(Math.abs(total))}</div>${delBtn}</div>
      </div>
      <div class="opts-card-meta">${metaLine}</div>
      ${_pnlBreakdownHTML(bd)}
      ${_optDoneMetaRow(pos)}
    </div>`;
  }

  function _optWheelGroupCard(csp, cc) {
    const groupId = csp.id + "_" + cc.id;
    const isExpanded = _optsWheelExpanded.has(groupId);
    const cspPrem   = csp.premium * 100 * csp.qty;
    const ccOptPnl  = cc.realized ?? 0;
    const stockShares = csp.qty * 100;
    const stockPnl  = (cc.strike - csp.strike) * stockShares;
    const totalPnl  = cspPrem + ccOptPnl + stockPnl;
    const totalCls  = totalPnl >= 0 ? "up" : "down";
    const startDate = csp.entryDate || "";
    const endDate   = (cc.closedAt || "").slice(0, 10);
    const daysTotal = (startDate && endDate)
      ? Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000))
      : null;
    const capitalBase = csp.strike * stockShares;
    const annualized  = (daysTotal && capitalBase > 0)
      ? (totalPnl / capitalBase / daysTotal * 365 * 100).toFixed(1) + "%"
      : "—";
    const toggleLabel = isExpanded ? "▾ 合看" : "▸ 分看";

    const expandedHTML = isExpanded ? `
      <div class="opts-wheel-sub-cards">
        <div class="opts-wheel-sub-label">CSP 期权</div>
        ${_optDonePosCard(csp)}
        <div class="opts-wheel-sub-label">CC 备兑</div>
        ${_optDonePosCard(cc)}
      </div>` : "";

    return `<div class="opts-wheel-group-card">
      <div class="opts-card-hd">
        <span class="opts-wheel-badge">轮组</span>
        <span class="opts-card-sym">${csp.sym}</span>
        <span class="opts-wheel-flow">CSP→正股→CC</span>
        <div class="opts-card-hd-r">
          <div class="opts-card-amt ${totalCls}">${totalPnl >= 0 ? "+" : "−"}${fmt.usd(Math.abs(totalPnl))}</div>
          <button class="opts-mini-btn opts-wheel-toggle-btn" data-wheel-toggle="${groupId}">${toggleLabel}</button>
        </div>
      </div>
      <div class="opts-card-metrics">
        <div class="opts-card-m"><div class="opts-card-ml">CSP权利金</div><div class="opts-card-mv up">+${fmt.usd(cspPrem)}</div></div>
        <div class="opts-card-m"><div class="opts-card-ml">CC期权盈亏</div><div class="opts-card-mv ${ccOptPnl >= 0 ? "up" : "down"}">${ccOptPnl >= 0 ? "+" : "−"}${fmt.usd(Math.abs(ccOptPnl))}</div></div>
        <div class="opts-card-m"><div class="opts-card-ml">正股盈亏</div><div class="opts-card-mv ${stockPnl >= 0 ? "up" : "down"}">${stockPnl >= 0 ? "+" : "−"}${fmt.usd(Math.abs(stockPnl))}</div></div>
        <div class="opts-card-m"><div class="opts-card-ml">轮转年化</div><div class="opts-card-mv ${totalPnl >= 0 ? "up" : "down"}">${annualized}</div></div>
      </div>
      ${daysTotal ? `<div class="opts-card-meta">轮转周期 ${daysTotal}天 · ${startDate} → ${endDate}</div>` : ""}
      ${expandedHTML}
    </div>`;
  }

  function _optSummaryHTML(open, done) {
    // ── 已了结 P&L (excluding live assigned stock — unrealized)
    const liveAssigned  = done.filter(p => p.status === "assigned" && p.strat === "csp" && !p.assignedStockSold);
    const settledPosns  = done.filter(p => !(p.status === "assigned" && p.strat === "csp" && !p.assignedStockSold));
    const expiredPosns  = settledPosns.filter(p => p.status === "expired");
    const closedPosns   = settledPosns.filter(p => p.status === "closed");
    const assignedPosns = settledPosns.filter(p => p.status === "assigned");
    // CSP指派率：全部done里的CSP（含liveAssigned），分母=全部CSP
    const allCspDone      = done.filter(p => p.strat === "csp");
    const allCspAssigned  = done.filter(p => p.strat === "csp" && p.status === "assigned");
    const cspAssignRate   = allCspDone.length > 0
      ? (allCspAssigned.length / allCspDone.length * 100).toFixed(0) + "%"
      : "—";
    const realizedPnl   = settledPosns.reduce((s, p) => s + (_optFinalPnl(p) ?? 0), 0);
    const settledPrem   = done.reduce((s, p) => s + p.premium * 100 * p.qty, 0);
    const openPrem      = open.reduce((s, p) => s + p.premium * 100 * p.qty, 0);
    const realCls       = realizedPnl >= 0 ? "up" : "down";

    // ── 期权胜率: OTM到期 + 盈利平仓；assigned 不计入胜/负
    const closedWins  = closedPosns.filter(p => (_optFinalPnl(p) ?? 0) > 0).length;
    const winTotal    = expiredPosns.length + closedPosns.length;
    const wins        = expiredPosns.length + closedWins;
    const winRate     = winTotal > 0 ? (wins / winTotal * 100).toFixed(0) + "%" : "—";

    // ── 平均年化
    const annVals     = settledPosns.map(p => _optAnn(p)).filter(v => v !== -Infinity);
    const avgAnn      = annVals.length ? (annVals.reduce((s,v)=>s+v,0)/annVals.length).toFixed(1) : null;

    // ── 持仓浮盈 — 仅统计已记录 mark 的合约，无 mark 显示未记录数
    let markFloat = null, noMarkQty = 0;
    let openCspSecured = 0;
    const openTotalQty  = open.reduce((s, p) => s + p.qty, 0);
    const openCspQty    = open.filter(p => p.strat === "csp").reduce((s, p) => s + p.qty, 0);
    for (const pos of open) {
      if (pos.strat === "csp") openCspSecured += pos.strike * 100 * pos.qty;
      if (pos.manualMark != null) {
        if (markFloat === null) markFloat = 0;
        markFloat += (pos.premium - pos.manualMark) * 100 * pos.qty;
      } else {
        noMarkQty += pos.qty;
      }
    }
    const floatCls   = markFloat == null ? "" : markFloat >= 0 ? "up" : "down";
    const floatStr   = markFloat == null ? "—" : (markFloat >= 0 ? "+" : "−") + fmt.usd(Math.abs(markFloat));
    const floatLabel = noMarkQty === 0 ? "持仓浮盈" : "持仓浮盈(已记录)";

    // ── 持股浮盈 (liveAssigned)
    let equityPnl = null, equityKnown = true;
    const liveAssignedQty  = liveAssigned.reduce((s, p) => s + p.qty, 0);
    const liveAssignedCash = liveAssigned.reduce((s, p) => s + p.strike * 100 * p.qty, 0);
    for (const p of liveAssigned) {
      const spot = optSpot(p.sym);
      if (!spot) { equityKnown = false; continue; }
      if (equityPnl === null) equityPnl = 0;
      equityPnl += (spot - p.strike) * p.qty * 100;
    }
    const eqCls = equityPnl == null ? "" : equityPnl >= 0 ? "up" : "down";
    const eqStr = equityPnl == null ? "—" : (equityPnl >= 0 ? "+" : "−") + fmt.usd(Math.abs(equityPnl));

    // ── 现金占用合计
    const totalOccupied = openCspSecured + liveAssignedCash;
    const hasSide       = open.length > 0 || liveAssigned.length > 0;

    const cell = (label, val, cls = "", sub = "") => `<div class="opts-stat">
      <div class="opts-stat-label">${label}</div>
      <div class="opts-stat-val ${cls}">${val}</div>
      ${sub ? `<div class="opts-stat-sub">${sub}</div>` : ""}
    </div>`;

    const sidePanel = !hasSide ? "" : `<div class="opts-pnl-hero-div"></div>
      <div class="opts-pnl-hero-side">
        ${open.length ? `
        <div class="opts-pnl-side-item">
          <div class="opts-pnl-side-label">${floatLabel} · ${openTotalQty}张</div>
          <div class="opts-pnl-side-val ${floatCls}">${floatStr}</div>
          ${noMarkQty > 0 ? `<div class="opts-pnl-side-sub">${noMarkQty}张未记录现价</div>` : ""}
        </div>` : ""}
        ${totalOccupied > 0 ? `
        <div class="opts-pnl-side-item opts-pnl-item-sep">
          <div class="opts-pnl-side-label">现金占用</div>
          ${openCspSecured > 0 ? `<div class="opts-pnl-occ-row"><span>CSP保证金</span><span>${fmt.usd(openCspSecured)} · ${openCspQty}张</span></div>` : ""}
          ${liveAssignedCash > 0 ? `<div class="opts-pnl-occ-row"><span>持股成本</span><span>${fmt.usd(liveAssignedCash)} · ${liveAssignedQty}张</span></div>` : ""}
          ${openCspSecured > 0 && liveAssignedCash > 0 ? `<div class="opts-pnl-occ-row opts-pnl-occ-total"><span>合计占用</span><span>${fmt.usd(totalOccupied)}</span></div>` : ""}
        </div>` : ""}
        ${liveAssigned.length ? `
        <div class="opts-pnl-side-item opts-pnl-item-sep">
          <div class="opts-pnl-side-label">持股浮盈(估) · ${liveAssigned.map(p=>p.sym).join("/")} · ${liveAssignedQty}张</div>
          <div class="opts-pnl-side-val ${eqCls}">${eqStr}</div>
          ${!equityKnown ? `<div class="opts-pnl-side-sub">部分未更新</div>` : ""}
        </div>` : ""}
      </div>`;

    return `<div class="opts-summary-block">
      <div class="opts-pnl-hero${hasSide ? " opts-pnl-hero-split" : ""}">
        <div class="opts-pnl-hero-main">
          <div class="opts-pnl-hero-label">净盈亏 · 已了结</div>
          <div class="opts-pnl-hero-val ${realCls}">${realizedPnl >= 0 ? "+" : "−"}${fmt.usd(Math.abs(realizedPnl))}</div>
          <div class="opts-pnl-hero-sub">已收权利金 +${fmt.usd(settledPrem + openPrem)} · ${settledPosns.length}笔了结</div>
        </div>
        ${sidePanel}
      </div>
      <div class="opts-ws-grid">
        ${cell("期权胜率", winRate, winTotal > 0 && wins / winTotal >= 0.6 ? "up" : "down", "OTM+盈利平仓 · " + wins + "/" + winTotal + "笔")}
        ${cell("CSP指派率", cspAssignRate, "", allCspAssigned.length + "/" + allCspDone.length + "笔CSP")}
        ${cell("平均年化", avgAnn ? (parseFloat(avgAnn) >= 0 ? "+" : "") + avgAnn + "%" : "—", avgAnn && parseFloat(avgAnn) >= 0 ? "up" : "down", annVals.length + " 笔计算")}
        ${cell("已收权利金", "+" + fmt.usd(settledPrem + openPrem), "up", "历史累计")}
      </div>
    </div>`;
  }

  function _optWheelStatsHTML(all) {
    const done = all.filter(p => p.status !== "open" && p.status !== "pending");
    if (done.length < 3) return "";

    // Monthly breakdown (last 6 months with settled data)
    const byMonth = {};
    for (const p of done) {
      const key = (p.closedAt || p.expiry || "").slice(0, 7);
      if (!key) continue;
      if (!byMonth[key]) byMonth[key] = { pnl: 0, count: 0, wins: 0, prem: 0 };
      const pnl = _optFinalPnl(p) ?? 0;
      byMonth[key].pnl   += pnl;
      byMonth[key].prem  += p.premium * 100 * p.qty;
      byMonth[key].count += 1;
      if (pnl > 0) byMonth[key].wins++;
    }
    const months = Object.keys(byMonth).sort().reverse().slice(0, 6);
    if (months.length < 2) return "";

    const monthRows = months.map(m => {
      const d      = byMonth[m];
      const pnlCls = d.pnl > 0 ? "up" : d.pnl < 0 ? "down" : "";
      const wr     = d.count ? (d.wins / d.count * 100).toFixed(0) + "%" : "—";
      return `<tr>
        <td class="opts-mt-month">${m.slice(5)}</td>
        <td class="opts-mt-pnl ${pnlCls}">${d.pnl >= 0 ? "+" : "−"}$${Math.abs(d.pnl).toFixed(0)}</td>
        <td class="opts-mt-wr">${wr}</td>
        <td class="opts-mt-count">${d.count}笔</td>
        <td class="opts-mt-prem" style="color:var(--fg-3)">+${fmt.usd(d.prem)}</td>
      </tr>`;
    }).join("");

    return `<div class="opts-wheel-stats">
      <div class="opts-sub-label" style="padding-top:18px">月度明细 · Monthly</div>
      <div class="opts-month-wrap">
        <table class="opts-month-table">
          <thead><tr><th>月份</th><th>净P&L</th><th>胜率</th><th>笔数</th><th style="color:var(--fg-3)">权利金收入</th></tr></thead>
          <tbody>${monthRows}</tbody>
        </table>
      </div>
    </div>`;
  }

  function _optStrategiesHTML() {
    // Grouped by market direction / scenario
    const STRATS = [
      { icon: "📈", group: "看涨", sub: "Bullish", strats: [
        { name: "CSP",            zh: "现金担保看跌", desc: "有偿设定买入价，OTM到期全收权利金",   timing: "IV高 · 支撑位附近 · 30–45 DTE" },
        { name: "Bull Put Spread",zh: "牛市看跌价差", desc: "限定风险做多，保证金小于CSP",         timing: "支撑位 · IV高 · 高波动标的" },
        { name: "Long Call",      zh: "买入看涨",     desc: "有限成本博上涨，损失封顶于权利金",   timing: "IV低 · 有明确催化剂 · 30 DTE+" },
        { name: "PMCC",           zh: "穷人版备兑",   desc: "LEAPS代替持股 + 卖Call降成本",       timing: "趋势确立 · LEAPS Delta ≥ 0.8" },
      ]},
      { icon: "📉", group: "看跌 / 对冲", sub: "Bearish · Hedge", strats: [
        { name: "Bear Call Spread", zh: "熊市看涨价差", desc: "限定风险做空，阻力位上方布局",     timing: "阻力位 · RSI > 70 · IV高" },
        { name: "Protective Put",   zh: "保护性看跌",   desc: "给持仓买保险，盈利锁住保留上行",  timing: "IV低时便宜 · 重大事件前" },
      ]},
      { icon: "↔️", group: "横盘收租", sub: "Neutral · Income", strats: [
        { name: "CC",             zh: "备兑看涨",     desc: "持股卖Call增收，主动降低持股成本",   timing: "阻力位附近 · IV偏高 · 21–30 DTE" },
        { name: "Wheel",          zh: "轮转策略",     desc: "CSP→持股→CC循环，把波动变现金流",   timing: "流动性ETF · 估值支撑 · IV偏高" },
        { name: "Iron Condor",    zh: "铁鹰",         desc: "双边卖权，价格在区间内双收",         timing: "IV Rank > 50% · FOMC/财报后" },
        { name: "Short Strangle", zh: "卖出宽跨式",   desc: "双边OTM收租，押注不大波动",         timing: "IV Rank > 70% · 无催化剂" },
        { name: "Calendar Spread",zh: "日历价差",     desc: "近期快Theta − 远期慢Theta套利",     timing: "近月IV > 远月IV · 平值行权价" },
      ]},
      { icon: "💥", group: "押注大波动", sub: "Volatility Play", strats: [
        { name: "Long Straddle",  zh: "买入跨式",     desc: "方向未知押大波动，损失封顶于权利金", timing: "IV Rank < 30% · 财报前1–2周" },
      ]},
    ];

    const rows = strats => strats.map(s => `<tr>
      <td class="opts-sb-name"><b>${s.name}</b><span class="opts-sb-zh">${s.zh}</span></td>
      <td class="opts-sb-desc">${s.desc}</td>
      <td class="opts-sb-timing">${s.timing}</td>
    </tr>`).join("");

    const sections = STRATS.map(g => `
      <div class="opts-sb-section">
        <div class="opts-sb-hd">
          <span class="opts-sb-icon">${g.icon}</span>${g.group}
          <span class="opts-sb-sub">${g.sub}</span>
        </div>
        <table class="opts-sb-table">
          <thead><tr><th>策略</th><th>代表</th><th>入场时机</th></tr></thead>
          <tbody>${rows(g.strats)}</tbody>
        </table>
      </div>`).join("");

    return `<div class="opts-strat-ref">
      <details>
        <summary class="opts-strat-sum">策略手册 · 按场景分类 · 点击展开</summary>
        <div class="opts-strat-book">${sections}</div>
      </details>
    </div>`;
  }

  function renderOptions() {
    const innerId = currentOptMode === "real" ? "real-opts-inner" : "sim-opts-inner";
    const inner = document.getElementById(innerId);
    if (!inner) return;
    const arr = _activeOpts();
    _optMigrate();
    settleExpiredOptions();

    // Live spot pills for the watched ETFs
    const pills = _optWatchSyms().map(s => {
      const v = optSpot(s);
      return `<span class="opts-spot-pill"><b>${s}</b> ${v ? "$" + v.toFixed(2) : "—"}</span>`;
    }).join("");

    const pending = arr.filter(p => p.status === "pending");
    const open = arr.filter(p => p.status === "open");
    const done = [...arr.filter(p => p.status && p.status !== "open" && p.status !== "pending")];
    const all = [...open, ...done];

    const liveAssigned = done.filter(p => p.status === "assigned" && p.strat === "csp" && !p.assignedStockSold);

    // Settled: split into 3 semantic sub-groups, each sorted by annualized return desc
    const _sortByAnn = arr => arr.sort((a, b) => {
      const annA = _optAnn(a), annB = _optAnn(b);
      if (annA === -Infinity && annB === -Infinity) return (b.closedAt || "").localeCompare(a.closedAt || "");
      if (annA === -Infinity) return 1;
      if (annB === -Infinity) return -1;
      return annB - annA;
    });
    const settledExpired   = _sortByAnn(done.filter(p => p.status === "expired"));
    const settledClosed    = _sortByAnn(done.filter(p => p.status === "closed"));
    const settledFullCycle = _sortByAnn(done.filter(p =>
      p.status === "assigned" && !(p.strat === "csp" && !p.assignedStockSold)));

    // Group linked CSP + CC pairs into Wheel combo cards
    const _wheelPairs   = [];
    const _wheelUsedIds = new Set();
    settledFullCycle.forEach(p => {
      if (p.strat === "cc" && p.linkedCspId && !_wheelUsedIds.has(p.id)) {
        const parentCsp = settledFullCycle.find(c => c.id === p.linkedCspId && !_wheelUsedIds.has(c.id));
        if (parentCsp) {
          _wheelPairs.push({ csp: parentCsp, cc: p });
          _wheelUsedIds.add(p.id);
          _wheelUsedIds.add(parentCsp.id);
        }
      }
    });
    const _soloSettled   = settledFullCycle.filter(p => !_wheelUsedIds.has(p.id));
    const fullCycleCount = _wheelPairs.length + _soloSettled.length;
    const fullCycleHTML  = [
      ..._wheelPairs.map(({csp, cc}) => _optWheelGroupCard(csp, cc)),
      ..._soloSettled.map(_optDonePosCard),
    ].join("");

    const totalSettled = settledExpired.length + settledClosed.length + fullCycleCount;

    const settledArrow = _optsSettledOpen ? "▾" : "▸";
    const settledSection = totalSettled ? `
      <div class="opts-sub-label opts-settled-toggle" style="cursor:pointer;user-select:none">
        ${settledArrow} 已了结 · Settled · ${totalSettled}
        <span style="font-size:9px;color:var(--accent);margin-left:4px">按年化排序</span>
      </div>
      ${_optsSettledOpen ? `
        ${settledExpired.length ? `<div class="opts-sub-label" style="color:var(--up);padding-top:8px;font-size:9px">到期 OTM · Expired · ${settledExpired.length}</div>${settledExpired.map(_optDonePosCard).join("")}` : ""}
        ${settledClosed.length  ? `<div class="opts-sub-label" style="color:var(--fg-2);padding-top:8px;font-size:9px">买回平仓 · Closed · ${settledClosed.length}</div>${settledClosed.map(_optDonePosCard).join("")}` : ""}
        ${fullCycleCount ? `<div class="opts-sub-label" style="color:var(--accent);padding-top:8px;font-size:9px">完整轮转 · Full Cycle · ${fullCycleCount}</div>${fullCycleHTML}` : ""}
      ` : ""}` : "";

    const body = (pending.length || open.length || done.length)
      ? `${_optSummaryHTML(open, done)}
         ${pending.length ? `<div class="opts-sub-label opts-sub-pending">待执行 · Pending · ${pending.length}</div>${pending.map(_optPendingCard).join("")}` : ""}
         ${open.length ? `<div class="opts-sub-label">持仓中 · Open · ${open.length}</div>${open.map(_optOpenPosCard).join("")}` : ""}
         ${liveAssigned.length ? `<div class="opts-sub-label" style="color:var(--warn)">持有正股 · Holding Stock · ${liveAssigned.length}</div>${liveAssigned.map(_optDonePosCard).join("")}` : ""}
         ${settledSection}
         ${_optWheelStatsHTML(all)}`
      : `<div class="opts-empty">暂无${currentOptMode === "real" ? "实盘" : "模拟"}期权仓位 — 点击「卖出期权」手动记录一笔 CSP 或备兑 Call，或点击「预设单」盘前计划</div>`;

    inner.innerHTML = `
      <div class="opts-controls">
        <div class="opts-spots">${pills}</div>
        <div class="opts-btns">
          <button class="btn" id="opts-pending-btn" style="font-size:11.5px">+ 预设单</button>
          <button class="btn primary" id="opts-sell-btn" style="font-size:11.5px">+ 卖出期权</button>
        </div>
      </div>
      ${body}
      ${_optStrategiesHTML()}`;

    wireOptions();
  }

  // Backward-compat alias
  function renderSimOptions() { renderOptions(); }

  function wireOptions() {
    const innerId = currentOptMode === "real" ? "real-opts-inner" : "sim-opts-inner";
    const root = document.getElementById(innerId);
    if (!root) return;
    const arr = _activeOpts();
    const settledToggle = root.querySelector(".opts-settled-toggle");
    if (settledToggle) settledToggle.addEventListener("click", () => {
      _optsSettledOpen = !_optsSettledOpen;
      renderOptions();
    });
    $$("[data-wheel-toggle]", root).forEach(btn => btn.addEventListener("click", () => {
      const gid = btn.dataset.wheelToggle;
      if (_optsWheelExpanded.has(gid)) _optsWheelExpanded.delete(gid);
      else _optsWheelExpanded.add(gid);
      renderOptions();
    }));
    const sellBtn = root.querySelector("#opts-sell-btn");
    if (sellBtn) sellBtn.addEventListener("click", () => openOptionsSellModal());
    const pendingBtn = root.querySelector("#opts-pending-btn");
    if (pendingBtn) pendingBtn.addEventListener("click", () => openOptionsSellModal({ isPending: true }));
    $$("[data-opt-close]", root).forEach(btn => btn.addEventListener("click", () => {
      const pos = arr.find(p => p.id === btn.dataset.optClose);
      if (pos) openOptionsCloseModal(pos, false);
    }));
    $$("[data-opt-roll]", root).forEach(btn => btn.addEventListener("click", () => {
      const pos = arr.find(p => p.id === btn.dataset.optRoll);
      if (pos) openOptionsCloseModal(pos, true);
    }));
    $$("[data-opt-mark]", root).forEach(el => el.addEventListener("click", () => {
      const pos = arr.find(p => p.id === el.dataset.optMark);
      if (pos) openOptionsMarkModal(pos);
    }));
    $$("[data-opt-exit]", root).forEach(btn => btn.addEventListener("click", () => {
      const pos = arr.find(p => p.id === btn.dataset.optExit);
      if (pos) openAssignedExitModal(pos);
    }));
    $$("[data-opt-sell-cc]", root).forEach(btn => btn.addEventListener("click", () => {
      const sym = btn.dataset.ccSym;
      const qty = parseInt(btn.dataset.ccQty) || 1;
      const linkedCspId = btn.dataset.optSellCc; // pos.id of the parent CSP
      openOptionsSellModal({ sym, strat: "cc", qty, linkedCspId });
    }));
    $$("[data-opt-del]", root).forEach(btn => btn.addEventListener("click", () => {
      const idx = arr.findIndex(p => p.id === btn.dataset.optDel);
      if (idx !== -1) { arr.splice(idx, 1); saveToStorage(); renderOptions(); }
    }));
    $$("[data-opt-fill]", root).forEach(btn => btn.addEventListener("click", () => {
      const pos = arr.find(p => p.id === btn.dataset.optFill);
      if (pos) openOptionsFillModal(pos);
    }));
    $$("[data-opt-del-pending]", root).forEach(btn => btn.addEventListener("click", () => {
      const pos = arr.find(p => p.id === btn.dataset.optDelPending);
      if (!pos) return;
      if (!confirm(`确认取消预设单 ${pos.sym} $${pos.strike}${pos.type === "call" ? "C" : "P"}？`)) return;
      const idx = arr.findIndex(p => p.id === pos.id);
      if (idx >= 0) { arr.splice(idx, 1); saveToStorage(); renderOptions(); }
    }));
  }
  // Legacy alias
  function wireSimOptions() { wireOptions(); }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  let _optModalClickOutsideReady = false;
  function _optModalMode(mode) {
    // mode: "sell" shows all fields; "close"/"mark"/"exit" show limited fields
    const modal = $("#opts-entry-modal");
    // Wrapper divs that group paired fields (hide/show the whole pair together)
    const wrapStrikeExpiry = modal.querySelector("#opts-row-strike-expiry");
    const wrapQtyPremium   = modal.querySelector("#opts-row-qty-premium");
    const sellOnlyIds = ["#opts-row-sym", "#opts-row-strat"];
    const premRow  = modal.querySelector("#opts-row-premium");
    const exitRow  = modal.querySelector("#opts-row-exit");
    const isSell = mode === "sell";
    sellOnlyIds.forEach(sel => { const el = modal.querySelector(sel); if (el) el.style.display = isSell ? "" : "none"; });
    if (wrapStrikeExpiry) wrapStrikeExpiry.style.display = isSell ? "" : "none";
    // In close/mark modes: show wrapper but hide just the qty column so premium shows full-width
    if (wrapQtyPremium) {
      wrapQtyPremium.style.display = mode === "exit" ? "none" : "flex";
      const qtyRow = modal.querySelector("#opts-row-qty");
      if (qtyRow) qtyRow.style.display = isSell ? "" : "none";
    }
    if (premRow) premRow.style.flex = isSell ? "1" : "";
    if (exitRow) exitRow.style.display = mode === "exit" ? "" : "none";
    const closeDateRow = modal.querySelector("#opts-row-close-date");
    if (closeDateRow) closeDateRow.style.display = mode === "close" ? "" : "none";
    const deltaRow = modal.querySelector("#opts-row-delta");
    if (deltaRow) deltaRow.style.display = isSell ? "" : "none";
    // Wire click-outside-to-close once
    if (!_optModalClickOutsideReady) {
      _optModalClickOutsideReady = true;
      let _mousedownOnBg = false;
      modal.addEventListener("mousedown", e => { _mousedownOnBg = e.target === modal; });
      modal.addEventListener("click", e => { if (_mousedownOnBg && e.target === modal) modal.style.display = "none"; });
    }
    return modal;
  }

  function _optWireModalChips(modal) {
    $$(".opts-sym-chip", modal).forEach(btn => {
      btn.classList.toggle("active", btn.dataset.optsym === simOptionsSym);
      btn.onclick = () => {
        simOptionsSym = btn.dataset.optsym;
        modal.querySelector("#opts-sym-input").value = simOptionsSym;
        $$(".opts-sym-chip", modal).forEach(b => b.classList.toggle("active", b.dataset.optsym === simOptionsSym));
        modal._recalc?.();
      };
    });
    $$(".opts-type-btn", modal).forEach(btn => {
      btn.classList.toggle("active", btn.dataset.optstrat === simOptionsStrat);
      btn.onclick = () => {
        simOptionsStrat = btn.dataset.optstrat;
        $$(".opts-type-btn", modal).forEach(b => b.classList.toggle("active", b.dataset.optstrat === simOptionsStrat));
        modal._recalc?.();
      };
    });
  }

  // ── Sell-to-open (manual entry) ───────────────────────────────────────────
  function openOptionsSellModal(prefill = {}) {
    const isPending = prefill.isPending === true;
    const modal = _optModalMode("sell");
    if (!modal) return;
    if (prefill.sym) simOptionsSym = prefill.sym;
    if (prefill.strat) simOptionsStrat = prefill.strat;
    modal.querySelector(".opts-modal-title").textContent = isPending ? "预设期权单 · 盘前计划" : "卖出期权 · 手动记录";
    modal.querySelector("#opts-modal-meta").textContent = isPending
      ? "盘前规划期权参数，开盘成交后点击「记录成交」填入实际权利金激活仓位"
      : "行权价/权利金/到期日按券商成交填写，现价自动取 ETF 实时价";
    const premLabel = modal.querySelector("#opts-row-premium label");
    if (premLabel) premLabel.textContent = isPending ? "目标权利金（选填）" : "权利金 ($/share)";
    const symIn  = modal.querySelector("#opts-sym-input");
    const strkIn = modal.querySelector("#opts-strike");
    const expIn  = modal.querySelector("#opts-expiry-date");
    const qtyEl   = modal.querySelector("#opts-qty");
    const premEl  = modal.querySelector("#opts-premium");
    const deltaEl = modal.querySelector("#opts-delta");
    premEl.placeholder = isPending ? "期望最低卖价（可不填）" : "券商成交价";
    symIn.value = simOptionsSym;
    strkIn.value = prefill.strike || "";
    expIn.value = prefill.expiry || "";
    expIn.min = new Date().toISOString().slice(0, 10);
    qtyEl.value = String(prefill.qty || 1);
    qtyEl.disabled = false;
    premEl.value = "";
    if (deltaEl) deltaEl.value = "";
    const calcEl = modal.querySelector("#opts-calc");

    const recalc = () => {
      const sym = (symIn.value || "").toUpperCase().trim();
      const isCSP = simOptionsStrat === "csp";
      const strike = parseFloat(strkIn.value) || 0;
      const qty = Math.max(1, parseInt(qtyEl.value) || 1);
      const prem = parseFloat(premEl.value) || 0;
      const dte = expIn.value ? _optDTE(expIn.value) : 0;
      const spot = optSpot(sym);
      const lines = [];
      if (spot) lines.push(`<div><span>${sym} 现价</span><b>$${spot.toFixed(2)}</b></div>`);
      if (prem > 0 && qty > 0) lines.push(`<div><span>${isPending ? "目标权利金收入" : "权利金收入"}</span><b class="up">+${fmt.usd(prem * 100 * qty)}</b></div>`);
      if (strike > 0 && spot) {
        const cushion = (isCSP ? (spot - strike) : (strike - spot)) / spot * 100;
        lines.push(`<div><span>距行权价</span><b class="${cushion >= 0 ? "" : "down"}">${cushion >= 0 ? "+" : ""}${cushion.toFixed(1)}%</b></div>`);
      }
      if (isCSP && strike > 0) {
        lines.push(`<div><span>占用现金</span><b>${fmt.usd(strike * 100 * qty)}</b></div>`);
        if (prem > 0) lines.push(`<div><span>盈亏平衡</span><b>$${(strike - prem).toFixed(2)}</b></div>`);
        if (prem > 0 && dte > 0) lines.push(`<div><span>年化收益</span><b class="up">${(prem / strike / dte * 365 * 100).toFixed(1)}%</b></div>`);
      }
      if (!isCSP) {
        lines.push(`<div><span>需持有正股</span><b>${qty * 100} 股</b></div>`);
        if (strike > 0 && prem > 0) lines.push(`<div><span>若被行权总收入</span><b>${fmt.usd((strike + prem) * 100 * qty)}</b></div>`);
        if (prem > 0 && spot && dte > 0) lines.push(`<div><span>年化收益(对现价)</span><b class="up">${(prem / spot / dte * 365 * 100).toFixed(1)}%</b></div>`);
      }
      calcEl.innerHTML = lines.join("") || `<div><span class="muted">${isPending ? "填写后预览收益指标（盘前参考）" : "填写后自动计算收益指标"}</span></div>`;
    };
    modal._recalc = recalc;
    [symIn, strkIn, expIn, qtyEl, premEl, deltaEl].filter(Boolean).forEach(el => el.oninput = recalc);
    _optWireModalChips(modal);
    recalc();
    modal.style.display = "flex";

    modal.querySelector("#opts-confirm-btn").onclick = () => {
      const sym = (symIn.value || "").toUpperCase().trim();
      const strike = parseFloat(strkIn.value);
      const expiry = expIn.value;
      const qty = Math.max(1, parseInt(qtyEl.value) || 1);
      const prem = parseFloat(premEl.value);
      if (!sym || !(strike > 0) || !expiry) { alert("请填写标的、行权价和到期日"); return; }
      if (!isPending && !(prem > 0)) { alert("请填写权利金"); return; }
      const isCSP = simOptionsStrat === "csp";
      const entryDelta = deltaEl ? (parseFloat(deltaEl.value) || null) : null;
      const optArr = _activeOpts();
      if (isPending) {
        // Carry through explicit link; do NOT auto-detect here — CC isn't open yet
        const pendingLink = prefill.linkedCspId || null;
        optArr.push({
          id: Date.now().toString(36),
          sym, strat: isCSP ? "csp" : "cc", type: isCSP ? "put" : "call",
          strike, expiry, qty,
          targetPremium: prem > 0 ? prem : null,
          ...(entryDelta > 0 ? { entryDelta } : {}),
          ...(pendingLink ? { linkedCspId: pendingLink } : {}),
          status: "pending",
          createdAt: new Date().toISOString().slice(0, 10),
        });
      } else {
        // Auto-detect parent CSP when not explicitly provided (direct sell)
        let linkedCspId = prefill.linkedCspId || null;
        if (!linkedCspId && !isCSP) {
          const parentCsp = optArr.find(p =>
            p.sym === sym && p.strat === "csp" && p.status === "assigned" && !p.assignedStockSold
          );
          if (parentCsp) linkedCspId = parentCsp.id;
        }
        const entryDTE = _optDTE(expiry);
        optArr.push({
          id: Date.now().toString(36),
          sym, strat: isCSP ? "csp" : "cc", type: isCSP ? "put" : "call",
          strike, expiry, qty, premium: prem,
          entryDTE,
          ...(entryDelta > 0 ? { entryDelta } : {}),
          ...(linkedCspId ? { linkedCspId } : {}),
          underlyingAtEntry: optSpot(sym) || null,
          entryDate: new Date().toISOString().slice(0, 10), status: "open",
        });
      }
      saveToStorage();
      modal.style.display = "none";
      renderOptions();
    };
    modal.querySelector("#opts-cancel-btn").onclick = () => { modal.style.display = "none"; };
  }

  // ── Buy-to-close / roll ───────────────────────────────────────────────────
  function openOptionsCloseModal(pos, isRoll) {
    const modal = _optModalMode("close");
    if (!modal) return;
    modal.querySelector(".opts-modal-title").textContent =
      `${isRoll ? "滚仓 — 先买回" : "平仓买回"} · ${pos.sym} ${pos.strike}${pos.type === "call" ? "C" : "P"}`;
    modal.querySelector("#opts-modal-meta").textContent =
      `卖出价 $${pos.premium.toFixed(2)}/share ×${pos.qty}张 · 到券商App查买回价格${isRoll ? "，确认后直接开新仓" : ""}`;
    const premLabel = modal.querySelector("#opts-row-premium label");
    if (premLabel) premLabel.textContent = "买回价格 ($/share)";
    const premEl = modal.querySelector("#opts-premium");
    premEl.placeholder = "从券商填写买回价";
    premEl.value = pos.manualMark != null ? pos.manualMark.toFixed(2) : "";
    const closeDateEl = modal.querySelector("#opts-close-date");
    if (closeDateEl) closeDateEl.value = new Date().toISOString().slice(0, 10);
    const calcEl = modal.querySelector("#opts-calc");
    const recalc = () => {
      const buyBack = parseFloat(premEl.value);
      if (isNaN(buyBack)) { calcEl.innerHTML = `<div><span class="muted">填写买回价格计算实现盈亏</span></div>`; return; }
      const perShare = pos.premium - buyBack;
      const pnl = perShare * 100 * pos.qty;
      calcEl.innerHTML = [
        `<div><span>卖出价</span><b>$${pos.premium.toFixed(2)}/share</b></div>`,
        `<div><span>买回价</span><b>$${buyBack.toFixed(2)}/share</b></div>`,
        `<div><span>每股盈亏</span><b class="${perShare >= 0 ? "up" : "down"}">${perShare >= 0 ? "+" : "−"}$${Math.abs(perShare).toFixed(2)}</b></div>`,
        `<div><span>总计盈亏</span><b class="${pnl >= 0 ? "up" : "down"}">${pnl >= 0 ? "+" : "−"}${fmt.usd(Math.abs(pnl))}</b></div>`,
      ].join("");
    };
    premEl.oninput = recalc;
    recalc();
    modal.style.display = "flex";
    modal.querySelector("#opts-confirm-btn").onclick = () => {
      const buyBack = parseFloat(premEl.value);
      if (isNaN(buyBack) || buyBack < 0) { alert("请填写买回价格"); return; }
      pos.status = "closed";
      pos.closePremium = buyBack;
      pos.realized = (pos.premium - buyBack) * 100 * pos.qty;
      pos.closedAt = (closeDateEl && closeDateEl.value) || new Date().toISOString().slice(0, 10);
      saveToStorage();
      modal.style.display = "none";
      if (isRoll) openOptionsSellModal({ sym: pos.sym, strat: pos.strat, qty: pos.qty, linkedCspId: pos.linkedCspId });
      else renderSimOptions();
    };
    modal.querySelector("#opts-cancel-btn").onclick = () => { modal.style.display = "none"; };
  }

  // ── Activate pending pre-order by recording actual fill price ───────────────
  function openOptionsFillModal(pos) {
    const modal = _optModalMode("close"); // reuse close mode (shows premium + date fields)
    if (!modal) return;
    modal.querySelector(".opts-modal-title").textContent = `记录成交 · ${pos.sym} $${pos.strike}${pos.type === "call" ? "C" : "P"}`;
    const hasTarget = pos.targetPremium != null && pos.targetPremium > 0;
    modal.querySelector("#opts-modal-meta").textContent = hasTarget
      ? `目标权利金 ≥$${pos.targetPremium.toFixed(2)}/share · 填写实际成交价激活仓位`
      : "填写实际成交权利金激活仓位";
    const premLabel = modal.querySelector("#opts-row-premium label");
    if (premLabel) premLabel.textContent = "实际成交价 ($/share)";
    const premEl = modal.querySelector("#opts-premium");
    premEl.placeholder = "按券商实际成交价填写";
    premEl.value = hasTarget ? pos.targetPremium.toFixed(2) : "";
    const closeDateLabel = modal.querySelector("#opts-row-close-date label");
    if (closeDateLabel) closeDateLabel.textContent = "成交日期";
    const closeDateEl = modal.querySelector("#opts-close-date");
    if (closeDateEl) closeDateEl.value = new Date().toISOString().slice(0, 10);
    const calcEl = modal.querySelector("#opts-calc");
    const spot = optSpot(pos.sym);
    const isCSP = pos.strat === "csp";
    const recalc = () => {
      const fillPrice = parseFloat(premEl.value);
      const lines = [];
      if (spot) lines.push(`<div><span>${pos.sym} 现价</span><b>$${spot.toFixed(2)}</b></div>`);
      if (!isNaN(fillPrice) && fillPrice > 0) {
        lines.push(`<div><span>权利金收入</span><b class="up">+${fmt.usd(fillPrice * 100 * pos.qty)}</b></div>`);
        if (hasTarget) {
          const diff = fillPrice - pos.targetPremium;
          lines.push(`<div><span>vs 目标</span><b class="${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "+" : ""}$${diff.toFixed(2)}/share</b></div>`);
        }
        const dte = pos.expiry ? _optDTE(pos.expiry) : 0;
        if (isCSP && pos.strike > 0 && dte > 0) {
          lines.push(`<div><span>年化收益</span><b class="up">${(fillPrice / pos.strike / dte * 365 * 100).toFixed(1)}%</b></div>`);
        }
      }
      calcEl.innerHTML = lines.join("") || `<div><span class="muted">填写成交价查看收益</span></div>`;
    };
    premEl.oninput = recalc;
    recalc();
    modal.style.display = "flex";
    modal.querySelector("#opts-confirm-btn").onclick = () => {
      const fillPrice = parseFloat(premEl.value);
      if (isNaN(fillPrice) || fillPrice <= 0) { alert("请填写实际成交价格"); return; }
      pos.premium = fillPrice;
      pos.status = "open";
      pos.openedAt = (closeDateEl && closeDateEl.value) || new Date().toISOString().slice(0, 10);
      pos.entryDate = pos.openedAt;
      pos.entryDTE = pos.expiry ? _optDTE(pos.expiry) : null;
      pos.underlyingAtEntry = spot || null;
      // Auto-link to assigned CSP for the same symbol if not already linked
      if (!pos.linkedCspId && pos.strat === "cc") {
        const optArr = _activeOpts();
        const parentCsp = optArr.find(p =>
          p.sym === pos.sym && p.strat === "csp" && p.status === "assigned" && !p.assignedStockSold
        );
        if (parentCsp) pos.linkedCspId = parentCsp.id;
      }
      saveToStorage();
      modal.style.display = "none";
      renderSimOptions();
    };
    modal.querySelector("#opts-cancel-btn").onclick = () => { modal.style.display = "none"; };
  }

  // ── Manual mark update (broker's current premium → floating P&L) ──────────
  function openOptionsMarkModal(pos) {
    const modal = _optModalMode("mark");
    if (!modal) return;
    modal.querySelector(".opts-modal-title").textContent =
      `记录浮盈 · ${pos.sym} ${pos.strike}${pos.type === "call" ? "C" : "P"}`;
    modal.querySelector("#opts-modal-meta").textContent =
      `卖出价 $${pos.premium.toFixed(2)}/share · 打开券商App查看当前期权价格（Mark），填入后自动计算浮盈`;
    const premLabel = modal.querySelector("#opts-row-premium label");
    if (premLabel) premLabel.textContent = "当前期权价 (Mark)";
    const premEl = modal.querySelector("#opts-premium");
    premEl.placeholder = "从券商App抄当前权利金";
    premEl.value = pos.manualMark != null ? pos.manualMark.toFixed(2) : "";
    const calcEl = modal.querySelector("#opts-calc");
    const recalc = () => {
      const prem = parseFloat(premEl.value);
      if (isNaN(prem)) { calcEl.innerHTML = ""; return; }
      const float_ = (pos.premium - prem) * 100 * pos.qty;
      calcEl.innerHTML = `<div><span>浮动盈亏</span><b class="${float_ >= 0 ? "up" : "down"}">${float_ >= 0 ? "+" : "−"}$${Math.abs(float_).toFixed(0)}</b></div>`;
    };
    premEl.oninput = recalc;
    recalc();
    modal.style.display = "flex";
    modal.querySelector("#opts-confirm-btn").onclick = () => {
      const prem = parseFloat(premEl.value);
      if (isNaN(prem) || prem < 0) { alert("请填写当前期权价格 (Mark)"); return; }
      pos.manualMark = prem;
      pos.manualMarkAt = new Date().toISOString().slice(0, 10);
      saveToStorage();
      modal.style.display = "none";
      renderSimOptions();
    };
    modal.querySelector("#opts-cancel-btn").onclick = () => { modal.style.display = "none"; };
  }
  // ── CSP-assigned stock exit (record when you sell the held shares) ────────
  function openAssignedExitModal(pos) {
    const modal = _optModalMode("exit");
    if (!modal) return;
    const spot = optSpot(pos.sym);
    const stockShares = pos.qty * 100;
    const premIncome = pos.premium * 100 * pos.qty;
    modal.querySelector(".opts-modal-title").textContent = `记录出仓 · ${pos.sym} 正股`;
    modal.querySelector("#opts-modal-meta").textContent =
      `持有 ${stockShares} 股 @ $${pos.strike.toFixed(2)} (CSP指派) · 期权收入 +${fmt.usd(premIncome)}`;
    const exitEl = modal.querySelector("#opts-exit-price");
    exitEl.value = spot ? spot.toFixed(2) : "";
    const calcEl = modal.querySelector("#opts-calc");
    const recalc = () => {
      const exitPrice = parseFloat(exitEl.value);
      if (isNaN(exitPrice) || exitPrice <= 0) { calcEl.innerHTML = ""; return; }
      const equityPnl = (exitPrice - pos.strike) * stockShares;
      const equityCls = equityPnl >= 0 ? "up" : "down";
      const total = premIncome + equityPnl;
      const totalCls = total >= 0 ? "up" : "down";
      calcEl.innerHTML = [
        `<div><span>${pos.sym} 出仓价</span><b>$${exitPrice.toFixed(2)}</b></div>`,
        `<div><span>正股盈亏</span><b class="${equityCls}">${equityPnl >= 0 ? "+" : "−"}${fmt.usd(Math.abs(equityPnl))}</b></div>`,
        `<div><span>期权收入</span><b class="up">+${fmt.usd(premIncome)}</b></div>`,
        `<div style="border-top:1px solid var(--line);padding-top:5px;margin-top:3px"><span>合计 P&L</span><b class="${totalCls}">${total >= 0 ? "+" : "−"}${fmt.usd(Math.abs(total))}</b></div>`,
      ].join("");
    };
    exitEl.oninput = recalc;
    recalc();
    modal.style.display = "flex";
    modal.querySelector("#opts-confirm-btn").onclick = () => {
      const exitPrice = parseFloat(exitEl.value);
      if (isNaN(exitPrice) || exitPrice <= 0) { alert("请填写出仓价"); return; }
      pos.assignedStockSold = true;
      pos.assignedExitPrice = exitPrice;
      pos.assignedExitDate = new Date().toISOString().slice(0, 10);
      pos.realized = (pos.premium + exitPrice - pos.strike) * 100 * pos.qty;
      saveToStorage();
      modal.style.display = "none";
      renderSimOptions();
    };
    modal.querySelector("#opts-cancel-btn").onclick = () => { modal.style.display = "none"; };
  }
  // ─────────────────────────────────────────────────────────────────────────

  function renderSimPending() {
    const section = $("#sim-pending-section");
    const list    = $("#sim-pending-list");
    if (!section || !list) return;
    const hasAny = SIM_PENDING.length || SIM_CLOSE_PENDING.length;
    if (!hasAny) { section.style.display = "none"; return; }
    section.style.display = "";

    const mktOpen = isUSMarketOpen();
    const hdr = $("#sim-pending-header");
    if (hdr) {
      hdr.innerHTML = `挂单队列 · Pending Orders ${mktOpen
        ? `<span class="pending-mkt-badge open">开盘中</span>`
        : `<span class="pending-mkt-badge closed">休市</span>`}
        <button id="pending-refresh-btn" title="立即检查" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--fg-3);font-size:14px;padding:2px 6px;line-height:1;" onmouseenter="this.style.color='var(--accent)'" onmouseleave="this.style.color='var(--fg-3)'">↻</button>`;
      const rb = document.getElementById("pending-refresh-btn");
      if (rb) rb.addEventListener("click", () => { lastPriceFetch = 0; fetchPrices(); });
    }
    const mktBadge = mktOpen
      ? `<span class="pending-mkt-badge open">开盘中</span>`
      : `<span class="pending-mkt-badge closed">休市</span>`;

    const openCards = SIM_PENDING.map(order => {
      const typeLabel = order.orderType === "market" ? "市价单" : "限价单";
      const typeCls   = order.orderType === "market" ? "market" : "limit";
      const priceHint = order.orderType === "limit"
        ? `限价 $${order.limitPrice?.toFixed(2)} · `
        : mktOpen ? "等待成交 · " : "等待开盘 · ";
      const stopTarget = order.stop && order.target
        ? `止损 $${order.stop} / 止盈 $${order.target}` : "";
      return `
        <div class="pending-order-card" data-pending-id="${order.id}">
          <span class="pending-order-badge ${typeCls}">${typeLabel}</span>
          <span class="pending-order-sym">${order.sym}</span>
          <span class="pending-order-detail">${priceHint}${order.qty}股 ${stopTarget}</span>
          <button class="pending-order-cancel" data-cancel-id="${order.id}" data-cancel-type="open" title="取消挂单">✕</button>
        </div>`;
    });

    const closeCards = SIM_CLOSE_PENDING.map(order => {
      const typeLabel = order.orderType === "market" ? "市价单" : "限价单";
      const typeCls   = order.orderType === "market" ? "market" : "limit";
      const priceHint = order.orderType === "limit"
        ? `限价 ≥$${order.limitPrice?.toFixed(2)} · `
        : "下次更新自动成交 · ";
      return `
        <div class="pending-order-card" data-pending-id="${order.id}">
          <span class="pending-order-badge close-order">平仓</span>
          <span class="pending-order-badge ${typeCls}" style="margin-left:2px">${typeLabel}</span>
          <span class="pending-order-sym">${order.sym}</span>
          <span class="pending-order-detail">${priceHint}${order.qty}股</span>
          <button class="pending-order-cancel" data-cancel-id="${order.id}" data-cancel-type="close" title="取消平仓挂单">✕</button>
        </div>`;
    });

    list.innerHTML = [...openCards, ...closeCards].join("");

    list.querySelectorAll(".pending-order-cancel").forEach(btn => {
      btn.addEventListener("click", () => {
        const id   = btn.dataset.cancelId;
        const type = btn.dataset.cancelType;
        if (type === "close") {
          const idx = SIM_CLOSE_PENDING.findIndex(p => p.id === id);
          if (idx !== -1) { SIM_CLOSE_PENDING.splice(idx, 1); saveToStorage(); renderSimPending(); }
        } else {
          const idx = SIM_PENDING.findIndex(p => p.id === id);
          if (idx !== -1) { SIM_PENDING.splice(idx, 1); saveToStorage(); renderSimPending(); }
        }
      });
    });
  }

  function renderSimAnalytics() {
    const section     = $("#sim-analytics-section");
    const overviewLbl = $("#sim-analytics-label");
    const reviewLbl   = $("#sim-review-label");
    if (!section) return;
    const hasAny = SIM_HOLDINGS.length > 0 || SIM_CLOSED.length > 0;
    if (overviewLbl) overviewLbl.style.display = hasAny ? "" : "none";
    if (!SIM_CLOSED.length) {
      section.style.display = "none";
      if (reviewLbl) reviewLbl.style.display = "none";
      return;
    }
    section.style.display = "";
    if (reviewLbl) reviewLbl.style.display = "";

    const wins   = SIM_CLOSED.filter(h => (h.pnlFinal || 0) > 0);
    const losses = SIM_CLOSED.filter(h => (h.pnlFinal || 0) <= 0);
    const winSum  = wins.reduce((s, h) => s + (h.pnlFinal || 0), 0);
    const lossSum = Math.abs(losses.reduce((s, h) => s + (h.pnlFinal || 0), 0));
    const pf      = lossSum > 0 ? (winSum / lossSum).toFixed(2) : "∞";
    const pfCls   = parseFloat(pf) >= 1 ? "up" : "down";

    const avgWin    = wins.length   ? winSum / wins.length   : 0;
    const avgLoss   = losses.length ? lossSum / losses.length : 0;
    const avgWinPct = wins.length
      ? (wins.reduce((s, h) => s + (h.pnlFinal || 0) / Math.max(h.cost * h.qty, 1), 0) / wins.length * 100).toFixed(1)
      : "0.0";
    const avgLossPct = losses.length
      ? (losses.reduce((s, h) => s + Math.abs(h.pnlFinal || 0) / Math.max(h.cost * h.qty, 1), 0) / losses.length * 100).toFixed(1)
      : "0.0";

    const avgDays = Math.round(
      SIM_CLOSED.reduce((s, h) => s + calcTradingDays(h.entry, h.closedAt), 0) / SIM_CLOSED.length
    );
    const avgWinDays  = wins.length   ? Math.round(wins.reduce((s, h)   => s + calcTradingDays(h.entry, h.closedAt), 0) / wins.length)   : 0;
    const avgLossDays = losses.length ? Math.round(losses.reduce((s, h) => s + calcTradingDays(h.entry, h.closedAt), 0) / losses.length) : 0;

    const sorted = [...SIM_CLOSED].sort((a, b) => (b.pnlFinal || 0) - (a.pnlFinal || 0));
    const maxAbs = Math.max(...sorted.map(h => Math.abs(h.pnlFinal || 0)), 1);

    const rows = sorted.map(h => {
      const pnl  = h.pnlFinal || 0;
      const days = calcTradingDays(h.entry, h.closedAt);
      const cost = Math.max(h.cost * h.qty, 1);
      const pct  = (pnl / cost * 100).toFixed(1);
      const cls  = pnl >= 0 ? "up" : "down";
      const barW = Math.round(Math.abs(pnl) / maxAbs * 64);
      const barC = pnl >= 0 ? "var(--up)" : "var(--down)";
      return `
        <div class="sim-atrade">
          <span class="sim-atrade-sym">${h.sym}</span>
          <span class="sim-atrade-days">${days}d</span>
          <span class="sim-atrade-pnl ${cls}">${fmt.signed(Math.round(pnl))}</span>
          <span class="sim-atrade-pct ${cls}">${pnl >= 0 ? "+" : ""}${pct}%</span>
          <span class="sim-atrade-bar"><span style="display:inline-block;width:${barW}px;height:3px;background:${barC};border-radius:2px;vertical-align:middle"></span></span>
        </div>`;
    }).join("");

    if (reviewLbl) reviewLbl.innerHTML = `
      <span class="ssl-zh">分析复盘</span>
      <span class="ssl-en">Analytics</span>
      <span class="ssl-rule"></span>
      <span class="ssl-meta">${SIM_CLOSED.length} 笔已平仓</span>`;

    section.innerHTML = `
      <div class="sim-a-stats">
        <div class="sim-astat">
          <div class="sim-astat-label">平均盈利</div>
          <div class="sim-astat-value up">${wins.length ? fmt.signed(Math.round(avgWin)) : "—"}</div>
          <div class="sim-astat-sub up">${wins.length ? "+" + avgWinPct + "%" : "暂无盈利"}</div>
        </div>
        <div class="sim-astat">
          <div class="sim-astat-label">平均亏损</div>
          <div class="sim-astat-value down">${losses.length ? "−$" + Math.round(avgLoss).toLocaleString("en-US") : "—"}</div>
          <div class="sim-astat-sub down">${losses.length ? "−" + avgLossPct + "%" : "暂无亏损"}</div>
        </div>
        <div class="sim-astat">
          <div class="sim-astat-label">盈利因子</div>
          <div class="sim-astat-value ${pfCls}">${pf}×</div>
          <div class="sim-astat-sub">${lossSum > 0 ? "总盈 / 总亏" : "暂无亏损"}</div>
        </div>
        <div class="sim-astat">
          <div class="sim-astat-label">平均持仓</div>
          <div class="sim-astat-value">${avgDays}d</div>
          <div class="sim-astat-sub">${wins.length ? `盈利 ${avgWinDays}d` : ""}${wins.length && losses.length ? " · " : ""}${losses.length ? `亏损 ${avgLossDays}d` : ""}</div>
        </div>
      </div>`;
  }

  function renderSimEvents() {
    const section = $("#sim-earnings-section");
    const el = $("#sim-events");
    if (!section || !el) return;

    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + 30);
    const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const MO = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    const entries = SIM_HOLDINGS
      .filter(h => h.earnings)
      .map(h => ({ h, date: (() => { const d = new Date(h.earnings); d.setHours(0,0,0,0); return d; })() }))
      .filter(({ date }) => date >= today && date <= cutoff)
      .sort((a, b) => a.date - b.date);

    if (!entries.length) {
      section.style.display = "none";
      return;
    }
    section.style.display = "";

    el.innerHTML = entries.map(({ h, date }) => {
      const days = Math.round((date - today) / 86400000);
      const urgColor  = days <= 2 ? "var(--down)" : days <= 6 ? "var(--warn)" : "var(--fg-2)";
      const daysLabel = days === 0 ? "今天" : days === 1 ? "明天" : `${days}天后`;
      return `
        <div class="event">
          <div class="when"><span class="d">${String(date.getDate()).padStart(2,"0")}</span>${MO[date.getMonth()]} · ${WD[date.getDay()]}</div>
          <div class="evt-sym-col"><span class="sym">${h.sym}</span></div>
          <div class="evt-days" style="color:${urgColor}">${daysLabel}</div>
        </div>`;
    }).join("");
  }

  function renderSimDailySources() {
    const el = $("#sim-daily-sources");
    const label = $("#sim-daily-sources-label");
    if (!el) return;
    const rows = SIM_HOLDINGS
      .map(h => {
        const today = todayPnlOf(h);
        const todayPct = computeChangePct(h) ?? 0;
        return { sym: h.sym, name: h.name, today, todayPct };
      })
      .sort((a, b) => b.today - a.today);
    if (label) label.style.display = SIM_HOLDINGS.length ? "" : "none";
    if (!SIM_HOLDINGS.length) { el.innerHTML = ""; return; }

    const total = rows.reduce((s, r) => s + r.today, 0);
    const wins  = rows.filter(r => r.today > 0).length;
    const loses = rows.filter(r => r.today < 0).length;
    const tSign = total > 0 ? "up" : total < 0 ? "down" : "";
    const hasSimLoaded = SIM_HOLDINGS.some(h => h.prevClose > 0);
    const tStr  = !hasSimLoaded ? "行情加载中…" : total === 0 ? "±$0" : (total > 0 ? "+" : "−") + "$" + Math.abs(total).toLocaleString("en-US");
    const metaEl = $("#sim-daily-sources-meta");
    if (metaEl) metaEl.innerHTML = `<span class="ssl-total ${tSign}">${tStr}</span>${hasSimLoaded ? ` · ${wins}↑ ${loses}↓` : ""}`;

    const maxAbs = Math.max(...rows.map(r => Math.abs(r.today)), 1);
    el.innerHTML = `<div class="panel" style="padding:0;overflow:hidden">` +
      rows.map(r => {
        const sign = r.today > 0 ? "up" : r.today < 0 ? "down" : "neu";
        const barW = Math.round(Math.abs(r.today) / maxAbs * 100);
        const amtStr = r.today === 0 ? "±$0" : (r.today > 0 ? "+" : "−") + "$" + Math.abs(r.today).toLocaleString("en-US");
        const pctStr = (r.todayPct >= 0 ? "+" : "") + r.todayPct.toFixed(2) + "%";
        return `<div class="ds-row">
          <div><div class="ds-sym">${r.sym}</div><div class="ds-name">${r.name}</div></div>
          <div class="ds-bar-track"><div class="ds-bar-fill ${sign}" style="width:${barW}%"></div></div>
          <div class="ds-val-cell"><div class="ds-amt ${sign}">${amtStr}</div><div class="ds-pct ${sign}">${pctStr}</div></div>
        </div>`;
      }).join("") + `</div>`;
  }

  function renderSimOverview() {
    const el = $("#sim-overview");
    if (!el) return;
    const hasAny = SIM_HOLDINGS.length > 0 || SIM_CLOSED.length > 0;
    el.style.display = hasAny ? "" : "none";
    const label = $("#sim-analytics-label");
    if (label) label.style.display = hasAny ? "" : "none";
    const pnl = SIM_HOLDINGS.reduce((s, h) => s + (h.pnlDollar || 0), 0);
    const open = SIM_HOLDINGS.length;
    const closedTotal = SIM_CLOSED.length;
    const wins = SIM_CLOSED.filter(h => (h.pnlFinal || 0) > 0).length;
    const realizedPnl = SIM_CLOSED.reduce((s, h) => s + (h.pnlFinal || 0), 0);
    const winRate = closedTotal > 0 ? (wins / closedTotal * 100).toFixed(0) + "%" : "—";
    const nav = simNotional + pnl + realizedPnl;
    const navSign = fmt.sign(pnl);
    const openWins   = SIM_HOLDINGS.filter(h => (h.pnlDollar || 0) > 0);
    const openLosses = SIM_HOLDINGS.filter(h => (h.pnlDollar || 0) <= 0 && SIM_HOLDINGS.length > 0);
    const avgOpenWinPct  = openWins.length   ? (openWins.reduce((s, h) => s + (h.pnlPct || 0), 0) / openWins.length * 100).toFixed(1) : null;
    const avgOpenLossPct = openLosses.length ? (openLosses.reduce((s, h) => s + Math.abs(h.pnlPct || 0), 0) / openLosses.length * 100).toFixed(1) : null;
    const floatSubParts = [];
    if (avgOpenWinPct !== null)  floatSubParts.push(`<span class="up">盈均+${avgOpenWinPct}%</span>`);
    if (avgOpenLossPct !== null) floatSubParts.push(`<span class="down">亏均−${avgOpenLossPct}%</span>`);
    const floatSub = floatSubParts.length ? floatSubParts.join(" · ") + ` · ${open}笔` : `${open} 笔持仓中`;
    el.innerHTML = `
      <div class="sim-card">
        <div class="sim-card-label" style="display:flex;justify-content:space-between;align-items:center">
          模拟本金
          <button class="sim-notional-edit-btn" title="编辑模拟本金" style="all:unset;cursor:pointer;color:var(--fg-3);display:inline-flex;align-items:center;border-radius:4px;padding:2px">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
        <div class="sim-card-value ${pnl + realizedPnl >= 0 ? 'up' : 'down'}">${fmt.usd(Math.round(nav))}</div>
        <div class="sim-card-sub">基准 ${fmt.usd(simNotional)}${pnl !== 0 ? ` <span class="${fmt.sign(pnl)}" style="font-size:10px">${fmt.signed(Math.round(pnl))} 浮</span>` : ""}${realizedPnl !== 0 ? ` <span class="${fmt.sign(realizedPnl)}" style="font-size:10px">${fmt.signed(Math.round(realizedPnl))} 已</span>` : ""}</div>
      </div>
      <div class="sim-card">
        <div class="sim-card-label">模拟浮盈亏</div>
        <div class="sim-card-value ${navSign}">${fmt.signed(Math.round(pnl))}</div>
        <div class="sim-card-sub">${floatSub}</div>
      </div>
      <div class="sim-card">
        <div class="sim-card-label">已实现盈亏</div>
        <div class="sim-card-value ${fmt.sign(realizedPnl)}">${closedTotal ? fmt.signed(Math.round(realizedPnl)) : "—"}</div>
        <div class="sim-card-sub">${closedTotal} 笔已平仓</div>
      </div>
      <div class="sim-card">
        <div class="sim-card-label">模拟胜率</div>
        <div class="sim-card-value ${wins >= closedTotal / 2 ? 'up' : closedTotal ? 'down' : 'neu'}">${winRate}</div>
        <div class="sim-card-sub">${closedTotal ? `${wins}胜 / ${closedTotal - wins}负` : "暂无数据"}</div>
      </div>`;


    // Update subtitle
    const sub = $("#sim-subtitle");
    if (sub) sub.textContent = `${open} 笔持仓 · ${closedTotal} 笔已平仓`;
    renderSimDailySources();
  }

  function renderSimTable() {
    renderSimEvents();
    const thead = $("#sim-thead-row");
    const tbody = $("#sim-tbody");
    if (!thead || !tbody) return;

    const data = simActiveTab === "open" ? SIM_HOLDINGS : SIM_CLOSED;

    // Header
    thead.innerHTML = COLS.filter(c => c.on && !(simActiveTab === "closed" && c.closedHide)).map(c => {
      const sorted = simSortKey === c.id ? "sorted" : "";
      const label = (simActiveTab === "closed" && c.id === "last") ? "平仓价"
                  : (simActiveTab === "closed" && c.id === "pnl")  ? "盈亏"
                  : c.label;
      return `<th class="${c.r ? "right" : ""} ${sorted}" data-simcol="${c.id}">${label}</th>`;
    }).join("");
    $$("[data-simcol]", thead).forEach(th => th.addEventListener("click", () => {
      const col = th.dataset.simcol;
      if (simSortKey === col) simSortDir *= -1; else { simSortKey = col; simSortDir = -1; }
      renderSimTable();
    }));

    // Filter + sort
    let rows = data.filter(h => {
      if (simActiveTab === "closed") {
        const pnl = h.pnlFinal ?? h.pnlDollar ?? 0;
        if (simClosedFilter === "profit" && pnl <= 0) return false;
        if (simClosedFilter === "loss"   && pnl >= 0) return false;
        if (simClosedFilter === "even"   && pnl !== 0) return false;
      } else {
        if (simFilter === "equity" && h.kind !== "equity") return false;
        if (simFilter === "etf"    && h.kind !== "etf") return false;
        if (simFilter === "crypto" && h.kind !== "crypto") return false;
        if (simFilter === "risk"   && !["Pullback", "Near Stop"].includes(progressBucket(h))) return false;
        if (simFilter === "target" && progressBucket(h) !== "Near Target") return false;
        if (simFilter === "watch"  && !h.flagged) return false;
      }
      if (simQuery) {
        const q = simQuery.toLowerCase();
        if (!(h.sym.toLowerCase().includes(q) || (h.name || "").toLowerCase().includes(q))) return false;
      }
      return true;
    });

    const keyFn = {
      tk: h => h.sym, bxbars: h => h.bx?.dailyBars, cost: h => h.cost, last: h => h.last,
      qty: h => h.qty, pnl: h => h.pnlDollar, stop: h => h.stop, target: h => h.target,
      progstatus: h => progressBucket(h),
    }[simSortKey] || (h => h.pnlDollar);
    rows.sort((a, b) => {
      const va = keyFn(a), vb = keyFn(b);
      return va < vb ? -simSortDir : va > vb ? simSortDir : 0;
    });

    // Toggle icon
    const _svtBtn = document.getElementById("sim-holdings-view-toggle");
    if (_svtBtn) {
      _svtBtn.title = simHoldingsViewMode === "card" ? "切换为列表视图" : "切换为卡片视图";
      _svtBtn.innerHTML = simHoldingsViewMode === "card"
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>`;
    }

    // Counts — run before card/list branch so card mode also updates chips
    const setCount = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setCount("sim-c-open",   SIM_HOLDINGS.length);
    setCount("sim-c-closed", SIM_CLOSED.length);
    if (simActiveTab === "closed") {
      setCount("sim-c-cl-all",    SIM_CLOSED.length);
      setCount("sim-c-cl-profit", SIM_CLOSED.filter(h => (h.pnlFinal ?? h.pnlDollar ?? 0) > 0).length);
      setCount("sim-c-cl-loss",   SIM_CLOSED.filter(h => (h.pnlFinal ?? h.pnlDollar ?? 0) < 0).length);
      setCount("sim-c-cl-even",   SIM_CLOSED.filter(h => (h.pnlFinal ?? h.pnlDollar ?? 0) === 0).length);
    } else {
      setCount("sim-c-all",   SIM_HOLDINGS.length);
      setCount("sim-c-eq",    SIM_HOLDINGS.filter(h => h.kind === "equity").length);
      setCount("sim-c-etf",   SIM_HOLDINGS.filter(h => h.kind === "etf").length);
      setCount("sim-c-cr",    SIM_HOLDINGS.filter(h => h.kind === "crypto").length);
      setCount("sim-c-rk",    SIM_HOLDINGS.filter(h => ["Pullback","Near Stop"].includes(progressBucket(h))).length);
      setCount("sim-c-tg",    SIM_HOLDINGS.filter(h => progressBucket(h) === "Near Target").length);
      setCount("sim-c-watch", SIM_HOLDINGS.filter(h => h.flagged).length);
    }

    // Card / list branch
    const _stw = tbody.parentElement;
    const _shc = document.getElementById("sim-holdings-cards");
    if (simHoldingsViewMode === "card") {
      if (_stw) _stw.style.display = "none";
      if (_shc) _shc.style.display = "flex";
      renderSimHoldingsCards(rows);
      renderSimTradeLog();
      return;
    }
    if (_stw) _stw.style.display = "";
    if (_shc) _shc.style.display = "none";

    // Body
    const cols = COLS.filter(c => c.on && !(simActiveTab === "closed" && c.closedHide));
    const colSpan = cols.length + 1;

    const makeRow = (h, idx) => {
      const isSel = simSelectedSym === h.sym ? "selected" : "";
      const cells = cols.map(c => renderCell(h, c.id)).join("");
      const flagCls = h.flagged ? "flagged" : "";
      const actions = simActiveTab === "open"
        ? `<td style="width:72px;padding:6px 4px"><div class="row-actions">
             <button class="sim-flag-btn ${flagCls}" data-sym="${h.sym}" title="候选标记"><svg width="9" height="9" viewBox="0 0 24 24" fill="${h.flagged ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>
             <button class="close-pos-btn" data-sym="${h.sym}" title="平仓"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></button>
             <button class="delete-btn" data-sym="${h.sym}" title="删除"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
           </div></td>`
        : `<td style="width:60px;padding:6px 4px"><div class="row-actions">
             <button class="sim-restore-btn" data-sym="${h.sym}" title="撤回至持仓"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>
             <button class="delete-btn" data-sym="${h.sym}" data-from="closed" title="删除"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
           </div></td>`;
      const flaggedCls = h.flagged ? "sim-flagged" : "";
      return `<tr class="${isSel} ${flaggedCls}" data-sym="${h.sym}" data-idx="${idx}">${cells}${actions}</tr>`;
    };

    if (simActiveTab === "open") {
      const groups = {};
      rows.forEach(h => {
        const d = h.entry?.slice(0, 10) || "—";
        (groups[d] = groups[d] || []).push(h);
      });
      const thisYear = new Date().getFullYear();
      tbody.innerHTML = Object.keys(groups)
        .sort((a, b) => b.localeCompare(a))
        .map(date => {
          const dt = date !== "—" ? new Date(date + "T00:00:00") : null;
          const label = dt
            ? dt.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(dt.getFullYear() !== thisYear && { year: "numeric" }) })
            : "—";
          const hdr = `<tr class="date-group-hdr"><td colspan="${colSpan}">${label}</td></tr>`;
          return hdr + groups[date].map(h => makeRow(h, rows.indexOf(h))).join("");
        }).join("");
    } else {
      const prevTab = activeTab;
      activeTab = "closed";
      tbody.innerHTML = rows.map((h, i) => makeRow(h, i)).join("");
      activeTab = prevTab;
    }

    $$("tr[data-idx]", tbody).forEach(tr => {
      tr.addEventListener("click", e => {
        if (e.target.closest(".close-pos-btn, .delete-btn, .sim-restore-btn, .sim-flag-btn")) return;
        openSimDrawer(rows[parseInt(tr.dataset.idx)], simActiveTab);
      });
    });
    $$(".sim-flag-btn", tbody).forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const h = SIM_HOLDINGS.find(x => x.sym === btn.dataset.sym);
        if (!h) return;
        h.flagged = !h.flagged;
        saveToStorage();
        renderSimTable();
      });
    });
    $$(".close-pos-btn", tbody).forEach(btn => {
      btn.addEventListener("click", e => { e.stopPropagation(); openCloseModal(btn.dataset.sym); });
    });
    $$(".delete-btn", tbody).forEach(btn => {
      btn.addEventListener("click", e => { e.stopPropagation(); openDeleteModal(btn.dataset.sym, btn.dataset.from || "open"); });
    });
    $$(".sim-restore-btn", tbody).forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        simRestoreClosedPosition(btn.dataset.sym);
      });
    });

    renderSimTradeLog();
  }

  function renderSimTradeLog() {
    const labelEl = $("#sim-trade-log-label");
    const el      = $("#sim-trade-log");
    if (!el) return;

    const hasAny = SIM_HOLDINGS.length > 0 || SIM_CLOSED.length > 0;
    if (labelEl) {
      labelEl.style.display = hasAny ? "" : "none";
      const countEl = $("#sim-trade-log-count");
      if (countEl) countEl.textContent = (SIM_HOLDINGS.length + SIM_CLOSED.length) + " 笔";
    }
    if (!hasAny) { el.innerHTML = ""; return; }

    // Merge open + closed, sort by most-recent date descending
    const openEntries   = SIM_HOLDINGS.map(h => ({ h, isOpen: true,  date: h.entry || "", simClosedIdx: -1 }));
    const closedEntries = SIM_CLOSED.map((h, idx) => ({ h, isOpen: false, date: h.closedAt || h.entry || "", simClosedIdx: idx }));
    const sorted = [...openEntries, ...closedEntries].sort((a, b) => b.date.localeCompare(a.date));

    el.innerHTML = `<div class="panel" style="padding:0;overflow:hidden">` +
      sorted.map(({ h, isOpen, simClosedIdx }) => {
        if (isOpen) {
          const entryD  = h.entry?.slice(0, 10) || "—";
          const pnlDollar = h.pnlDollar ?? 0;
          const pnlCls    = pnlDollar >= 0 ? "up" : "down";
          const pnlPct    = h.pnlPct ?? 0;
          return `<div class="tl-row">
            <div>
              <div class="tl-sym">${h.sym}</div>
              <div class="tl-name">${h.name || ""}</div>
            </div>
            <div class="tl-mid">
              <div class="tl-prices">买入 $${h.cost?.toFixed(2)}<span class="tl-open-badge">持仓中</span></div>
              <div class="tl-dates">${entryD} · ${h.days ?? 0}天</div>
            </div>
            <div>
              <div class="tl-pnl ${pnlCls}">${fmt.signed(Math.round(pnlDollar))}</div>
              <div class="tl-pnl-pct ${pnlCls}">${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%</div>
            </div>
            <span></span>
          </div>`;
        } else {
          const pnl    = h.pnlFinal ?? 0;
          const pnlCls = pnl >= 0 ? "up" : "down";
          const pnlPct = h.cost > 0 ? ((h.closePrice - h.cost) / h.cost * 100) : null;
          const entryD = h.entry?.slice(0, 10) || "—";
          const closeD = h.closedAt?.slice(0, 10) || "—";
          return `<div class="tl-row">
            <div>
              <div class="tl-sym">${h.sym}</div>
              <div class="tl-name">${h.name || ""}</div>
            </div>
            <div class="tl-mid">
              <div class="tl-prices">$${h.cost?.toFixed(2)} → $${h.closePrice?.toFixed(2)}</div>
              <div class="tl-dates">${entryD} → ${closeD}${h.days ? " · " + h.days + "天" : ""}</div>
            </div>
            <div>
              <div class="tl-pnl ${pnlCls}">${fmt.signed(Math.round(pnl))}</div>
              <div class="tl-pnl-pct ${pnlCls}">${pnlPct !== null ? (pnlPct >= 0 ? "+" : "") + pnlPct.toFixed(1) + "%" : ""}</div>
            </div>
            <button class="tl-del" data-sim-closed-idx="${simClosedIdx}" title="删除">✕</button>
          </div>`;
        }
      }).join("") + `</div>`;

    el.onclick = e => {
      const btn = e.target.closest(".tl-del");
      if (!btn) return;
      e.stopPropagation();
      const idx = parseInt(btn.dataset.simClosedIdx);
      if (!isNaN(idx) && idx >= 0 && idx < SIM_CLOSED.length) {
        SIM_CLOSED.splice(idx, 1);
        saveToStorage();
        renderSimTradeLog();
        renderSimOverview();
      }
    };
  }

  function openSimDrawer(h, context) {
    if (!h) return;
    simSelectedSym = h.sym;
    renderSimTable();
    const isClosed = context === "closed";
    const prevTab = activeTab;
    activeTab = isClosed ? "closed" : "open";
    $("#drawer").innerHTML = drawerHTML(h, true);
    activeTab = prevTab;
    wireBX(h);
    if (!isClosed) {
      wireSimDrawerEdits(h);
      wireSimDrawerCloseButton();
      wireAddToPosition(h, SIM_HOLDINGS, simNotional, () => { renderSimTable(); renderSimOverview(); });
      wireCCRecords(h, true);
    } else {
      wireClosedDrawerEdits(h, true);
      wireDrawerRestoreButton(h, true);
    }
    wireExecRecordDeletes(h, true);
    wireDrawerSwipe(true);
    $("#drawer").classList.add("open");
    $("#backdrop").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
    _playDrawerSwipeAnim();
  }

  function closeSimDrawer() {
    simSelectedSym = null;
    $("#drawer").classList.remove("open");
    $("#backdrop").classList.remove("open");
    $("#drawer").setAttribute("aria-hidden", "true");
    renderSimTable();
  }

  function wireSimDrawerCloseButton() {
    const closeBtn = $("#drawer-close-position");
    if (!closeBtn) return;
    closeBtn.addEventListener("click", () => openCloseModal(simSelectedSym));
  }

  function wireSimDrawerEdits(h) {
    const dr = $("#drawer");
    $$("[data-pos-field]", dr).forEach(el => {
      el.addEventListener("focus", () => {
        el.textContent = el.textContent.replace(/^\$/, "");
        document.execCommand("selectAll", false, null);
      });
      el.addEventListener("blur", () => {
        const f = el.dataset.posField;
        const v = parseFloat(el.textContent.trim().replace(/[^0-9.-]/g, ""));
        if (isNaN(v) || v <= 0) { el.textContent = f === "size" ? h[f].toFixed(1) : `$${price(h[f])}`; return; }
        h[f] = v;
        recomputeHolding(h, simNotional);
        saveToStorage();
        renderSimTable(); renderSimOverview();
        el.textContent = f === "size" ? h[f].toFixed(1) : `$${price(h[f])}`;
        const pnlSign = fmt.sign(h.pnlDollar);
        const heroP = $(".hero-price .p", dr); const heroPct = $(".hero-price .pct", dr); const heroPnl = $(".hero-price .pnl", dr);
        if (heroP) heroP.textContent = `$${price(h.last)}`;
        if (heroPct) { heroPct.textContent = fmt.pct(h.pnlPct); heroPct.className = `pct ${pnlSign}`; }
        if (heroPnl) { heroPnl.textContent = fmt.signed(h.pnlDollar); heroPnl.className = `pnl ${pnlSign}`; }
        const heroR = $(".hero-price .hero-r", dr);
        if (heroR && h.rMult != null) { heroR.textContent = fmt.rMult(h.rMult); heroR.className = `hero-r ${fmt.sign(h.rMult)}`; }
        const lb = $(".levelbar", dr);
        if (lb) { const tmp = document.createElement("div"); tmp.innerHTML = levelBar(h); lb.replaceWith(tmp.firstElementChild); }
        const rCell = $(".kv-grid .v.big", dr);
        if (rCell) { rCell.textContent = fmt.rMult(h.rMult); rCell.className = `v big ${fmt.sign(h.rMult)}`; }
      });
      el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
    });
    // Journal note save (sim)
    $$("[data-pos-note]", dr).forEach(ta => {
      ta.addEventListener("input", () => { h.notes = ta.value; saveToStorage(); });
    });
  }

  function simDeletePosition(sym) {
    const idx = SIM_HOLDINGS.findIndex(h => h.sym === sym);
    if (idx === -1) return;
    SIM_HOLDINGS.splice(idx, 1);
    saveToStorage();
    if (simSelectedSym === sym) closeSimDrawer();
    renderSimTable(); renderSimOverview();
  }

  function simDeleteClosedPosition(sym) {
    const idx = SIM_CLOSED.findIndex(h => h.sym === sym);
    if (idx === -1) return;
    SIM_CLOSED.splice(idx, 1);
    saveToStorage();
    if (simSelectedSym === sym) closeSimDrawer();
    renderSimTable(); renderSimOverview();
  }

  function wireSimControls() {
    // Sim notional modal — event delegation survives re-renders
    document.addEventListener("click", e => {
      if (e.target.closest(".sim-notional-edit-btn")) {
        const inp = $("#sim-notional-input");
        if (inp) inp.value = simNotional;
        openModal("sim-notional-modal");
      }
    });
    $("#sim-notional-close")?.addEventListener("click", () => closeModal("sim-notional-modal"));
    $("#sim-notional-cancel")?.addEventListener("click", () => closeModal("sim-notional-modal"));
    $("#sim-notional-modal")?.addEventListener("click", e => { if (e.target === e.currentTarget) closeModal("sim-notional-modal"); });
    $("#sim-notional-form")?.addEventListener("submit", e => {
      e.preventDefault();
      const v = parseFloat($("#sim-notional-input").value);
      if (v > 0) { simNotional = v; saveToStorage(); renderSimOverview(); closeModal("sim-notional-modal"); }
    });

    const simNewBtn = $("#sim-new-pos-btn");
    if (simNewBtn) simNewBtn.addEventListener("click", () => {
      newPositionContext = "sim";
      const fd = $("#form-date"); if (fd) fd.value = new Date().toISOString().slice(0, 10);
      const fe = $("#form-earnings"); if (fe) fe.value = "";
      // Show order type selector for sim
      const orderRow = $("#form-order-type-row");
      if (orderRow) orderRow.style.display = "";
      const orderSeg = $("#form-order-seg");
      if (orderSeg) {
        $$("button", orderSeg).forEach(b => b.classList.toggle("active", b.dataset.order === "manual"));
      }
      const entryRow = $("#form-entry-row"), limitRow = $("#form-limit-row"), mHint = $("#form-market-hint-row");
      if (entryRow) entryRow.style.display = "";
      if (limitRow) limitRow.style.display = "none";
      if (mHint)    mHint.style.display    = "none";
      const ei = $("#form-entry"); if (ei) ei.required = true;
      openModal("new-position-modal");
    });

    const tabOpen   = $("#sim-tab-open");
    const tabClosed = $("#sim-tab-closed");
    // Set initial active state
    if (simActiveTab === "open") {
      tabOpen?.classList.add("active"); tabClosed?.classList.remove("active");
    } else {
      tabClosed?.classList.add("active"); tabOpen?.classList.remove("active");
    }
    if (tabOpen) tabOpen.addEventListener("click", () => {
      simActiveTab = "open"; simFilter = "all"; simClosedFilter = "all";
      tabOpen.classList.add("active"); if (tabClosed) tabClosed.classList.remove("active");
      const sfo = $("#sim-filters-open"), sfc = $("#sim-filters-closed");
      if (sfo) sfo.style.display = ""; if (sfc) sfc.style.display = "none";
      $$("[data-simfilter]").forEach(c => c.classList.toggle("active", c.dataset.simfilter === "all"));
      renderSimTable();
    });
    if (tabClosed) tabClosed.addEventListener("click", () => {
      simActiveTab = "closed"; simFilter = "all"; simClosedFilter = "all";
      tabClosed.classList.add("active"); if (tabOpen) tabOpen.classList.remove("active");
      const sfo = $("#sim-filters-open"), sfc = $("#sim-filters-closed");
      if (sfo) sfo.style.display = "none"; if (sfc) sfc.style.display = "";
      $$("[data-simfilter-closed]").forEach(c => c.classList.toggle("active", c.dataset.simfilterClosed === "all"));
      renderSimTable();
    });

    const simSearch = $("#sim-search-input");
    if (simSearch) simSearch.addEventListener("input", e => { simQuery = e.target.value; renderSimTable(); });

    document.addEventListener("click", e => {
      const chip = e.target.closest("[data-simfilter]");
      if (chip) {
        simFilter = chip.dataset.simfilter;
        $$("[data-simfilter]").forEach(c => c.classList.toggle("active", c.dataset.simfilter === simFilter));
        renderSimTable();
        return;
      }
      const chipC = e.target.closest("[data-simfilter-closed]");
      if (chipC) {
        simClosedFilter = chipC.dataset.simfilterClosed;
        $$("[data-simfilter-closed]").forEach(c => c.classList.toggle("active", c.dataset.simfilterClosed === simClosedFilter));
        renderSimTable();
        return;
      }
    });

  }

  function generatePortfolioCurve(period) {
    const today    = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const allPos   = [...HOLDINGS, ...CLOSED_POSITIONS];

    const livePnl      = HOLDINGS.reduce((s, h) => s + (h.pnlDollar || 0), 0);
    // Realized P&L stays in account equity after a close — same formula as the
    // Dashboard 总资产 card (totalNotional + floating + realized), so the curve's
    // last point always matches the number shown on the Dashboard.
    const realizedPnl  = CLOSED_POSITIONS.reduce((s, h) => s + (h.pnlFinal || 0), 0);
    const liveValue    = totalNotional + livePnl + realizedPnl;
    const liveTodayPnl = HOLDINGS.reduce((s, h) => s + ((h.last || 0) - (h.prevClose || h.last || 0)) * (h.qty || 0), 0);

    const getDayPnl = d => d === todayStr ? liveTodayPnl : (histPnlLog[d] ?? dailyPnlLog[d] ?? 0);

    const getTradingDays = n => {
      const days = [], d = new Date(today);
      while (days.length < n) {
        if (d.getDay() !== 0 && d.getDay() !== 6) days.unshift(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() - 1);
      }
      return days;
    };

    // Pre-sort histCache keys per symbol once for O(log n) binary-search price lookup
    const sortedKeys = {};
    Object.keys(histCache).forEach(sym => {
      sortedKeys[sym] = Object.keys(histCache[sym]).sort();
    });

    // Nearest price on or before date d using binary search
    const priceAt = (ySym, d) => {
      const cache = histCache[ySym];
      if (!cache) return null;
      if (cache[d] != null) return cache[d];
      const keys = sortedKeys[ySym] || [];
      let lo = 0, hi = keys.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (keys[mid] <= d) lo = mid; else hi = mid - 1;
      }
      return (keys.length && keys[lo] <= d) ? cache[keys[lo]] : null;
    };

    // CC premium received on or before date d (premium is income on its record date)
    const ccNetAt = (pos, d) =>
      (pos.cc || []).reduce((s, c) => s + ((c.date || "") <= d ? (c.total || 0) : 0), 0);

    // Direct portfolio value: totalNotional + Σ(price_at_D - cost)×qty for open positions on D
    // + pnlFinal for positions already closed by D (realized profit stays in equity —
    // otherwise the curve drops back after every close and never matches the Dashboard).
    // Computing from absolute prices (not cumulative daily deltas) avoids drift from missing
    // dates in Yahoo Finance history and retroactive shifts when new positions are added.
    const portfolioAt = d => {
      if (d >= todayStr) return liveValue;
      let pnl = 0;
      allPos.forEach(pos => {
        const entryDate = pos.entry?.slice(0, 10);
        const closeDate = pos.closedAt?.slice(0, 10);
        if (!entryDate || d < entryDate) return;
        if (closeDate && d > closeDate) { pnl += pos.pnlFinal || 0; return; }
        const ySym  = pos.kind === "crypto" ? `${pos.sym}-USD` : pos.sym;
        const price = priceAt(ySym, d);
        if (price == null) return;
        pnl += (price - pos.cost) * pos.qty + ccNetAt(pos, d);
      });
      return totalNotional + pnl;
    };

    if (period === "week") {
      const days         = getTradingDays(5);
      const labels       = days.map(d => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date(d + "T12:00:00Z").getUTCDay()]);
      const dailyChanges = days.map(d => getDayPnl(d));
      return { values: days.map(d => portfolioAt(d)), labels, dailyChanges };
    }

    if (period === "month") {
      const days         = getTradingDays(22);
      const labels       = days.map(d => { const [,m,dy] = d.split("-"); return `${+m}/${+dy}`; });
      const dailyChanges = days.map(d => getDayPnl(d));
      return { values: days.map(d => portfolioAt(d)), labels, dailyChanges };
    }

    // year: portfolio value at the last trading day of each of the 12 calendar months
    const monthEndValues = Array.from({length: 12}, (_, i) => {
      const d = new Date(today.getFullYear(), today.getMonth() - 11 + i + 1, 0); // last day of month
      if (d >= today) return liveValue;
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
      return portfolioAt(d.toISOString().slice(0, 10));
    });
    const monthPnls = monthEndValues.map((v, i) => v - (i === 0 ? totalNotional : monthEndValues[i - 1]));
    const labels = Array.from({length: 12}, (_, i) =>
      new Date(today.getFullYear(), today.getMonth() - 11 + i, 1).toLocaleDateString("en-US", { month: "short" })
    );
    return { values: monthEndValues, labels, dailyChanges: monthPnls };
  }

  function portfolioCurveSVG(points, labels, h, chartId) {
    if (points.length < 2) return "";
    const W = 560;
    const minV = Math.min(...points), maxV = Math.max(...points);
    const rng = maxV - minV || 1;
    const lo = minV - rng * 0.05, hi = maxV + rng * 0.05;
    const range = hi - lo;
    const sx = i => ((i / (points.length - 1)) * (W - 16) + 8);
    const sy = v => (h - 6) - ((v - lo) / range) * (h - 14);
    const pathD = points.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(" ");
    const areaD = `${pathD} L${sx(points.length - 1).toFixed(1)} ${(h - 2).toFixed(1)} L${sx(0).toFixed(1)} ${(h - 2).toFixed(1)} Z`;
    const lastUp = points[points.length - 1] >= points[0];
    const col = lastUp ? "var(--up)" : "var(--down)";
    const gid = "pcg" + (Math.random() * 1e6 | 0);

    // Grid lines only (no SVG text — labels rendered as HTML to avoid stretch)
    const gridLines = [0.25, 0.5, 0.75].map(t => {
      const gy = sy(minV + rng * t).toFixed(1);
      return `<line x1="8" y1="${gy}" x2="${W - 8}" y2="${gy}" stroke="var(--line)" stroke-width="0.5" stroke-dasharray="4,5" opacity="0.8"/>`;
    }).join("");

    // Y-axis labels as absolute-positioned HTML (avoids SVG text stretch)
    const yLabelHTML = [0.75, 0.5, 0.25].map(t => {
      const v    = minV + rng * t;
      const topP = (sy(v) / h * 100).toFixed(1);
      const lbl  = Math.abs(v) >= 10000 ? `$${(v/1000).toFixed(0)}k`
                 : Math.abs(v) >= 1000  ? `$${(v/1000).toFixed(1)}k`
                 : `$${Math.round(v)}`;
      return `<span style="position:absolute;right:3px;top:${topP}%;transform:translateY(-50%);font-size:10px;color:var(--fg-3);font-family:var(--f-mono);line-height:1;pointer-events:none">${lbl}</span>`;
    }).join("");

    // X-axis labels as HTML flex row
    const xIdxs  = points.length <= 5
      ? points.map((_, i) => i)
      : [0, Math.floor((points.length - 1) / 4), Math.floor((points.length - 1) / 2), Math.floor((points.length - 1) * 3 / 4), points.length - 1];
    const xLblHTML = xIdxs.map((idx, pos) => {
      const align = pos === 0 ? "left" : pos === xIdxs.length - 1 ? "right" : "center";
      return `<span style="flex:1;text-align:${align};font-size:10.5px;color:var(--fg-3);font-family:var(--f-mono)">${labels ? (labels[idx] || "") : ""}</span>`;
    }).join("");

    return `<div id="${chartId}-wrap" style="position:relative">
<div style="position:relative;height:${h}px">
  ${yLabelHTML}
  <svg id="${chartId}" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" style="display:block;width:100%;height:${h}px;cursor:crosshair">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${col}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${col}" stop-opacity="0.02"/>
    </linearGradient></defs>
    ${gridLines}
    <path d="${areaD}" fill="url(#${gid})"/>
    <path d="${pathD}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${sx(0).toFixed(1)}" cy="${sy(points[0]).toFixed(1)}" r="3" fill="${col}" stroke="var(--bg-1)" stroke-width="1.5" opacity="0.6"/>
    <circle cx="${sx(points.length-1).toFixed(1)}" cy="${sy(points[points.length-1]).toFixed(1)}" r="4.5" fill="${col}" stroke="var(--bg-1)" stroke-width="2"/>
    <line id="${chartId}-cross" x1="0" y1="2" x2="0" y2="${h-2}" stroke="var(--fg-2)" stroke-width="1" stroke-dasharray="3,2" opacity="0"/>
    <circle id="${chartId}-hdot" cx="0" cy="0" r="4.5" fill="${col}" stroke="var(--bg-1)" stroke-width="2" opacity="0"/>
  </svg>
</div>
<div style="display:flex;margin-top:6px;padding:0 4px">${xLblHTML}</div>
<div id="${chartId}-tip" class="ec-tooltip" style="display:none"></div>
</div>`;
  }

  function wireCurveTooltip(chartId, points, labels, dailyChanges) {
    const svg   = document.getElementById(chartId);
    const tip   = document.getElementById(chartId + "-tip");
    const cross = document.getElementById(chartId + "-cross");
    const hdot  = document.getElementById(chartId + "-hdot");
    if (!svg || !tip || !cross || !hdot) return;

    const W = 560;
    const minV = Math.min(...points), maxV = Math.max(...points);
    const rng = maxV - minV || 1;
    const lo = minV - rng * 0.05, hi = maxV + rng * 0.05;
    const range = hi - lo;
    const h = svg.viewBox.baseVal.height;
    const sx = i => ((i / (points.length - 1)) * (W - 16) + 8);
    const sy = v => (h - 6) - ((v - lo) / range) * (h - 14);

    svg.addEventListener("mousemove", e => {
      const rect = svg.getBoundingClientRect();
      const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const pct  = relX / rect.width;
      const idx  = Math.min(points.length - 1, Math.max(0, Math.round(pct * (points.length - 1))));
      const val  = points[idx];
      const lbl  = labels ? (labels[idx] || "") : "";

      // Daily P&L: use actual recorded change for that day/period
      const dayPnl = dailyChanges ? (dailyChanges[idx] || 0) : (val - (idx > 0 ? points[idx - 1] : val));
      const pct2   = val > 0 ? (dayPnl / val * 100) : 0;

      // Crosshair + dot
      const vx = sx(idx);
      cross.setAttribute("x1", vx); cross.setAttribute("x2", vx);
      cross.setAttribute("opacity", "0.55");
      hdot.setAttribute("cx", vx); hdot.setAttribute("cy", sy(val));
      hdot.setAttribute("opacity", "1");

      // Tooltip: show portfolio value + that day's actual PnL
      tip.innerHTML = `<div class="ec-tip-label">${lbl}</div>` +
        `<div class="ec-tip-val">${fmt.usd(Math.round(val))}</div>` +
        `<div class="ec-tip-chg ${dayPnl >= 0 ? 'up' : 'down'}">${dayPnl >= 0 ? '+' : '−'}$${Math.abs(Math.round(dayPnl)).toLocaleString()} (${pct2 >= 0 ? '+' : ''}${pct2.toFixed(2)}%)</div>`;

      const tipHalf = 65;
      const clampedX = Math.max(tipHalf, Math.min(rect.width - tipHalf, relX));
      tip.style.left = clampedX + "px";
      tip.style.display = "block";
    });

    svg.addEventListener("mouseleave", () => {
      cross.setAttribute("opacity", "0");
      hdot.setAttribute("opacity", "0");
      tip.style.display = "none";
    });
  }

  function renderAnalytics() {
    const aContent = $("#analytics-content");
    if (!aContent) return;

    const closedRaw = CLOSED_POSITIONS; // raw records — used for P&L calendar (each event on its date)
    const closed = groupTrades(closedRaw); // grouped trades — used for stats, BX, R-mult
    const open   = HOLDINGS;
    const total  = closed.length;
    const wins   = closed.filter(t => t.pnlFinal > 0);
    const losses = closed.filter(t => t.pnlFinal < 0);
    const evens  = closed.filter(t => t.pnlFinal === 0);
    const totalPnl  = closed.reduce((s, t) => s + t.pnlFinal, 0);
    const grossWin  = wins.reduce((s, t) => s + t.pnlFinal, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlFinal, 0));
    const winRate   = total > 0 ? (wins.length / total * 100).toFixed(1) : null;
    const pfStr     = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : (wins.length > 0 ? "∞" : null);
    const avgWin    = wins.length > 0 ? Math.round(grossWin / wins.length) : null;
    const avgLoss   = losses.length > 0 ? Math.round(grossLoss / losses.length) : null;
    const avgHold   = total > 0 ? (closed.reduce((s, t) => s + (t.days || 0), 0) / total).toFixed(1) : null;
    const avgWinDays  = wins.length > 0   ? Math.round(wins.reduce((s, t) => s + (t.days || 0), 0) / wins.length) : null;
    const avgLossDays = losses.length > 0 ? Math.round(losses.reduce((s, t) => s + (t.days || 0), 0) / losses.length) : null;
    const holdRatio   = avgWinDays !== null && avgLossDays > 0 ? (avgWinDays / avgLossDays).toFixed(1) : null;
    const avgWinPct  = wins.length > 0   ? (wins.reduce((s, t) => s + t.pnlFinal / Math.max(t.cost * t.qty, 1), 0) / wins.length * 100).toFixed(1) : null;
    const avgLossPct = losses.length > 0 ? (losses.reduce((s, t) => s + Math.abs(t.pnlFinal) / Math.max(t.cost * t.qty, 1), 0) / losses.length * 100).toFixed(1) : null;

    const sortedC = [...closedRaw].sort((a, b) => (a.closedAt||"").localeCompare(b.closedAt||""));
    const totalPnlDollar = open.reduce((s, h) => s + (h.pnlDollar || 0), 0);
    const realizedPnlTotal = CLOSED_POSITIONS.reduce((s, h) => s + (h.pnlFinal || 0), 0);
    const currentPortfolioValue = totalNotional + totalPnlDollar + realizedPnlTotal;
    const totalPnlDisplay = totalPnlDollar + realizedPnlTotal;
    const curveData = generatePortfolioCurve(equityPeriod);

    // Grade buckets
    const aGradeBuckets = {};
    GRADE_LADDER.forEach(g => { aGradeBuckets[g] = []; });
    closed.forEach(h => {
      const g = h.bx?.entryFinalGrade;
      if (g && aGradeBuckets[g]) aGradeBuckets[g].push(h);
      else if (g) aGradeBuckets[g] = [h];
    });
    const aNoGrade = closed.filter(h => !h.bx?.entryFinalGrade);
    const aGradeEntries = [...GRADE_LADDER].reverse()
      .map(g => ({ grade: g, pos: aGradeBuckets[g] || [] }))
      .filter(e => e.pos.length > 0);
    if (aNoGrade.length > 0) aGradeEntries.push({ grade: "—", pos: aNoGrade });

    // Open portfolio sorted by size
    const openSorted = [...open].sort((a, b) => b.size - a.size);

    // R-Multiple distribution — pre-computed like bxBuckets
    const closedWithR = closed.filter(h => h.rMult != null);
    const rBucketDefs = [
      { label: "< 0R",   sub: "亏损", color: "var(--down)",           check: r => r < 0 },
      { label: "0 – 1R", sub: "保本", color: "var(--fg-3)",           check: r => r >= 0 && r < 1 },
      { label: "1 – 2R", sub: "达标", color: "var(--up)",             check: r => r >= 1 && r < 2 },
      { label: "2R +",   sub: "优秀", color: "oklch(0.82 0.19 145)",  check: r => r >= 2 },
    ];
    const rBucketData = rBucketDefs.map(b => ({ ...b, pos: closedWithR.filter(h => b.check(h.rMult)) }));
    const rMaxCnt = Math.max(1, ...rBucketData.map(b => b.pos.length));
    const rAvg  = closedWithR.length > 0
      ? (closedWithR.reduce((s, h) => s + h.rMult, 0) / closedWithR.length).toFixed(2) : null;
    const rSorted = [...closedWithR].map(h => h.rMult).sort((a, b) => a - b);
    const rMid  = rSorted.length;
    const rMed  = rMid > 0 ? (rMid % 2 === 0
      ? ((rSorted[rMid/2-1] + rSorted[rMid/2]) / 2).toFixed(2)
      : rSorted[Math.floor(rMid/2)].toFixed(2)) : null;
    const rAvgCls = rAvg === null ? "" : parseFloat(rAvg) >= 1 ? "up" : parseFloat(rAvg) >= 0 ? "" : "down";
    const rBarsHTML = rBucketData.map(b => {
      const cnt  = b.pos.length;
      const barW = Math.round(cnt / rMaxCnt * 100);
      return `<div style="display:flex;align-items:center;gap:10px">
        <div style="flex-shrink:0;width:52px;text-align:right">
          <span style="font-family:var(--f-mono);font-size:11px;font-weight:600;color:${b.color}">${b.label}</span>
          <div style="font-size:9.5px;color:var(--fg-3);margin-top:1px">${b.sub}</div>
        </div>
        <div style="flex:1">
          <div style="height:6px;background:var(--bg-3);border-radius:4px;overflow:hidden;margin-bottom:3px">
            <div style="height:100%;border-radius:4px;background:${b.color};width:${barW}%;min-width:${cnt>0?3:0}px;transition:width .4s"></div>
          </div>
          <div style="font-size:10px;color:var(--fg-2);font-family:var(--f-mono)">${cnt > 0 ? cnt + " 笔 · " + Math.round(cnt / (closedWithR.length||1) * 100) + "%" : "—"}</div>
        </div>
      </div>`;
    }).join("");

    aContent.innerHTML = `
      <div class="page-topbar">
        <div class="page-title">
          <span class="page-title-en">Analytics</span>
          <span class="page-title-zh">分析</span>
        </div>
        <div class="muted" style="font-size:12px;font-family:var(--f-mono)">${total} 笔已平仓 · ${open.length} 笔持仓中</div>
      </div>

      <div class="analytics-metrics">
        ${ametric("已实现盈亏",  total ? fmt.signed(Math.round(totalPnl)) : "—", fmt.sign(totalPnl), total ? `${total} 笔交易` : "暂无数据")}
        ${ametric("胜率",        winRate !== null ? winRate + "%" : "—", parseFloat(winRate) >= 50 ? "up" : "down", winRate !== null ? `${wins.length}胜 / ${losses.length}负${evens.length > 0 ? ` / ${evens.length}平` : ""}` : "")}
        ${ametric("盈亏因子",    pfStr || "—", parseFloat(pfStr) >= 1.5 ? "up" : "down", "总盈 ÷ 总亏")}
        ${ametric("平均盈利",    avgWin !== null ? fmt.signed(avgWin) : "—", "up", avgWin !== null ? `+${avgWinPct}% · ${wins.length} 笔盈` : "")}
        ${ametric("平均亏损",    avgLoss !== null ? "−$" + avgLoss.toLocaleString() : "—", "down", avgLoss !== null ? `−${avgLossPct}% · ${losses.length} 笔亏` : "")}
        ${ametric("平均持仓",
          holdRatio !== null ? holdRatio + "x" : avgHold !== null ? avgHold + " 天" : "—",
          holdRatio !== null ? (parseFloat(holdRatio) >= 1.5 ? "up" : parseFloat(holdRatio) >= 1 ? "neu" : "down") : "neu",
          avgWinDays !== null || avgLossDays !== null
            ? `盈 ${avgWinDays ?? "—"}d · 亏 ${avgLossDays ?? "—"}d`
            : avgHold !== null ? `均 ${avgHold}d` : "")}
      </div>

      <div class="analytics-card" style="margin-bottom:14px">
        <div class="ec-header">
          <div>
            <div class="analytics-card-title">总资产曲线 · Portfolio Value</div>
            <div class="analytics-card-sub">
              <span class="mono" style="font-size:15px;font-weight:700;color:var(--fg-0)">${fmt.usd(Math.round(currentPortfolioValue))}</span>
              <span class="mono ${fmt.sign(totalPnlDisplay)}" style="font-size:11px;margin-left:6px">${fmt.signed(Math.round(totalPnlDisplay))}</span>
            </div>
          </div>
          <div class="ec-period-seg">
            <button class="ec-period-btn${equityPeriod === 'week' ? ' active' : ''}" data-period="week">周</button>
            <button class="ec-period-btn${equityPeriod === 'month' ? ' active' : ''}" data-period="month">月</button>
            <button class="ec-period-btn${equityPeriod === 'year' ? ' active' : ''}" data-period="year">年</button>
          </div>
        </div>
        <div style="margin-top:14px">${portfolioCurveSVG(curveData.values, curveData.labels, 136, "ec-main")}</div>
      </div>

      <div class="analytics-card" style="margin-bottom:14px">
        <div class="analytics-card-title">评级绩效 · Grade Performance</div>
        <div class="analytics-card-sub">胜率 · 盈亏分布 · 按开仓评级</div>
        ${(() => {
            if (aGradeEntries.length === 0) return `<div class="muted" style="font-size:12px;margin-top:20px;text-align:center">暂无评级数据</div>`;
            const _maxAbs = Math.max(1, ...aGradeEntries.map(e => Math.abs(e.pos.reduce((s, p) => s + (p.pnlFinal ?? 0), 0))));
            const rows = aGradeEntries.map(({ grade, pos }) => {
              const cnt       = pos.length;
              const wn        = pos.filter(p => (p.pnlFinal ?? 0) > 0).length;
              const wr        = Math.round(wn / cnt * 100);
              const totalG    = Math.round(pos.reduce((s, p) => s + (p.pnlFinal ?? 0), 0));
              const avgPctG   = (pos.reduce((s, p) => s + (p.pnlPct ?? 0), 0) / cnt * 100).toFixed(1);
              const meta      = BX_GRADE_META[grade] || { color: "var(--fg-3)" };
              const pnlCls    = totalG >= 0 ? "up" : "down";
              const pctCls    = parseFloat(avgPctG) >= 0 ? "up" : "down";
              const stPos     = pos.filter(p => p.bx?.entryST === true).length;
              const stHasData = pos.some(p => p.bx?.entryST != null);
              const stStr     = stHasData ? Math.round(stPos / cnt * 100) + "%" : "—";
              const barPct    = Math.round(Math.abs(totalG) / _maxAbs * 100);
              const barColor  = totalG >= 0 ? "var(--up)" : "var(--down)";
              return `<div class="gp-row">
                <span class="gp-grade" style="color:${meta.color}">${grade}</span>
                <span class="gp-cnt">${cnt}</span>
                <span class="gp-wr ${wr >= 50 ? "up" : "down"}">${wr}%</span>
                <span class="gp-avg ${pctCls}">${parseFloat(avgPctG) >= 0 ? "+" : ""}${avgPctG}%</span>
                <span class="gp-st">${stStr}</span>
                <div class="gp-bar-wrap"><div class="gp-bar" style="background:${barColor};width:${barPct}%"></div></div>
                <span class="gp-pnl ${pnlCls}">${fmt.signed(totalG)}</span>
              </div>`;
            }).join("");
            return `<div class="gp-header">
              <span class="gp-grade"></span><span class="gp-cnt">笔</span>
              <span class="gp-wr">胜率</span><span class="gp-avg">均%</span>
              <span class="gp-st">ST▲</span><span class="gp-bar-wrap"></span>
              <span class="gp-pnl">总盈亏</span>
            </div>${rows}`;
          })()}
      </div>

      ${(() => {
        const bxDayDefs = [
          { key: "0-5",  label: "初期", sub: "0–5d",  color: "var(--orange)" },
          { key: "5-15", label: "中期", sub: "5–15d", color: "var(--warn)" },
          { key: "15+",  label: "延续", sub: "15+d",  color: "var(--accent)" },
        ];
        const bxEntries = [
          ...bxDayDefs.map(d => ({ ...d, pos: closed.filter(h => h.bx?.dailyBars === d.key) })).filter(e => e.pos.length > 0),
        ];
        const bxNoDay = closed.filter(h => !h.bx?.dailyBars);
        if (bxNoDay.length > 0) bxEntries.push({ key: "—", label: "—", sub: "未记录", color: "var(--fg-3)", pos: bxNoDay });
        if (bxEntries.every(e => e.key === "—")) return "";
        const _bxMax = Math.max(1, ...bxEntries.map(e => Math.abs(e.pos.reduce((s, p) => s + (p.pnlFinal ?? 0), 0))));
        const bxRows = bxEntries.map(({ label, sub, color, pos }) => {
          const cnt  = pos.length;
          const wn   = pos.filter(p => (p.pnlFinal ?? 0) > 0).length;
          const evn  = pos.filter(p => (p.pnlFinal ?? 0) === 0).length;
          const wr   = cnt > 0 ? Math.round(wn / cnt * 100) : 0;
          const totalG  = Math.round(pos.reduce((s, p) => s + (p.pnlFinal ?? 0), 0));
          const avgPctG = (pos.reduce((s, p) => {
            const basis = (p.cost ?? 0) * (p.qty ?? 0);
            return s + (basis > 0 ? (p.pnlFinal ?? 0) / basis : 0);
          }, 0) / cnt * 100).toFixed(1);
          const pnlCls  = totalG > 0 ? "up" : totalG < 0 ? "down" : "";
          const pctCls  = parseFloat(avgPctG) > 0 ? "up" : parseFloat(avgPctG) < 0 ? "down" : "";
          const barPct  = Math.round(Math.abs(totalG) / _bxMax * 100);
          const barColor = totalG >= 0 ? "var(--up)" : "var(--down)";
          const evnTxt  = evn > 0 ? `<span style="color:var(--neutral);font-size:9.5px">平${evn}</span>` : "";
          return `<div class="gp-row">
            <span class="gp-grade" style="color:${color};font-size:10px;line-height:1.3;display:flex;flex-direction:column;align-items:flex-end">${label}<span style="color:var(--fg-3);font-size:8.5px;font-weight:400">${sub}</span></span>
            <span class="gp-cnt">${cnt}</span>
            <span class="gp-wr ${wr >= 50 ? "up" : "down"}">${wr}%</span>
            <span class="gp-avg ${pctCls}">${parseFloat(avgPctG) >= 0 ? "+" : ""}${avgPctG}%</span>
            <span class="gp-st" style="display:flex;align-items:center;justify-content:center">${evnTxt}</span>
            <div class="gp-bar-wrap"><div class="gp-bar" style="background:${barColor};width:${barPct}%"></div></div>
            <span class="gp-pnl ${pnlCls}">${fmt.signed(totalG)}</span>
          </div>`;
        }).join("");
        return `<div class="analytics-card" style="margin-bottom:14px">
          <div class="analytics-card-title">入场时机绩效 · Entry Timing</div>
          <div class="analytics-card-sub">按开仓时 BX 天数分段</div>
          <div class="gp-header" style="margin-top:10px">
            <span class="gp-grade"></span><span class="gp-cnt">笔</span>
            <span class="gp-wr">胜率</span><span class="gp-avg">均%</span>
            <span class="gp-st">持平</span><span class="gp-bar-wrap"></span>
            <span class="gp-pnl">总盈亏</span>
          </div>${bxRows}
        </div>`;
      })()}

      <div class="analytics-chart-row">
        <div class="analytics-card" style="flex:1">
          <div class="analytics-card-title">R 倍数分布 · R-Multiple</div>
          <div class="analytics-card-sub">出场质量 · 按区间统计</div>
          ${closedWithR.length === 0
            ? `<div class="muted" style="font-size:12px;margin-top:20px;text-align:center">暂无 R 倍数数据</div>`
            : `<div style="margin-top:16px;display:flex;flex-direction:column;gap:14px">${rBarsHTML}</div>
               <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--line);display:flex;gap:20px">
                 <div>
                   <div style="font-size:10px;color:var(--fg-3);margin-bottom:2px">平均 R</div>
                   <div class="mono ${rAvgCls}" style="font-size:14px;font-weight:700">${parseFloat(rAvg) >= 0 ? "+" : ""}${rAvg}R</div>
                 </div>
                 <div>
                   <div style="font-size:10px;color:var(--fg-3);margin-bottom:2px">中位 R</div>
                   <div class="mono" style="font-size:14px;font-weight:700;color:var(--fg-1)">${parseFloat(rMed) >= 0 ? "+" : ""}${rMed}R</div>
                 </div>
                 <div>
                   <div style="font-size:10px;color:var(--fg-3);margin-bottom:2px">样本</div>
                   <div class="mono" style="font-size:14px;font-weight:700;color:var(--fg-1)">${closedWithR.length} 笔</div>
                 </div>
               </div>`}
        </div>
      </div>

      ${pnlCalendarHTML(calYear, calMonth)}

      <div class="analytics-chart-row">
        <div class="analytics-card" style="flex:1">
          <div class="analytics-card-title">已平仓交易分布</div>
          <div class="analytics-card-sub">按盈亏金额排序</div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:5px">
            ${analyticsTradeBar(closed)}
          </div>
        </div>
        <div class="analytics-card" style="flex:1">
          <div class="analytics-card-title">当前持仓风险</div>
          <div class="analytics-card-sub">按仓位大小排序</div>
          <div style="margin-top:12px">
            <table style="width:100%;border-collapse:collapse;font-size:11.5px">
              <thead><tr style="color:var(--fg-2)">
                <th style="text-align:left;padding:3px 0 6px;font-weight:500;border-bottom:1px solid var(--line)">代码</th>
                <th style="text-align:right;padding:3px 0 6px;font-weight:500;border-bottom:1px solid var(--line)">仓位%</th>
                <th style="text-align:right;padding:3px 0 6px;font-weight:500;border-bottom:1px solid var(--line)">浮盈亏</th>
                <th style="text-align:right;padding:3px 0 6px;font-weight:500;border-bottom:1px solid var(--line)">状态</th>
              </tr></thead>
              <tbody>
                ${openSorted.slice(0, 9).map(h => {
                  const bs = BUCKET_STATUS[progressBucket(h)];
                  const ps = fmt.sign(h.pnlDollar);
                  return `<tr style="border-bottom:1px solid color-mix(in oklch,var(--line) 45%,transparent)">
                    <td style="padding:5px 0"><span class="mono" style="font-weight:600">${h.sym}</span></td>
                    <td style="text-align:right;color:var(--fg-2);font-family:var(--f-mono);font-size:11px">${h.size.toFixed(1)}%</td>
                    <td style="text-align:right" class="mono ${ps}">${fmt.signed(h.pnlDollar)}</td>
                    <td style="text-align:right"><span class="status ${bs.cls}" style="font-size:9px;padding:2px 5px;white-space:nowrap"><span class="dot"></span>${bs.label.split("·")[0].trim()}</span></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>



      <div class="analytics-card" style="margin-bottom:14px">
        <div class="analytics-card-title">出场质量分析 · Exit Quality</div>
        <div class="analytics-card-sub">峰值盈利 vs 实际出场 · 按损耗排序</div>
        <div style="margin-top:14px" id="eq-content">${exitQualityHTML()}</div>
      </div>
    `;

    $$(".ec-period-btn", aContent).forEach(btn => {
      btn.addEventListener("click", () => {
        equityPeriod = btn.dataset.period;
        renderAnalytics();
      });
    });
    if (!["week","month","year"].includes(equityPeriod)) equityPeriod = "week";

    wireCurveTooltip("ec-main", curveData.values, curveData.labels, curveData.dailyChanges);

    const calPrev = $("#cal-prev", aContent);
    const calNext = $("#cal-next", aContent);
    if (calPrev) calPrev.addEventListener("click", () => {
      calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
      renderAnalytics();
    });
    if (calNext) calNext.addEventListener("click", () => {
      calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
      renderAnalytics();
    });
  }

  function ametric(label, value, colorCls, sub) {
    return `<div class="analytics-metric">
      <div class="analytics-metric-label">${label}</div>
      <div class="analytics-metric-value ${colorCls || "neu"}">${value}</div>
      ${sub ? `<div class="analytics-metric-sub">${sub}</div>` : ""}
    </div>`;
  }

  function exitQualityHTML() {
    const closed = CLOSED_POSITIONS;
    if (!closed.length) return `<div class="eq-empty">暂无已平仓记录</div>`;

    // Group partial closes into trades (sym + entry + cost)
    const tradeMap = new Map();
    for (const h of closed) {
      const key = `${h.sym}|${h.entry}|${h.cost}`;
      if (!tradeMap.has(key)) tradeMap.set(key, []);
      tradeMap.get(key).push(h);
    }

    const rows = [];
    const pureLossRows = []; // trades where price never exceeded entry cost
    for (const [, records] of tradeMap) {
      const h0 = records[0];
      const ySym   = h0.kind === "crypto" ? `${h0.sym}-USD` : h0.sym;
      const prices = histCache[ySym];
      if (!prices) continue;

      const entryDate = h0.entry?.slice(0, 10);
      const lastClose = records.reduce((mx, r) => (r.closedAt || "") > mx ? (r.closedAt || "") : mx, "");
      const closeDate = lastClose.slice(0, 10);
      if (!entryDate || !closeDate || !h0.cost) continue;

      const datesInRange = Object.keys(prices).filter(d => d > entryDate && d <= closeDate);
      if (!datesInRange.length) continue;

      const peakPrice = Math.max(...datesInRange.map(d => prices[d]));
      if (peakPrice <= h0.cost) {
        const actualPnl = records.reduce((s, r) => s + (r.pnlFinal ?? 0), 0);
        pureLossRows.push({ h: { ...h0, closedAt: closeDate }, actualPnl });
        continue;
      }

      const totalQty  = records.reduce((s, r) => s + (r.qty ?? 0), 0);
      const peakPnl   = (peakPrice - h0.cost) * totalQty;
      const actualPnl = records.reduce((s, r) => s + (r.pnlFinal ?? 0), 0);
      const leftOnTable = peakPnl - actualPnl;
      const efficiency  = Math.round(Math.min(actualPnl, peakPnl) / peakPnl * 100);
      const isPartial   = records.length > 1;

      rows.push({ h: { ...h0, closedAt: closeDate }, peakPnl, actualPnl, leftOnTable, efficiency, isPartial, trancheCnt: records.length });
    }

    if (!rows.length && !pureLossRows.length) {
      return histLoading
        ? `<div class="eq-empty">加载历史价格中…</div>`
        : `<div class="eq-empty">暂无数据 · 需要已平仓记录和历史价格</div>`;
    }
    if (!rows.length && pureLossRows.length) {
      return histLoading
        ? `<div class="eq-empty">加载历史价格中…</div>`
        : `<div class="eq-empty" style="text-align:left;padding:12px 0">
            <div style="margin-bottom:6px;color:var(--fg-2)">持仓期间价格未超过入场成本，无峰值盈利参考</div>
            ${pureLossRows.map(r => `<div class="mono" style="font-size:11.5px;color:var(--down);padding:2px 0">${r.h.sym} ${fmt.signed(Math.round(r.actualPnl))}</div>`).join("")}
           </div>`;
    }

    rows.sort((a, b) => b.leftOnTable - a.leftOnTable);

    const totalPeak   = rows.reduce((s, r) => s + r.peakPnl, 0);
    const totalActual = rows.reduce((s, r) => s + r.actualPnl, 0);
    const overallEff  = totalPeak > 0 ? Math.round(Math.max(0, totalActual) / totalPeak * 100) : 0;
    const effCls      = e => e >= 75 ? "high" : e >= 45 ? "mid" : "low";
    const effLabel    = e => e < 0 ? "亏损出场" : e + "% 效率";

    const summaryHTML = `
      <div class="eq-summary">
        <div class="eq-summary-card">
          <div class="eq-summary-label">可捕获盈利</div>
          <div class="eq-summary-value up">+$${Math.round(totalPeak).toLocaleString("en-US")}</div>
          <div class="eq-summary-sub">${rows.length} 笔有效记录</div>
        </div>
        <div class="eq-summary-card">
          <div class="eq-summary-label">实际盈亏</div>
          <div class="eq-summary-value ${fmt.sign(totalActual)}">${fmt.signed(Math.round(totalActual))}</div>
          <div class="eq-summary-sub">已实现</div>
        </div>
        <div class="eq-summary-card">
          <div class="eq-summary-label">出场效率</div>
          <div class="eq-summary-value ${effCls(overallEff) === "high" ? "up" : effCls(overallEff) === "mid" ? "neu" : "down"}">${overallEff}%</div>
          <div class="eq-summary-sub">实际 ÷ 峰值</div>
        </div>
      </div>`;

    const listHTML = rows.map(({ h, peakPnl, actualPnl, leftOnTable, efficiency, isPartial, trancheCnt }) => {
      const actualW   = Math.max(0, Math.round(Math.min(actualPnl, peakPnl) / peakPnl * 100));
      const actualCls = actualPnl >= 0 ? "up" : "down";
      const chip      = effCls(efficiency);
      const trancheTag = isPartial ? `<span style="font-size:9.5px;color:var(--fg-3);margin-left:6px">${trancheCnt}次出场</span>` : "";
      return `<div class="eq-row">
        <div class="eq-row-header">
          <div>
            <span class="eq-sym">${h.sym}</span>${trancheTag}
            <span class="eq-dates">${h.entry?.slice(0,10)} → ${h.closedAt?.slice(0,10)}</span>
          </div>
          <span class="eq-eff-chip ${chip}">${effLabel(efficiency)}</span>
        </div>
        <div class="eq-bar-row">
          <span class="eq-bar-label">峰值</span>
          <div class="eq-bar-track"><div class="eq-bar-fill peak" style="width:100%"></div></div>
          <span class="eq-bar-val up">+$${Math.round(peakPnl).toLocaleString("en-US")}</span>
        </div>
        <div class="eq-bar-row">
          <span class="eq-bar-label">实际</span>
          <div class="eq-bar-track"><div class="eq-bar-fill actual ${actualCls}" style="width:${actualW}%"></div></div>
          <span class="eq-bar-val ${actualCls}">${fmt.signed(Math.round(actualPnl))}</span>
        </div>
        <div class="eq-loss-line">损耗 <span class="loss">−$${Math.round(leftOnTable).toLocaleString("en-US")}</span></div>
      </div>`;
    }).join("");

    const pureLossFooter = pureLossRows.length
      ? `<div style="margin-top:12px;padding:10px 14px;background:var(--bg-2);border-radius:8px;border:1px solid var(--line)">
           <div style="font-size:10.5px;color:var(--fg-3);margin-bottom:6px;letter-spacing:0.04em">以下交易持仓期间价格未超过入场成本，无峰值盈利参考，不计入效率统计</div>
           <div style="display:flex;flex-wrap:wrap;gap:8px">
             ${pureLossRows.map(r => `<span style="font-size:11.5px;font-family:var(--f-mono);color:var(--down)">${r.h.sym} ${fmt.signed(Math.round(r.actualPnl))}</span>`).join("")}
           </div>
         </div>`
      : "";

    return summaryHTML + listHTML + pureLossFooter;
  }

  function equityCurveSVG(points, h) {
    if (points.length < 2) return "";
    const W = 560;
    const min = Math.min(0, ...points), max = Math.max(0, ...points);
    const rng = max - min || 1;
    const sx = i => ((i / (points.length - 1)) * (W - 4) + 2);
    const sy = v => h - 4 - ((v - min) / rng) * (h - 10);
    const zY = sy(0);
    const pathD = points.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(" ");
    const areaD = `${pathD} L${sx(points.length-1).toFixed(1)} ${zY.toFixed(1)} L${sx(0).toFixed(1)} ${zY.toFixed(1)} Z`;
    const lastUp = points[points.length - 1] >= 0;
    const col = lastUp ? "var(--up)" : "var(--down)";
    const gid = "ecg" + (Math.random() * 1e6 | 0);
    return `<svg viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" style="display:block;width:100%;height:${h}px">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${col}" stop-opacity="0.28"/>
        <stop offset="1" stop-color="${col}" stop-opacity="0.02"/>
      </linearGradient></defs>
      <line x1="2" y1="${zY.toFixed(1)}" x2="${W-2}" y2="${zY.toFixed(1)}" stroke="var(--line)" stroke-width="1" stroke-dasharray="4,3"/>
      <path d="${areaD}" fill="url(#${gid})"/>
      <path d="${pathD}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map((v, i) => i > 0 ? `<circle cx="${sx(i).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="3.5" fill="${v >= 0 ? "var(--up)" : "var(--down)"}" stroke="var(--bg-1)" stroke-width="2"/>` : "").join("")}
    </svg>`;
  }

  function analyticsTradeBar(closed) {
    if (!closed.length) return `<div style="color:var(--fg-3);font-size:12px;padding:16px 0;text-align:center">暂无已平仓数据</div>`;
    const sorted = [...closed].sort((a, b) => (b.pnlFinal ?? 0) - (a.pnlFinal ?? 0));
    const maxA = Math.max(1, ...sorted.map(h => Math.abs(h.pnlFinal ?? 0)));
    return sorted.map(h => {
      const pnl = h.pnlFinal ?? h.pnlDollar ?? 0;
      const w = (Math.abs(pnl) / maxA * 100).toFixed(1);
      const col = pnl >= 0 ? "var(--up)" : "var(--down)";
      return `<div class="trade-bar-row">
        <span class="mono trade-bar-sym">${h.sym}</span>
        <div class="trade-bar-track"><div class="trade-bar-fill" style="width:${w}%;background:${col}"></div></div>
        <span class="mono ${fmt.sign(pnl)} trade-bar-val">${fmt.signed(Math.round(pnl))}</span>
      </div>`;
    }).join("");
  }

  function pnlCalendarHTML(year, month, extraStyle = "margin-bottom:14px") {
    const today    = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // Realized PnL grouped by close date
    const pnlMap = {};
    CLOSED_POSITIONS.forEach(h => {
      if (!h.closedAt) return;
      const d = h.closedAt.slice(0, 10);
      const [y, m] = d.split("-").map(Number);
      if (y !== year || m - 1 !== month) return;
      pnlMap[d] = (pnlMap[d] || 0) + (h.pnlFinal || 0);
    });

    // For today: live calculation; for past days: use stored dailyPnlLog
    const isCurrentMonth = (today.getFullYear() === year && today.getMonth() === month);
    const liveTodayPnl = isCurrentMonth
      ? HOLDINGS.reduce((s, h) => s + Math.round(((h.last || 0) - (h.prevClose || h.last || 0)) * (h.qty || 0)), 0)
      : 0;

    // Entry map: date → [{sym, pnl}]
    const entryMap = {};
    const add = (d, sym, pnl) => { (entryMap[d] = entryMap[d] || []).push({ sym, pnl }); };
    HOLDINGS.forEach(h => {
      if (!h.entry) return;
      const d = h.entry.slice(0, 10);
      const [y, m] = d.split("-").map(Number);
      if (y === year && m - 1 === month) add(d, h.sym, h.pnlDollar ?? null);
    });
    CLOSED_POSITIONS.forEach(h => {
      if (!h.entry) return;
      const d = h.entry.slice(0, 10);
      const [y, m] = d.split("-").map(Number);
      if (y === year && m - 1 === month) add(d, h.sym, null);
    });

    // Exit map: closedAt date → [{sym, pnl}]
    const exitMap = {};
    const addExit = (d, sym, pnl) => { (exitMap[d] = exitMap[d] || []).push({ sym, pnl }); };
    CLOSED_POSITIONS.forEach(h => {
      if (!h.closedAt) return;
      const d = h.closedAt.slice(0, 10);
      const [y, m] = d.split("-").map(Number);
      if (y === year && m - 1 === month) addExit(d, h.sym, h.pnlFinal ?? null);
    });

    // Month stats: count individual closed trade records (not unique close days)
    let mTradeWins = 0, mTradeLosses = 0;
    CLOSED_POSITIONS.forEach(h => {
      if (!h.closedAt) return;
      const [cy, cm] = h.closedAt.slice(0, 10).split("-").map(Number);
      if (cy !== year || cm - 1 !== month) return;
      const pnl = h.pnlFinal || 0;
      if (pnl > 0) mTradeWins++;
      else if (pnl < 0) mTradeLosses++;
    });
    // Monthly portfolio total: sum daily portfolio P&L changes (histPnlLog / dailyPnlLog)
    // This is consistent with what each cell displays, so the total actually adds up.
    const daysInMoLoop = new Date(year, month + 1, 0).getDate();
    let mPortfolio = 0, mHasHist = false;
    for (let i = 1; i <= daysInMoLoop; i++) {
      const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      if (ds > todayStr) break;
      const v = ds === todayStr ? (isCurrentMonth ? liveTodayPnl : null)
                                : (histPnlLog[ds] ?? dailyPnlLog[ds] ?? null);
      if (v != null) { mPortfolio += v; mHasHist = true; }
    }

    const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const mSign = mPortfolio >= 0 ? "up" : "down";
    const mTotalHTML = mHasHist
      ? `<span class="mono ${mSign}" style="font-size:14px;font-weight:700">${fmt.signed(Math.round(mPortfolio))}</span>`
      : `<span class="muted" style="font-size:12px">暂无数据</span>`;
    const mWLHTML = (mTradeWins + mTradeLosses) > 0
      ? `<span class="muted" style="font-size:10.5px">${mTradeWins}W · ${mTradeLosses}L</span>` : "";

    const isNextDis = year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth());
    const firstDow  = new Date(year, month, 1).getDay();
    const startOff  = (firstDow + 6) % 7;
    const daysInMo  = new Date(year, month + 1, 0).getDate();

    const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    const hdrCells = DOW.map(d => `<div class="cal-hdr">${d}</div>`).join("");

    let dayCells = "";
    for (let i = 0; i < startOff; i++) dayCells += `<div class="cal-cell empty"></div>`;

    for (let d = 1; d <= daysInMo; d++) {
      const dow     = new Date(year, month, d).getDay();
      const isWknd  = (dow === 0 || dow === 6);
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isToday = (dateStr === todayStr);
      const entries = entryMap[dateStr] || [];
      // Daily portfolio P&L: live for today, histPnlLog/dailyPnlLog for past days.
      // Consistent for all days so cell values and the monthly total add up correctly.
      const cellPnl = isToday
        ? liveTodayPnl
        : (histPnlLog[dateStr] ?? dailyPnlLog[dateStr] ?? null);

      let cls = "cal-cell";
      if (isWknd)  cls += " wknd";
      if (isToday) cls += " today";
      // Color by daily portfolio move; fall back to realized direction when hist is missing
      if (!isWknd) {
        if (cellPnl != null && cellPnl !== 0)
          cls += cellPnl >= 0 ? " win" : " loss";
        else if (pnlMap[dateStr] != null)
          cls += pnlMap[dateStr] >= 0 ? " win" : " loss";
      }

      // P&L number: daily portfolio P&L for all days (muted/opaque on today = unrealized)
      let pnlHTML = "";
      if (!isWknd && cellPnl != null && cellPnl !== 0) {
        const col   = cellPnl >= 0 ? "var(--up)" : "var(--down)";
        const sign  = cellPnl >= 0 ? "+" : "−";
        const abs   = Math.abs(Math.round(cellPnl));
        const amt   = abs >= 10000 ? `${sign}$${(abs / 1000).toFixed(0)}k`
                    : abs >= 1000  ? `${sign}$${(abs / 1000).toFixed(1)}k`
                    : `${sign}$${abs}`;
        const opacity = isToday ? ";opacity:0.55" : "";
        pnlHTML = `<div class="cal-pnl" style="color:${col}${opacity}">${amt}</div>`;
      }

      // Entry chips: ● dot + ticker, always accent color (entry event, not P&L)
      let entryHTML = "";
      if (!isWknd && entries.length) {
        const chips = entries.slice(0, 2).map(e => {
          const col = "var(--accent)";
          return `<div class="cal-entry-chip">
            <div class="cal-entry-dot" style="background:${col}"></div>
            <span class="cal-entry-sym" style="color:${col}">${e.sym.slice(0, 4)}</span>
          </div>`;
        }).join("");
        const more = entries.length > 2
          ? `<span class="cal-entry-more">+${entries.length - 2}</span>` : "";
        entryHTML = `<div class="cal-entries">${chips}${more}</div>`;
      }

      // Exit chips: ○ hollow circle + ticker, colored by realized PnL
      const exits = exitMap[dateStr] || [];
      let exitHTML = "";
      if (!isWknd && exits.length) {
        const chips = exits.slice(0, 2).map(e => {
          const col = e.pnl == null ? "var(--fg-3)"
                    : e.pnl >= 0   ? "var(--up)" : "var(--down)";
          return `<div class="cal-exit-chip">
            <div class="cal-exit-dot" style="border-color:${col}"></div>
            <span class="cal-exit-sym" style="color:${col}">${e.sym.slice(0, 4)}</span>
          </div>`;
        }).join("");
        const more = exits.length > 2
          ? `<span class="cal-entry-more">+${exits.length - 2}</span>` : "";
        exitHTML = `<div class="cal-exits">${chips}${more}</div>`;
      }

      const marksHTML = (entryHTML || exitHTML)
        ? `<div class="cal-marks">${entryHTML}${exitHTML}</div>` : "";

      dayCells += `<div class="${cls}"><div class="cal-day-num">${d}</div>${pnlHTML}${marksHTML}</div>`;
    }

    return `
      <div class="analytics-card" style="${extraStyle}">
        <div class="ec-header" style="margin-bottom:14px">
          <div>
            <div class="analytics-card-title">盈亏日历 · P&L Calendar</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:5px">
              ${mTotalHTML}${mWLHTML}
              ${histLoading ? `<span class="muted" style="font-size:10px">加载历史数据…</span>` : ""}
            </div>
          </div>
          <div class="cal-nav">
            <button class="cal-nav-btn" id="cal-prev">‹</button>
            <span class="cal-month-lbl">${monthLabel}</span>
            <button class="cal-nav-btn" id="cal-next" ${isNextDis ? "disabled" : ""}>›</button>
          </div>
        </div>
        <div class="cal-grid">${hdrCells}${dayCells}</div>
      </div>`;
  }

  function wlGradeSummaryHTML() {
    const graded = WATCHLIST.filter(w => _wlEffectiveGrade(w));
    if (graded.length === 0) return "";
    const buckets = {};
    GRADE_LADDER.forEach(g => { buckets[g] = []; });
    graded.forEach(w => {
      const g = _wlEffectiveGrade(w);
      if (g) { if (buckets[g]) buckets[g].push(w.sym); else buckets[g] = [w.sym]; }
    });
    const rows = [...GRADE_LADDER].reverse()
      .map(g => ({ g, syms: buckets[g] || [] }))
      .filter(r => r.syms.length > 0);
    const allBtn = _wlGradeFilter
      ? `<button class="wl-gs-all" data-wl-grade-all>全部</button>`
      : "";
    const chips = rows.map(({ g, syms }) => {
      const meta    = BX_GRADE_META[g] || { color: "var(--fg-3)" };
      const isActive = _wlGradeFilter === g;
      const dimmed  = _wlGradeFilter && !isActive;
      return `<button class="wl-gs-chip${isActive ? " active" : ""}" data-wl-grade="${g}"
        title="${syms.join(", ")}"
        style="border-color:${meta.color};color:${meta.color};background:color-mix(in oklch,${meta.color} ${isActive ? 18 : 10}%,transparent);opacity:${dimmed ? 0.4 : 1}">
        <span class="wl-gs-grade">${g}</span>
        <span class="wl-gs-cnt">${syms.length}</span>
      </button>`;
    }).join("");
    return `<div class="wl-grade-summary" id="wl-gs-bar">
      <div class="wl-gs-label">评级筛选</div>
      <div class="wl-gs-chips">${chips}</div>
      ${allBtn}
      <div class="wl-gs-total">${graded.length}<span class="wl-gs-total-sep">/</span>${WATCHLIST.length} 已评级</div>
    </div>`;
  }

  function _refreshWlSummary(content) {
    const bar = $("#wl-gs-bar", content);
    if (bar) bar.outerHTML = wlGradeSummaryHTML();
    _wireWlSummary(content);
  }

  function _wireWlSummary(content) {
    $$("[data-wl-grade]", content).forEach(chip => {
      chip.addEventListener("click", () => {
        const g = chip.dataset.wlGrade;
        _wlGradeFilter = (_wlGradeFilter === g) ? null : g;
        renderWatchlist();
      });
    });
    $$("[data-wl-grade-all]", content).forEach(btn => {
      btn.addEventListener("click", () => { _wlGradeFilter = null; renderWatchlist(); });
    });
  }

    // ============ WATCHLIST ============
  function renderWatchlist() {
    const content = $("#watchlist-content");
    if (!content) return;

    const _wlGS = wlGradeSummaryHTML();
    const _wlVisible = WATCHLIST.map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !_wlGradeFilter || _wlEffectiveGrade(item) === _wlGradeFilter);
    content.innerHTML = WATCHLIST.length === 0
      ? `<div style="text-align:center;padding:48px;color:var(--fg-3);font-size:13px">暂无列表记录</div>`
      : _wlGS + (_wlVisible.length === 0
          ? `<div style="text-align:center;padding:32px;color:var(--fg-3);font-size:12px">无 ${_wlGradeFilter} 评级股票</div>`
          : _wlVisible.map(({ item, idx }) => watchlistCardHTML(item, idx, _readLocalAnalysis(item.sym))).join(""));

    $$(".wl-delete", content).forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        WATCHLIST.splice(parseInt(btn.dataset.idx), 1);
        saveToStorage(); renderWatchlist();
      });
    });
    $$(".wl-add-pos", content).forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const item = WATCHLIST[parseInt(btn.dataset.idx)];
        if (!item) return;
        switchPage("desk");
        setTimeout(() => {
          const ti = $("#form-ticker"); if (ti) ti.value = item.sym;
          const ei = $("#form-entry");  if (ei && item.price) ei.value = item.price;
          const fd = $("#form-date"); if (fd) fd.value = new Date().toISOString().slice(0, 10);
          const fe = $("#form-earnings"); if (fe) fe.value = "";
          openModal("new-position-modal");
        }, 80);
      });
    });
    $$(".wl-note", content).forEach(ta => {
      ta.addEventListener("blur", () => {
        const item = WATCHLIST[parseInt(ta.dataset.idx)];
        if (item) { item.note = ta.value; saveToStorage(); }
      });
    });
    // BX period buttons
    $$(".wl-bx-btn", content).forEach(btn => {
      btn.addEventListener("click", () => {
        const idx    = parseInt(btn.dataset.wlIdx);
        const period = btn.dataset.period;
        const val    = parseInt(btn.dataset.val);
        const item   = WATCHLIST[idx];
        if (!item) return;
        if (!item._bx) item._bx = { daily: 0, weekly: 0, monthly: 0 };
        item._bx[period] = val;
        const bxg = calcBXGrade(item._bx.daily ?? 0, item._bx.weekly ?? 0, item._bx.monthly ?? 0);
        item._entryBxGrade    = bxg;
        const afterRsB = item._entryRsResult ? rsAdjustGrade(bxg, item._entryRsResult) : bxg;
        item._entryFinalGrade = stAdjustGrade(afterRsB, item._wlST ?? null);
        saveToStorage();
        $$(`[data-wl-idx="${idx}"][data-period="${period}"]`, content).forEach(b =>
          b.classList.toggle("active", parseInt(b.dataset.val) === val));
        _updateWlEntryGrade(content, idx, item);
        _refreshWlSummary(content);
      });
    });

    // Grade summary chip filter
    _wireWlSummary(content);

    // ST buttons on watchlist cards
    $$(".wl-st-btn", content).forEach(btn => {
      btn.addEventListener("click", () => {
        const idx  = parseInt(btn.dataset.wlIdx);
        const item = WATCHLIST[idx];
        if (!item) return;
        const val = btn.dataset.wlSt;
        const newST = val === "true" ? true : val === "false" ? false : null;
        item._wlST = (item._wlST === newST) ? null : newST;
        $$(`.wl-st-btn[data-wl-idx="${idx}"]`, content).forEach(b =>
          b.classList.toggle("active", String(item._wlST) === b.dataset.wlSt));
        const bxg = item._entryBxGrade ||
          calcBXGrade(item._bx?.daily ?? 0, item._bx?.weekly ?? 0, item._bx?.monthly ?? 0);
        const afterRs = item._entryRsResult ? rsAdjustGrade(bxg, item._entryRsResult) : bxg;
        item._entryFinalGrade = stAdjustGrade(afterRs, item._wlST ?? null);
        saveToStorage();
        _updateWlEntryGrade(content, idx, item);
        _refreshWlSummary(content);
      });
    });

    // ETF input — auto-uppercase
    $$(".wl-rs-etf", content).forEach(inp => {
      inp.addEventListener("input", () => {
        const p = inp.selectionStart;
        inp.value = inp.value.toUpperCase();
        try { inp.setSelectionRange(p, p); } catch (_) {}
      });
    });

    // RS calc buttons
    $$(".wl-rs-calc-btn", content).forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx  = parseInt(btn.dataset.wlIdx);
        const item = WATCHLIST[idx];
        if (!item) return;
        const etfInput = $(`.wl-rs-etf[data-wl-idx="${idx}"]`, content);
        const analysis = _readLocalAnalysis(item.sym);
        const etf = etfInput?.value.trim().toUpperCase() || analysis?.rs20d?.sectorEtf || null;
        if (!item._bx) item._bx = { daily: 0, weekly: 0, monthly: 0 };
        if (etf) item._bx.sectorEtf = etf;
        btn.textContent = "计算中…";
        btn.disabled = true;
        try {
          const rsData   = await computeEntryRS(item.sym, etf, item.kind);
          const rsResult = calcRSScore(rsData);
          item._entryRsResult = rsResult;
          const bxg = item._entryBxGrade ||
            calcBXGrade(item._bx?.daily ?? 0, item._bx?.weekly ?? 0, item._bx?.monthly ?? 0);
          item._entryBxGrade    = bxg;
          const afterRsR = rsAdjustGrade(bxg, rsResult);
          item._entryFinalGrade = stAdjustGrade(afterRsR, item._wlST ?? null);
          saveToStorage();
          _updateWlEntryGrade(content, idx, item);
        } catch (_) {
          btn.textContent = "失败，重试";
        } finally {
          btn.disabled = false;
          if (btn.textContent !== "失败，重试") btn.textContent = "计算 RS";
        }
      });
    });

    renderScoringRulesPanel();
    fetchWatchlistPrices();
  }

  function _wlEffectiveGrade(item) {
    const bx = item._bx;
    if (!bx && !item._entryBxGrade) return null;
    const bxg = item._entryBxGrade ||
      (bx ? calcBXGrade(bx.daily ?? 0, bx.weekly ?? 0, bx.monthly ?? 0) : null);
    if (!bxg) return null;
    const afterRs = item._entryRsResult ? rsAdjustGrade(bxg, item._entryRsResult) : bxg;
    return stAdjustGrade(afterRs, item._wlST ?? null);
  }

  function _wlEntryGradeHTML(item) {
    const bx  = item._bx;
    const bxg = item._entryBxGrade ||
      (bx ? calcBXGrade(bx.daily ?? 0, bx.weekly ?? 0, bx.monthly ?? 0) : null);
    if (!bxg) return `<div class="dsc-empty">选择BX评分后显示评级</div>`;
    const rs      = item._entryRsResult;
    const afterRs = rs ? rsAdjustGrade(bxg, rs) : bxg;
    const fg      = stAdjustGrade(afterRs, item._wlST ?? null);
    const meta    = BX_GRADE_META[fg]  || BX_GRADE_META["C"];
    const bxMeta  = BX_GRADE_META[bxg] || BX_GRADE_META["C"];
    const changed = fg !== bxg;
    const stTag   = item._wlST != null
      ? `<span class="esc-st-tag ${item._wlST ? "up" : "down"}" style="margin-left:4px">${item._wlST ? "▲ 做多" : "▼ 做空"}</span>` : "";
    const gradeChip = changed
      ? `<span class="dsc-grade-orig" style="color:${bxMeta.color}">${bxg}</span><span class="dsc-arrow">→</span><span class="dsc-grade-val" style="color:${meta.color}">${fg}</span>${stTag}`
      : `<span class="dsc-grade-val" style="color:${meta.color}">${fg}</span>${stTag}`;
    let rsRowsHTML = "";
    if (rs) {
      const fmt = v => v == null ? "N/A" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
      const pc  = v => v == null ? "var(--fg-0)" : v >= 0 ? "var(--up)" : "var(--down)";
      rsRowsHTML = `
        <div class="dsc-rs-table">
          <div class="dsc-rs-row dsc-rs-hdr">
            <span class="dsc-rs-lbl">股票 20d</span>
            <span style="color:${pc(rs.stockRet)};font-weight:700;font-family:var(--f-mono);font-size:11px">${fmt(rs.stockRet)}</span>
            <span style="color:var(--fg-3);font-size:10px;font-family:var(--f-mono)">VOO ${fmt(rs.vooRet)}</span>
            <span class="dsc-rs-badge">RS ${rs.score}/${rs.max}</span>
          </div>
          ${rs.hasSect ? `
          <div class="dsc-rs-row">
            <span class="dsc-rs-lbl">vs ETF</span>
            <span style="color:${pc(rs.vsSect)};font-family:var(--f-mono);font-size:11px">${fmt(rs.vsSect)}</span>
            <span style="color:var(--fg-3);font-size:10px;font-family:var(--f-mono)">ETF ${fmt(rs.sectRet)}</span>
            <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--fg-3)">${rs.sectScore}/5</span>
          </div>
          <div class="dsc-rs-row">
            <span class="dsc-rs-lbl">ETF/VOO</span>
            <span style="color:${pc(rs.sectVsVOO)};font-family:var(--f-mono);font-size:11px">${fmt(rs.sectVsVOO)}</span>
            <span></span>
            <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--fg-3)">${rs.sectBonusScore}/5</span>
          </div>` : ""}
          <div class="dsc-rs-row">
            <span class="dsc-rs-lbl">vs VOO</span>
            <span style="color:${pc(rs.vsVOO)};font-family:var(--f-mono);font-size:11px">${fmt(rs.vsVOO)}</span>
            <span></span>
            <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--fg-3)">${rs.vooScore}/5</span>
          </div>
          ${rs.volScore != null ? `
          <div class="dsc-rs-row">
            <span class="dsc-rs-lbl">涨跌量比</span>
            <span style="color:${rs.volRatio >= 55 ? "var(--up)" : rs.volRatio >= 45 ? "var(--fg-0)" : "var(--down)"};font-family:var(--f-mono);font-size:11px">${rs.volRatio.toFixed(1)}%</span>
            <span style="color:var(--fg-3);font-size:10px">${rs.volRatio > 65 ? "积累" : rs.volRatio > 55 ? "偏多" : rs.volRatio >= 45 ? "中性" : rs.volRatio >= 35 ? "偏空" : "派发"}</span>
            <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--fg-3)">${rs.volScore}/5</span>
          </div>` : ""}
        </div>`;
    }
    return `
      <div class="dsc-entry">
        <div class="dsc-grade-row">
          <div class="dsc-grade-chip">${gradeChip}</div>
          <div class="dsc-grade-info">
            <div style="color:${meta.color};font-size:12px;font-weight:600">${meta.action}</div>
            <div style="color:var(--fg-3);font-size:10.5px">${meta.desc}</div>
            <div style="font-size:11px;color:var(--fg-2)">建议仓位 <strong style="color:var(--fg-0)">${meta.pos}</strong></div>
          </div>
        </div>
        ${rsRowsHTML}
      </div>`;
  }

  function _updateWlEntryGrade(content, idx, item) {
    const el = $(`.wl-entry-result[data-wl-idx="${idx}"]`, content);
    if (el) el.innerHTML = _wlEntryGradeHTML(item);
  }

  async function fetchWatchlistPrices() {
    if (!WATCHLIST.length) return;
    const syms = [...new Set(WATCHLIST.map(w => w.sym))];
    try {
      const res = await fetch(`/api/quote?stocks=${encodeURIComponent(syms.join(","))}`);
      if (!res.ok) return;
      const { results } = await res.json();
      $$("[data-wl-price-sym]").forEach(el => {
        const sym = el.dataset.wlPriceSym;
        const r   = results?.[sym];
        if (!r?.last) return;
        const pct = r.prevClose > 0 ? (r.last - r.prevClose) / r.prevClose * 100 : null;
        el.querySelector(".wl-live-price").textContent = `$${price(r.last)}`;
        const chgEl = el.querySelector(".wl-live-chg");
        if (pct != null) {
          chgEl.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
          chgEl.style.color = pct >= 0 ? "var(--up)" : "var(--down)";
          chgEl.style.fontWeight = "600";
        } else {
          chgEl.textContent = "实时";
          chgEl.style.color = "";
        }
      });
    } catch (_) {}
  }

  function watchlistCardHTML(item, idx, analysis = null) {
    // ── 基本分析 section ──────────────────────────────────────────
    const grade    = analysis?.scores?.grade || item._aiGrade;
    const bxScore  = analysis?.scores?.overall ?? item.bxScore;
    const gradeLetterColor = l => l === "A" ? "var(--up)" : l === "B" ? "var(--accent)" : l === "C" ? "var(--warn)" : l === "D" ? "var(--down)" : "var(--fg-2)";
    const gradeColor = gradeLetterColor(grade?.[0]);
    const scoreColor = bxScore >= 70 ? "var(--up)" : bxScore >= 50 ? "var(--warn)" : "var(--down)";

    let basicSection = "";
    if (analysis) {
      const gradeChip = grade
        ? `<span class="wl-chip-grade" style="color:${gradeColor};border-color:${gradeColor};background:color-mix(in oklch,${gradeColor} 12%,transparent)">${grade}</span>`
        : "";
      const scoreSpan = bxScore != null
        ? `<span style="font-family:var(--f-mono);font-size:12px;font-weight:700;color:${scoreColor}">${bxScore}<span style="font-size:9.5px;color:var(--fg-3);font-weight:400">/100</span></span>`
        : "";
      basicSection = `
        <div class="wl-section">
          <div class="wl-section-hd">
            <span class="wl-section-lbl">基本分析</span>
            <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
              ${gradeChip} ${scoreSpan}
            </div>
          </div>
        </div>`;
    }

    // ── 入场分析 section ──────────────────────────────────────────
    const bx = item._bx || { daily: 0, weekly: 0, monthly: 0 };
    const periodRow = (label, period) => {
      const cur  = bx[period] ?? 0;
      const btns = BX_SCORE_OPTS.map(o => `
        <button type="button" class="bx-score-btn wl-bx-btn ${o.cls} ${cur === o.val ? "active" : ""}"
                data-wl-idx="${idx}" data-period="${period}" data-val="${o.val}">
          <span class="bx-val">${o.label}</span>
          <span class="bx-sub">${o.sub}</span>
        </button>`).join("");
      return `<div class="bx-row">
        <div class="bx-row-label">${label}</div>
        <div class="bx-score-seg">${btns}</div>
      </div>`;
    };
    const sectorEtf = bx.sectorEtf || "";
    const wlST = item._wlST;
    const stBtns = [
      { val: "null",  cls: "bx-neu",  label: "—",  sub: "未填" },
      { val: "true",  cls: "bx-up",   label: "▲",  sub: "做多" },
      { val: "false", cls: "bx-down", label: "▼",  sub: "做空" },
    ].map(o => `<button type="button" class="bx-st-btn wl-st-btn ${o.cls} ${String(wlST ?? null) === o.val ? "active" : ""}" data-wl-idx="${idx}" data-wl-st="${o.val}"><span class="bx-val">${o.label}</span><span class="bx-sub">${o.sub}</span></button>`).join("");
    const entrySection = `
      <div class="wl-section">
        <div class="wl-section-hd"><span class="wl-section-lbl">入场分析</span></div>
        <div class="wl-bx-rs-grid">
          <div class="wl-module wl-bx-compact">
            <div class="wl-module-hd">BX 趋势评分</div>
            ${periodRow("Current BX", "daily")}
            ${periodRow("Weekly BX", "weekly")}
            ${periodRow("Monthly BX", "monthly")}
            <div class="bx-row" style="margin-top:4px">
              <div class="bx-row-label">SuperTrend <span style="color:var(--accent);font-size:9px;text-transform:none;letter-spacing:0;font-weight:400">(日线)</span></div>
              <div class="bx-st-seg">${stBtns}</div>
            </div>
          </div>
          <div class="wl-module" style="display:flex;flex-direction:column;gap:8px">
            <div class="wl-module-hd" style="margin-bottom:2px">相对强度 RS</div>
            <div class="bx-etf-row">
              <input type="text" class="bx-etf-input wl-rs-etf" data-wl-idx="${idx}"
                     placeholder="如 XLK / XLB" maxlength="8" autocomplete="off" spellcheck="false"
                     value="${sectorEtf}"/>
              <button type="button" class="bx-rs-calc-btn wl-rs-calc-btn" data-wl-idx="${idx}">计算 RS</button>
            </div>
            <div class="wl-entry-result" data-wl-idx="${idx}">${_wlEntryGradeHTML(item)}</div>
          </div>
        </div>
      </div>`;

    return `<div class="wl-card">
      <div class="wl-card-main">
        <div class="jc-ticker" style="min-width:140px">
          <div class="avatar">${logoImg(item)}${item.sym.slice(0, 4)}</div>
          <div>
            <div class="mono" style="font-size:13px;font-weight:600">${item.sym}</div>
            <div class="muted" style="font-size:10.5px">${item.name}</div>
          </div>
        </div>
        <div class="wl-price" data-wl-price-sym="${item.sym}">
          <span class="wl-live-price mono" style="font-size:13px;font-weight:600">${item.price ? `$${price(item.price)}` : "—"}</span>
          <span class="wl-live-chg muted" style="font-size:9.5px">${item.price ? "参考价" : "—"}</span>
        </div>
        <div class="wl-actions">
          <button class="btn primary wl-add-pos" data-idx="${idx}" style="font-size:11.5px;padding:6px 12px">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>入仓
          </button>
          <button class="btn wl-delete" data-idx="${idx}" style="color:var(--down);border-color:var(--down-dim);padding:6px 10px">✕</button>
        </div>
      </div>
      ${basicSection}
      ${entrySection}
      <textarea class="wl-note journal-note-area" data-idx="${idx}" rows="2"
                placeholder="观察笔记、入场条件、关键价位…">${item.note || ""}</textarea>
    </div>`;
  }

  function wireWatchlistForm() {
    const form      = $("#wl-add-form");
    const toggleBtn = $("#wl-toggle-form");
    const formBody  = $("#wl-form-body");
    if (!form) return;

    if (toggleBtn && formBody) {
      toggleBtn.addEventListener("click", () => {
        const hidden = formBody.style.display === "none";
        formBody.style.display = hidden ? "" : "none";
        toggleBtn.textContent = hidden ? "取消" : "+ 手动添加";
      });
    }

    form.addEventListener("submit", e => {
      e.preventDefault();
      const sym = ($("#wl-sym").value || "").toUpperCase().trim();
      if (!sym) return;
      if (WATCHLIST.find(w => w.sym === sym)) { alert("已在观察列表中"); return; }
      WATCHLIST.push({
        sym, name: $("#wl-name").value.trim() || sym,
        color: "oklch(0.35 0.01 250)",
        price: parseFloat($("#wl-price").value) || null,
        note: "", addedAt: new Date().toISOString().slice(0, 10),
      });
      saveToStorage();
      form.reset();
      if (formBody) formBody.style.display = "none";
      if (toggleBtn) toggleBtn.textContent = "+ 手动添加";
      renderWatchlist();
    });

    // ── AI Analyze Form ───────────────────────────────────────────────────────
    const analyzeForm = $("#wl-analyze-form");
    if (!analyzeForm) return;
    const analyzeInput = $("#wl-analyze-sym");
    // Auto-uppercase as the user types (CSS shows uppercase; keep the value in sync)
    analyzeInput?.addEventListener("input", () => {
      const p = analyzeInput.selectionStart;
      analyzeInput.value = analyzeInput.value.toUpperCase();
      try { analyzeInput.setSelectionRange(p, p); } catch (_) {}
    });
    analyzeForm.addEventListener("submit", async e => {
      e.preventDefault();
      const raw = (analyzeInput.value || "").toUpperCase().trim();
      if (!raw) return;
      await triggerAnalysis(raw, false);
    });

    renderAnalysisHistory();
  }

  // ── Persistent analysis history (in-memory + cloud sync) ──────────────────
  function saHistTimeStr(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    const today = new Date().toLocaleDateString("en-CA");
    if (d.toLocaleDateString("en-CA") === today) {
      return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    }
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function saDateLabel(dateStr) {
    const today     = new Date().toLocaleDateString("en-CA");
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
    if (dateStr === today)     return "今天";
    if (dateStr === yesterday) return "昨天";
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function recordAnalysis(sym, data, forceNow = false) {
    // Anchor date to when the analysis was actually done (savedAt), not the
    // current wall clock. This way, re-viewing a cached result from yesterday
    // updates the existing yesterday entry in place and doesn't create a new
    // "today" entry that would push the record to the top of the time sort.
    const savedAt = forceNow ? Date.now() : (data._savedAt ?? Date.now());
    const date    = new Date(savedAt).toLocaleDateString("en-CA");
    const entry = {
      sym,
      grade:     data.scores?.grade ?? "",
      overall:   data.scores?.overall ?? 50,
      name:      data.name ?? "",
      price:     typeof data.price === "number" ? data.price : null,
      savedAt,
      date,
      _fullData: { ...data, _date: date, _savedAt: savedAt },  // full analysis object for cross-device cache restore
    };
    // One entry per sym per day — update if re-analyzed same day
    const idx = analysisHistory.findIndex(e => e.sym === sym && e.date === date);
    if (idx >= 0) analysisHistory[idx] = entry;
    else          analysisHistory.unshift(entry);
    // Cap at 200 entries
    if (analysisHistory.length > 200) analysisHistory.splice(200);
    saveLocalOnly();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncPush, 2000);
  }

  function getAnalysisHistory() {
    return [...analysisHistory].sort((a, b) => b.savedAt - a.savedAt);
  }

  let _histSort = "time"; // "time" | "score"

  function saHistCardHTML(h) {
    const _gl = h.grade?.[0];
    const gc = _gl === "A" ? "var(--up)" : _gl === "B" ? "var(--accent)" : _gl === "C" ? "var(--warn)" : _gl === "D" ? "var(--down)" : saGradeColor(h.overall);
    const meta = [h.price != null ? `$${h.price.toFixed(2)}` : null, saHistTimeStr(h.savedAt)].filter(Boolean).join(" · ");
    return `<div class="sa-hist-card" data-sym="${h.sym}" data-date="${h.date || ""}">
      <div class="sa-hist-sym">${h.sym}</div>
      ${h.grade ? `<div class="sa-hist-grade" style="color:${gc}">${h.grade}${h.overall != null ? `<span class="sa-hist-score">${h.overall}</span>` : ""}</div>` : ""}
      <div class="sa-hist-info">
        <div class="sa-hist-name">${h.name}</div>
        ${meta ? `<div class="sa-hist-meta">${meta}</div>` : ""}
      </div>
      <div class="sa-hist-arrow">›</div>
      <button class="sa-hist-del" data-sym="${h.sym}" data-date="${h.date || ""}" title="删除记录">✕</button>
    </div>`;
  }

  function renderAnalysisHistory() {
    const el = $("#wl-analyze-history");
    if (!el) return;
    const hist = getAnalysisHistory();
    if (!hist.length) { el.style.display = "none"; el.innerHTML = ""; return; }
    el.style.display = "";

    // Deduplicate by sym — keep only the most recent entry per stock
    const seen = new Set();
    const deduped = hist.filter(h => { if (seen.has(h.sym)) return false; seen.add(h.sym); return true; });

    let sections;
    if (_histSort === "score") {
      // Group by grade letter A→B→C→D, within each group sort by score desc
      const GRADE_ORDER = ["A", "B", "C", "D"];
      const GRADE_COLORS = { A: "var(--up)", B: "var(--accent)", C: "var(--warn)", D: "var(--down)" };
      const groups = new Map(GRADE_ORDER.map(g => [g, []]));
      const noGrade = [];
      deduped.forEach(h => {
        const letter = h.grade?.[0] || (h.overall != null ? (h.overall >= 80 ? "A" : h.overall >= 65 ? "B" : h.overall >= 50 ? "C" : "D") : null);
        if (letter && groups.has(letter)) groups.get(letter).push(h);
        else noGrade.push(h);
      });
      const gradeBlocks = GRADE_ORDER
        .filter(g => groups.get(g).length > 0)
        .map(g => {
          const items = [...groups.get(g)].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
          return `<div class="wl-hist-group">
            <div class="wl-hist-grade-lbl" style="color:${GRADE_COLORS[g]}">${g}</div>
            <div class="wl-hist-cards">${items.map(saHistCardHTML).join("")}</div>
          </div>`;
        });
      if (noGrade.length) {
        const ranked = noGrade.sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
        gradeBlocks.push(`<div class="wl-hist-group">
          <div class="wl-hist-date-lbl">其他</div>
          <div class="wl-hist-cards">${ranked.map(saHistCardHTML).join("")}</div>
        </div>`);
      }
      sections = gradeBlocks.join("");
    } else {
      // Group by the most-recent analysis date, most recent first
      const groups = new Map();
      deduped.forEach(h => {
        const d = h.date || new Date(h.savedAt).toLocaleDateString("en-CA");
        if (!groups.has(d)) groups.set(d, []);
        groups.get(d).push(h);
      });
      const sortedDates = [...groups.keys()].sort((a, b) => b.localeCompare(a));
      sections = sortedDates.map(date => `<div class="wl-hist-group">
        <div class="wl-hist-date-lbl">${saDateLabel(date)}</div>
        <div class="wl-hist-cards">${groups.get(date).map(saHistCardHTML).join("")}</div>
      </div>`).join("");
    }

    el.innerHTML = `<div class="wl-hist-head">
      <div class="wl-hist-lbl">分析记录</div>
      <div class="wl-hist-sort">
        <button data-sort="time" class="${_histSort === "time" ? "active" : ""}">时间</button>
        <button data-sort="score" class="${_histSort === "score" ? "active" : ""}">评级</button>
      </div>
    </div>${sections}`;
    $$(".wl-hist-sort button", el).forEach(btn => {
      btn.addEventListener("click", () => {
        _histSort = btn.dataset.sort;
        renderAnalysisHistory();
      });
    });
    $$(".sa-hist-card", el).forEach(card => {
      card.addEventListener("click", e => {
        if (e.target.closest(".sa-hist-del")) return; // let del button handle itself
        triggerAnalysis(card.dataset.sym, false);
      });
    });
    $$(".sa-hist-del", el).forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        if (!btn.dataset.confirming) {
          btn.dataset.confirming = "1";
          btn.textContent = "确认?";
          btn.style.color = "var(--down)";
          btn.style.opacity = "1";
          btn._confirmTimer = setTimeout(() => {
            btn.dataset.confirming = "";
            btn.textContent = "✕";
            btn.style.color = "";
            btn.style.opacity = "";
          }, 3000);
          return;
        }
        clearTimeout(btn._confirmTimer);
        const sym = btn.dataset.sym;
        for (let i = analysisHistory.length - 1; i >= 0; i--) {
          if (analysisHistory[i].sym === sym) analysisHistory.splice(i, 1);
        }
        try { localStorage.removeItem(`wl_analysis_${sym}`); } catch (_) {}
        saveLocalOnly();
        clearTimeout(syncTimer); syncTimer = setTimeout(syncPush, 2000);
        renderAnalysisHistory();
      });
    });
  }

  // ── Scoring rules panel (collapsible, rendered once) ─────────────────────
  function renderScoringRulesPanel() {
    const el = $("#wl-scoring-rules");
    if (!el || el._rendered) return;
    el._rendered = true;

    const sub = lbl => `<div class="wl-scoring-sub">${lbl}</div>`;
    const rows = arr => arr.map(([cond, delta]) => {
      const cls = delta > 0 ? "pos" : delta < 0 ? "neg" : "neu";
      const d   = delta > 0 ? `+${delta}` : delta === 0 ? "±0" : String(delta);
      return `<div class="wl-scoring-row"><span class="wl-scoring-cond">${cond}</span><span class="wl-scoring-delta ${cls}">${d}</span></div>`;
    }).join("");
    const dim = (en, zh, wt, body) => `
      <div class="wl-scoring-dim">
        <div class="wl-scoring-dim-head">
          <span>${en} <span class="wl-scoring-dim-zh">${zh}</span></span>
          <span class="wl-scoring-wt">${wt}</span>
        </div>${body}
      </div>`;

    el.innerHTML = `
      <button class="wl-scoring-toggle" aria-expanded="false" id="wl-scoring-toggle">
        <span class="wl-scoring-chevron">▸</span>评分规则 · 五维度权重说明
      </button>
      <div class="wl-scoring-body" id="wl-scoring-body">
        <div class="wl-scoring-grid">
          ${dim("Trend","技术走势","30%",`
            ${sub("均线结构")}
            ${rows([["价格>EMA50>EMA200",35],["价格>EMA50",15],["价格>EMA200",5],["均线下方",-20]])}
            ${sub("RSI")}
            ${rows([["45–65",15],["65–75 / 35–45",5],[">75",-12],["<35",-5]])}
            ${sub("52周位置")}
            ${rows([["≥75% 区间",5],["≤25% 区间",-5]])}
            ${sub("RS vs VOO (20日)")}
            ${rows([[">15pp",12],["5–15pp",8],["0–5pp",4],["0~−5pp",0],["−5~−10pp",-6],["<−10pp",-12]])}
            ${sub("RS vs 行业ETF (20日)")}
            ${rows([[">10pp",8],["3–10pp",4],["−3~3pp",0],["−10~−3pp",-4],["<−10pp",-8]])}
            ${sub("涨跌量比 (20日)")}
            ${rows([[">65%",10],["55–65%",5],["45–55%",0],["35–45%",-5],["<35%",-10]])}
          `)}
          ${dim("Valuation","估值","20%",`
            ${sub("PEG (优先使用)")}
            ${rows([["<0.75",25],["0.75–1.2",15],["1.2–2.0",0],["2.0–3.0",-15],[">3.0",-25]])}
            ${sub("PE (PEG缺失时)")}
            ${rows([["<0 (亏损)",-10],["<15",20],["15–22",12],["22–30",0],["30–45",-15],[">45",-25]])}
            ${sub("P/S")}
            ${rows([["<1.5",5],["10–20",-5],[">20",-10]])}
            ${sub("EV/EBITDA")}
            ${rows([["<10",8],["10–20",3],["20–35",0],["35–60",-8],[">60",-15]])}
          `)}
          ${dim("Growth","成长","20%",`
            ${sub("营收增速 (YoY)")}
            ${rows([[">30%",28],["20–30%",20],["10–20%",12],["3–10%",6],["0–3%",2],["−10~0%",-12],["<−10%",-20]])}
            ${sub("EPS增速 (YoY)")}
            ${rows([[">25%",12],["10–25%",8],["0–10%",3],["<−15%",-10]])}
            ${sub("EPS超预期 (连续季度)")}
            ${rows([["≥4次全超",8],["最近3次全超",5],["最近2次不及",-8]])}
          `)}
          ${dim("Financial","财务","20%",`
            ${sub("净利润率")}
            ${rows([[">20%",16],["10–20%",10],["3–10%",5],["<0%",-16]])}
            ${sub("毛利率")}
            ${rows([[">60%",8],["40–60%",5],["<15%",-5]])}
            ${sub("ROE")}
            ${rows([[">30%",10],["15–30%",6],["<0%",-8]])}
            ${sub("负债率 D/E")}
            ${rows([["<0.3",5],["2–3",-6],[">3",-12]])}
            ${sub("流动比率")}
            ${rows([["≥2",5],["<1",-8]])}
            ${sub("FCF质量")}
            ${rows([["正且 FCF/净利>80%",6],["正FCF",4],["负FCF",-6]])}
          `)}
          ${dim("Analyst","分析师","10%",`
            ${sub("分析师评级")}
            ${rows([["强烈买入",25],["买入",18],["中性",0],["减持",-18],["卖出",-30]])}
            ${sub("目标价涨幅")}
            ${rows([[">40%",15],["20–40%",10],["10–20%",5],["0–10%",2],["−10~0%",-5],["<−10%",-15]])}
            ${sub("分析师覆盖")}
            ${rows([["≥10家",3]])}
          `)}
        </div>
        <div style="margin-top:10px;padding:0 2px">
          <div class="wl-scoring-sub">评级对照 · 综合得分</div>
          <div class="wl-scoring-grade-row">
            ${[["A","88"],["A−","82"],["B+","76"],["B","70"],["B−","64"],["C+","58"],["C","50"],["D","<50"]].map(([g,t])=>`<div class="wl-scoring-grade-chip">${g}<span style="color:var(--fg-3);font-weight:400"> ≥${t}</span></div>`).join("")}
          </div>
          <div style="font-size:9px;color:var(--fg-3);margin-top:6px;line-height:1.6">基准分 50（无数据=中性）· 综合分 = 趋势×30% + 估值×20% + 成长×20% + 健康×20% + 分析师×10%</div>
        </div>
      </div>`;

    const toggle = $("#wl-scoring-toggle");
    const body   = $("#wl-scoring-body");
    if (toggle && body) {
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") === "true";
        toggle.setAttribute("aria-expanded", open ? "false" : "true");
        body.classList.toggle("open", !open);
      });
    }
  }

  // ── Stock analysis: localStorage cache + API call ─────────────────────────
  async function fetchStockAnalysis(sym, force = false) {
    const key = `wl_analysis_${sym}`;
    if (!force) {
      // 1. Check localStorage (same device) — re-derive scores/badge on read
      // Require rs20d + volUpDownRatio: caches from before v72 lack them and must refresh
      try {
        const c = JSON.parse(localStorage.getItem(key) || "null");
        if (c?._date && "rs20d" in c && "volUpDownRatio" in c) {
          _upgradeAnalysis(c);
          try { localStorage.setItem(key, JSON.stringify(c)); } catch (_) {}
          return c;
        }
      } catch (_) {}
      // 2. Check history _fullData (cross-device: another device synced this)
      const histEntry = analysisHistory.find(e => e.sym === sym && e._fullData?._date);
      if (histEntry?._fullData) {
        _upgradeAnalysis(histEntry._fullData); // mutates the stored object in place
        // Restore to localStorage so future lookups are instant
        try { localStorage.setItem(key, JSON.stringify(histEntry._fullData)); } catch (_) {}
        return histEntry._fullData;
      }
    }
    const today = new Date().toLocaleDateString("en-CA");
    const r = await fetch(`/api/stock-analysis?sym=${encodeURIComponent(sym)}${force ? "&force=1" : ""}`);
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    _upgradeAnalysis(data);
    try { localStorage.setItem(key, JSON.stringify({ ...data, _date: today, _savedAt: Date.now() })); } catch (_) {}
    return data;
  }

  // ── Trigger analysis: manage loading / error / render ────────────────────
  async function triggerAnalysis(sym, force = false) {
    const panel = $("#wl-analysis-panel");
    const btn   = $("#wl-analyze-btn");
    const input = $("#wl-analyze-sym");
    if (!panel) return;

    // Loading state
    panel.style.display = "";
    panel.innerHTML = `<div class="sa-loading">
      <div class="sa-spinner"></div>
      <div>
        <div>正在分析 <span class="mono" style="color:var(--fg-0);font-weight:700">${sym}</span>…</div>
        <div style="font-size:11px;color:var(--fg-3);margin-top:3px">拉取财务数据 · 计算技术指标 · AI 综合解读</div>
      </div>
    </div>`;
    if (btn) { btn.disabled = true; btn.textContent = "分析中…"; }

    try {
      const data = await fetchStockAnalysis(sym, force);
      renderAnalysisPanel(data);
      if (input) input.value = "";
    } catch (e) {
      panel.innerHTML = `<div class="sa-loading" style="color:var(--down)">
        <div style="font-size:20px">✕</div>
        <div>
          <div>分析失败：${e.message}</div>
          <div style="font-size:11px;color:var(--fg-3);margin-top:3px">请检查股票代码是否正确，或稍后重试</div>
        </div>
      </div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg> AI 分析`; }
    }
    // Record history after the panel renders — never let this block the display
    try {
      const cached = JSON.parse(localStorage.getItem(`wl_analysis_${sym}`) || "null");
      // forceNow=true only when user explicitly re-analyzes (force=true), so the
      // timestamp updates on genuine re-analysis but not on cache/history re-views.
      if (cached) { recordAnalysis(sym, cached, force); renderAnalysisHistory(); }
    } catch (_) {}
  }

  // ── Format section body: **bold** + bullet lines ─────────────────────────
  function formatSectionBody(text) {
    return text
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .split('\n')
      .filter(l => {
        const t = l.trim();
        // drop blank, markdown headings (##), horizontal rules (--, ---, ===)
        return t && !/^#{1,6}(\s|$)/.test(t) && !/^[-=]{2,}$/.test(t);
      })
      .map(line => {
        const t = line.trim();
        if (t.startsWith('•') || (t.startsWith('-') && !t.startsWith('--'))) {
          const content = t.replace(/^[•\-]\s*/, '');
          if (!content) return '';
          const labeled = content.replace(/^([^：:(\n]{1,25}[：:])\s*/,
            (m, label) => `<span class="sa-bl">${label}</span> `);
          return `<div class="sa-bline"><span class="sa-bdot">•</span><span>${labeled}</span></div>`;
        }
        return `<div class="sa-tline">${t}</div>`;
      }).filter(Boolean).join('');
  }

  // ── 5-axis radar pentagon SVG ─────────────────────────────────────────────
  function buildRadarSVG(sc) {
    const axes = [
      { l: "技术",  v: sc.trend     ?? 50 },
      { l: "估值",  v: sc.valuation ?? 50 },
      { l: "成长",  v: sc.growth    ?? 50 },
      { l: "财务",  v: sc.health    ?? 50 },
      { l: "分析师", v: sc.analyst   ?? 50 },
    ];
    const N = 5, cx = 100, cy = 90, r = 62;
    const ang = i => (i / N) * 2 * Math.PI - Math.PI / 2;
    const pt  = (i, f) => [+(cx + r * f * Math.cos(ang(i))).toFixed(1), +(cy + r * f * Math.sin(ang(i))).toFixed(1)];
    const rings = [0.25, 0.5, 0.75, 1].map(f =>
      `<polygon points="${Array.from({length:N},(_,i)=>pt(i,f).join(",")).join(" ")}" fill="none" stroke="oklch(0.26 0.01 250)" stroke-width="0.8"/>`
    ).join("");
    const spokes = Array.from({length:N},(_,i)=>{const[x,y]=pt(i,1);return`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="oklch(0.26 0.01 250)" stroke-width="0.8"/>`;}).join("");
    const dataPts = axes.map((a,i)=>pt(i,a.v/100).join(",")).join(" ");
    const lbls = axes.map((a,i)=>{const[x,y]=pt(i,1.28);return`<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="9.5" fill="oklch(0.58 0.02 250)">${a.l}</text>`;}).join("");
    return `<svg viewBox="0 0 200 185" class="sa-radar" xmlns="http://www.w3.org/2000/svg">${rings}${spokes}<polygon points="${dataPts}" fill="oklch(0.78 0.12 195 / 0.18)" stroke="oklch(0.78 0.12 195)" stroke-width="1.5" stroke-linejoin="round"/>${lbls}</svg>`;
  }

  // ── Grade color helper (also used in history cards) ──────────────────────
  function saGradeColor(score) {
    return score >= 80 ? "var(--up)" : score >= 65 ? "var(--accent)" : score >= 50 ? "var(--warn)" : "var(--down)";
  }

  // ── Deterministic re-scoring (mirror of api/stock-analysis.js) ─────────────
  // Recompute scores + recommendation client-side so existing history records
  // reflect rule changes WITHOUT a new Claude call. All inputs live in the
  // stored _fullData (metrics + technicals). ⚠️ KEEP IN SYNC with the scoring
  // functions and computeRecommendation() in project/api/stock-analysis.js.
  const _clamp = s => Math.max(0, Math.min(100, Math.round(s)));
  function _scoreTrend({ price, ema50, ema200, rsi, wk52High, wk52Low, rsVsVoo, rsVsSector, volUpDownRatio }) {
    if (price == null) return null;
    let s = 50;
    if (ema50 && ema200) {
      if (price > ema50 && ema50 > ema200) s += 35;
      else if (price > ema50)              s += 15;
      else if (price > ema200)             s += 5;
      else                                 s -= 20;
    }
    if (rsi != null) {
      if      (rsi >= 45 && rsi <= 65) s += 15;
      else if (rsi >  65 && rsi <= 75) s += 5;
      else if (rsi >  75)              s -= 12;
      else if (rsi >= 35 && rsi <  45) s += 5;
      else if (rsi <  35)              s -= 5;
    }
    if (wk52High && wk52Low && wk52High > wk52Low) {
      const pos = (price - wk52Low) / (wk52High - wk52Low);
      if (pos > 0.75) s += 5; else if (pos < 0.25) s -= 5;
    }
    if (rsVsVoo != null) {
      if      (rsVsVoo > 15)  s += 12;
      else if (rsVsVoo > 5)   s += 8;
      else if (rsVsVoo > 0)   s += 4;
      else if (rsVsVoo > -5)  s += 0;
      else if (rsVsVoo > -10) s -= 6;
      else                    s -= 12;
    }
    if (rsVsSector != null) {
      if      (rsVsSector > 10)  s += 8;
      else if (rsVsSector > 3)   s += 4;
      else if (rsVsSector > -3)  s += 0;
      else if (rsVsSector > -10) s -= 4;
      else                       s -= 8;
    }
    if (volUpDownRatio != null) {
      if      (volUpDownRatio > 65)  s += 10;
      else if (volUpDownRatio > 55)  s += 5;
      else if (volUpDownRatio >= 45) s += 0;
      else if (volUpDownRatio >= 35) s -= 5;
      else                           s -= 10;
    }
    return _clamp(s);
  }
  function _scoreValuation({ pe, forwardPE, peg, ps, evEbitda }) {
    let s = 50;
    const effPE = (forwardPE != null && forwardPE > 0 && (pe == null || forwardPE < pe)) ? forwardPE : pe;
    if (peg != null && peg > 0) {
      if      (peg < 0.75) s += 25;
      else if (peg < 1.2)  s += 15;
      else if (peg < 2.0)  s +=  0;
      else if (peg < 3.0)  s -= 15;
      else                 s -= 25;
    } else if (effPE != null) {
      if      (effPE < 0)   s -= 10;
      else if (effPE < 15)  s += 20;
      else if (effPE < 22)  s += 12;
      else if (effPE < 30)  s +=  0;
      else if (effPE < 45)  s -= 15;
      else                  s -= 25;
    }
    if (ps != null) {
      if (ps < 1.5) s += 5; else if (ps > 20) s -= 10; else if (ps > 10) s -= 5;
    }
    if (evEbitda != null && evEbitda > 0) {
      if      (evEbitda < 10) s +=  8;
      else if (evEbitda < 20) s +=  3;
      else if (evEbitda < 35) s +=  0;
      else if (evEbitda < 60) s -=  8;
      else                    s -= 15;
    }
    return _clamp(s);
  }
  function _scoreGrowth({ revGrowth, epsGrowth, quarterlyEPS }) {
    let s = 50;
    if (revGrowth != null) {
      if      (revGrowth > 30)  s += 28;
      else if (revGrowth > 20)  s += 20;
      else if (revGrowth > 10)  s += 12;
      else if (revGrowth >  3)  s +=  6;
      else if (revGrowth >  0)  s +=  2;
      else if (revGrowth > -10) s -= 12;
      else                      s -= 20;
    }
    if (epsGrowth != null) {
      if      (epsGrowth > 25)  s += 12;
      else if (epsGrowth > 10)  s +=  8;
      else if (epsGrowth >  0)  s +=  3;
      else if (epsGrowth < -15) s -= 10;
    }
    if (Array.isArray(quarterlyEPS) && quarterlyEPS.length >= 2) {
      const wd = quarterlyEPS.filter(q => q.beat != null);
      if      (wd.length >= 4 && wd.every(q => q.beat))            s +=  8;
      else if (wd.length >= 3 && wd.slice(-3).every(q => q.beat))  s +=  5;
      else if (wd.length >= 2 && wd.slice(-2).every(q => !q.beat)) s -=  8;
    }
    return _clamp(s);
  }
  function _scoreHealth({ netMargin, grossMargin, roe, deRatio, currentRatio, freeCashflow, revenueActual }) {
    let s = 50;
    if (netMargin != null) {
      if      (netMargin > 20) s += 16;
      else if (netMargin > 10) s += 10;
      else if (netMargin >  3) s +=  5;
      else if (netMargin <  0) s -= 16;
    }
    if (grossMargin != null) {
      if      (grossMargin > 60) s +=  8;
      else if (grossMargin > 40) s +=  5;
      else if (grossMargin < 15) s -=  5;
    }
    if (roe != null) {
      if (roe > 30) s += 10; else if (roe > 15) s += 6; else if (roe < 0) s -= 8;
    }
    if (deRatio != null) {
      if (deRatio < 0.3) s += 5; else if (deRatio > 3.0) s -= 12; else if (deRatio > 2.0) s -= 6;
    }
    if (currentRatio != null) {
      if (currentRatio >= 2) s += 5; else if (currentRatio < 1) s -= 8;
    }
    if (freeCashflow != null) {
      if (freeCashflow > 0) {
        const netIncomeBN = (netMargin != null && revenueActual != null) ? (netMargin / 100) * revenueActual : null;
        if (netIncomeBN != null && netIncomeBN > 0 && freeCashflow / netIncomeBN > 0.8) s += 6;
        else s += 4;
      } else {
        s -= 6;
      }
    }
    return _clamp(s);
  }
  function _scoreAnalyst({ targetUpside, recKey, analystCount }) {
    if (recKey == null && targetUpside == null) return null;
    let s = 50;
    if (recKey) {
      const map = { strongBuy: 25, buy: 18, hold: 0, underperform: -18, sell: -30 };
      s += map[recKey] ?? 0;
    }
    if (targetUpside != null) {
      if      (targetUpside > 40)  s += 15;
      else if (targetUpside > 20)  s += 10;
      else if (targetUpside > 10)  s +=  5;
      else if (targetUpside >  0)  s +=  2;
      else if (targetUpside < -10) s -= 15;
      else if (targetUpside <  0)  s -=  5;
    }
    if (analystCount != null && analystCount >= 10) s += 3;
    return _clamp(s);
  }
  function _gradeFrom(score) {
    if (score >= 88) return "A";
    if (score >= 82) return "A-";
    if (score >= 76) return "B+";
    if (score >= 70) return "B";
    if (score >= 64) return "B-";
    if (score >= 58) return "C+";
    if (score >= 50) return "C";
    return "D";
  }
  function recomputeScores(d) {
    const m = d.metrics || {};
    const s = {
      trend:     _scoreTrend({ price: d.price, ema50: d.ema50, ema200: d.ema200, rsi: d.rsi, wk52High: d.wk52High, wk52Low: d.wk52Low, rsVsVoo: d.rs20d?.voo ?? null, rsVsSector: d.rs20d?.sector ?? null, volUpDownRatio: d.volUpDownRatio ?? null }),
      valuation: _scoreValuation({ pe: m.pe, forwardPE: m.forwardPE, peg: m.peg, ps: m.ps, evEbitda: m.evEbitda }),
      growth:    _scoreGrowth({ revGrowth: m.revGrowth, epsGrowth: m.epsGrowth, quarterlyEPS: d.quarterlyEPS }),
      health:    _scoreHealth({ netMargin: m.netMargin, grossMargin: m.grossMargin, roe: m.roe, deRatio: m.deRatio, currentRatio: m.currentRatio, freeCashflow: m.freeCashflow, revenueActual: m.revenueActual }),
      analyst:   _scoreAnalyst({ targetUpside: d.analyst?.targetUpside, recKey: d.analyst?.recKey, analystCount: d.analyst?.analystCount }),
    };
    s.overall = Math.round((s.trend ?? 50) * 0.30 + (s.valuation ?? 50) * 0.20 + (s.growth ?? 50) * 0.20 + (s.health ?? 50) * 0.20 + (s.analyst ?? 50) * 0.10);
    s.grade = _gradeFrom(s.overall);
    return s;
  }
  function computeRecommendation(d, scores) {
    const { price, ema50, ema200, rsi, daysToEarnings } = d;
    const ov  = scores.overall   ?? 50;
    const val = scores.valuation ?? 50;
    const gr  = scores.growth    ?? 50;
    const nm  = d.metrics?.netMargin;
    const e50 = ema50 != null ? `$${ema50.toFixed(0)}` : null;
    const mk  = (action, label, entry) => ({ action, label, entry });
    // Gates
    if (price != null && ema200 != null && price < ema200)
      return mk("avoid", "建议回避", `价格已破EMA200，趋势偏空，暂不入场`);
    if (ov < 45)
      return mk("avoid", "建议回避", `综合评分偏低，基本面或技术面存在明显问题`);
    if (nm != null && nm < 0 && gr < 55)
      return mk("avoid", "建议回避", `亏损企业且增速不足以支撑估值，风险偏高`);
    if (rsi != null && rsi > 75)
      return mk("wait", "等待信号", `RSI ${rsi.toFixed(0)} 超买，等待回落至65以下再评估入场`);
    if (daysToEarnings != null && daysToEarnings <= 14)
      return mk("wait", "等待信号", `${daysToEarnings}天后财报，建议财报后再决定入场时机`);
    // Grading
    if (price != null && ema50 != null && ema200 != null &&
        price > ema50 && ema50 > ema200 &&
        rsi != null && rsi >= 42 && rsi <= 68 &&
        ov >= 70 && val >= 45)
      return mk("strong", "积极进场", e50 ? `多头排列成立，可分批建仓，止损参考EMA50(${e50})以下` : `多头排列成立，可分批建仓`);
    if (price != null && ema50 != null && price >= ema50 && ov >= 60)
      return mk("immediate", "立即关注", e50 ? `价格站稳EMA50(${e50})，等待量价配合信号入场` : `等待量价配合信号入场`);
    return mk("watch", "可以关注", e50 ? `持续观察，回调至EMA50(${e50})区域可考虑入场` : `持续观察，等待更好入场时机`);
  }
  // Re-derive scores + recommendation in place (idempotent). Lets cached/older
  // analyses pick up scoring-rule changes on open with no API call.
  function _upgradeAnalysis(d) {
    if (!d || typeof d !== "object" || d.price == null) return d;
    try {
      const s = recomputeScores(d);
      d.scores = s;
      d.recommendation = computeRecommendation(d, s);
    } catch (_) {}
    return d;
  }

  // ── Score dimension breakdown: per-stock factor attribution ──────────────
  function buildDimBreakdown(dim, data) {
    const m   = data.metrics || {};
    const fN  = (v, d = 1) => v != null ? String(parseFloat(v.toFixed(d))) : "—";
    const fPc = v => v != null ? `${fN(v)}%` : "—";
    const row = (lbl, val, delta) => ({ lbl, val, delta, cls: delta > 0 ? "pos" : delta < 0 ? "neg" : "neu" });
    const WEIGHTS = { trend: "30%", valuation: "20%", growth: "20%", health: "20%", analyst: "10%" };
    const TITLES  = { trend: "技术面", valuation: "估值", growth: "成长性", health: "财务", analyst: "分析师" };
    const BASES   = { trend: 50, valuation: 50, growth: 50, health: 50, analyst: 50 };
    const rows = [{ lbl: "基准分", val: "", delta: BASES[dim] ?? 50, cls: "base" }];

    if (dim === "trend") {
      const { price, ema50, ema200, rsi, wk52High, wk52Low } = data;
      if (ema50 && ema200 && price) {
        if (price > ema50 && ema50 > ema200)      rows.push(row("多头排列 (price > EMA50 > EMA200)", "✓", +35));
        else if (price > ema50)                    rows.push(row("价格在EMA50之上", "✓", +15));
        else if (price > ema200)                   rows.push(row("价格在EMA200之上，EMA50以下", "✓", +5));
        else                                       rows.push(row("价格低于EMA200 (空头区域)", "✗", -20));
      }
      if (rsi != null) {
        if      (rsi >= 45 && rsi <= 65) rows.push(row("RSI 健康区间 (45~65)", fN(rsi), +15));
        else if (rsi >  65 && rsi <= 75) rows.push(row("RSI 偏热 (65~75)", fN(rsi), +5));
        else if (rsi >  75)              rows.push(row("RSI 超买 (>75)", fN(rsi), -12));
        else if (rsi >= 35)              rows.push(row("RSI 偏弱 (35~45)", fN(rsi), +5));
        else                             rows.push(row("RSI 超卖 (<35)", fN(rsi), -5));
      }
      if (wk52High && wk52Low && wk52High > wk52Low && price) {
        const pos = Math.round((price - wk52Low) / (wk52High - wk52Low) * 100);
        if      (pos > 75) rows.push(row("52周高分位 (>75%)", `${pos}%`, +5));
        else if (pos < 25) rows.push(row("52周低分位 (<25%)", `${pos}%`, -5));
        else               rows.push(row("52周分位 (中间区间)", `${pos}%`, 0));
      }
      if (data.rs20d?.voo != null) {
        const rv = data.rs20d.voo;
        const sign = rv >= 0 ? "+" : "";
        const d = rv > 15 ? +12 : rv > 5 ? +8 : rv > 0 ? +4 : rv > -5 ? 0 : rv > -10 ? -6 : -12;
        rows.push(row("RS vs 大盘 (VOO, 20D)", `${sign}${rv.toFixed(1)}%`, d));
      }
      if (data.rs20d?.sector != null) {
        const rs = data.rs20d.sector;
        const etfLabel = data.rs20d.sectorEtf || data.sectorEtf || "板块ETF";
        const sign = rs >= 0 ? "+" : "";
        const d = rs > 10 ? +8 : rs > 3 ? +4 : rs > -3 ? 0 : rs > -10 ? -4 : -8;
        rows.push(row(`RS vs 板块 (${etfLabel}, 20D)`, `${sign}${rs.toFixed(1)}%`, d));
      }
      if (data.volUpDownRatio != null) {
        const v = data.volUpDownRatio;
        const d = v > 65 ? +10 : v > 55 ? +5 : v >= 45 ? 0 : v >= 35 ? -5 : -10;
        const lbl = v > 65 ? "成交量积累" : v > 55 ? "成交量偏多" : v >= 45 ? "成交量中性" : v >= 35 ? "成交量偏空" : "成交量派发";
        rows.push(row(`涨跌量比 (20D) · ${lbl}`, `${v.toFixed(1)}%`, d));
      }
    }
    else if (dim === "valuation") {
      const { pe, forwardPE, peg, ps, evEbitda } = m;
      const effPE = (forwardPE != null && forwardPE > 0 && (pe == null || forwardPE < pe)) ? forwardPE : pe;
      if (peg != null && peg > 0) {
        const d = peg < 0.75 ? +25 : peg < 1.2 ? +15 : peg < 2.0 ? 0 : peg < 3.0 ? -15 : -25;
        rows.push(row("PEG", fN(peg), d));
      } else if (effPE != null) {
        const d = effPE < 0 ? -10 : effPE < 15 ? +20 : effPE < 22 ? +12 : effPE < 30 ? 0 : effPE < 45 ? -15 : -25;
        rows.push(row(forwardPE != null && forwardPE === effPE ? "远期PE" : "PE(TTM)", fN(effPE), d));
      } else {
        rows.push({ lbl: "PE / PEG", val: "无数据", delta: 0, cls: "neu" });
      }
      if (ps != null) {
        const d = ps < 1.5 ? +5 : ps > 20 ? -10 : ps > 10 ? -5 : 0;
        rows.push(row("PS (市销率)", fN(ps), d));
      }
      if (evEbitda != null && evEbitda > 0) {
        const d = evEbitda < 10 ? +8 : evEbitda < 20 ? +3 : evEbitda < 35 ? 0 : evEbitda < 60 ? -8 : -15;
        rows.push(row("EV/EBITDA", fN(evEbitda), d));
      }
    }
    else if (dim === "growth") {
      const { revGrowth, epsGrowth } = m;
      const qeps = data.quarterlyEPS || [];
      if (revGrowth != null) {
        const d = revGrowth > 30 ? +28 : revGrowth > 20 ? +20 : revGrowth > 10 ? +12 : revGrowth > 3 ? +6 : revGrowth > 0 ? +2 : revGrowth > -10 ? -12 : -20;
        rows.push(row("营收增速 (YoY)", fPc(revGrowth), d));
      }
      if (epsGrowth != null) {
        const d = epsGrowth > 25 ? +12 : epsGrowth > 10 ? +8 : epsGrowth > 0 ? +3 : epsGrowth < -15 ? -10 : 0;
        rows.push(row("EPS增速 (YoY)", fPc(epsGrowth), d));
      }
      if (qeps.length >= 2) {
        const wd = qeps.filter(q => q.beat != null);
        const bc = wd.filter(q => q.beat).length;
        const summary = `${bc}/${wd.length}季超预期`;
        if      (wd.length >= 4 && wd.every(q => q.beat))            rows.push(row("连续4季EPS超预期", summary, +8));
        else if (wd.length >= 3 && wd.slice(-3).every(q => q.beat))  rows.push(row("连续3季EPS超预期", summary, +5));
        else if (wd.length >= 2 && wd.slice(-2).every(q => !q.beat)) rows.push(row("连续2季EPS未达预期", summary, -8));
        else                                                           rows.push(row("季度EPS表现", summary, 0));
      }
    }
    else if (dim === "health") {
      const { netMargin, grossMargin, roe, deRatio, currentRatio, freeCashflow, revenueActual } = m;
      if (netMargin != null) {
        const d = netMargin > 20 ? +16 : netMargin > 10 ? +10 : netMargin > 3 ? +5 : netMargin < 0 ? -16 : 0;
        rows.push(row("净利率", fPc(netMargin), d));
      }
      if (grossMargin != null) {
        const d = grossMargin > 60 ? +8 : grossMargin > 40 ? +5 : grossMargin < 15 ? -5 : 0;
        rows.push(row("毛利率", fPc(grossMargin), d));
      }
      if (roe != null) {
        const d = roe > 30 ? +10 : roe > 15 ? +6 : roe < 0 ? -8 : 0;
        rows.push(row("ROE", fPc(roe), d));
      }
      if (deRatio != null) {
        const d = deRatio < 0.3 ? +5 : deRatio > 3.0 ? -12 : deRatio > 2.0 ? -6 : 0;
        rows.push(row("D/E (负债率)", fN(deRatio, 2), d));
      }
      if (currentRatio != null) {
        const d = currentRatio >= 2 ? +5 : currentRatio < 1 ? -8 : 0;
        rows.push(row("流动比率", fN(currentRatio, 2), d));
      }
      if (freeCashflow != null) {
        const netIncomeBN = (netMargin != null && revenueActual != null) ? (netMargin / 100) * revenueActual : null;
        const highQ = freeCashflow > 0 && netIncomeBN != null && netIncomeBN > 0 && freeCashflow / netIncomeBN > 0.8;
        const d = freeCashflow > 0 ? (highQ ? +6 : +4) : -6;
        const lbl = freeCashflow > 0 ? (highQ ? "FCF为正（高质量）" : "FCF为正") : "FCF为负";
        rows.push(row(lbl, `$${fN(freeCashflow, 1)}B`, d));
      }
    }
    else if (dim === "analyst") {
      const { recKey, recLabel, targetUpside, analystCount } = data.analyst || {};
      if (recKey) {
        const map = { strongBuy: +25, buy: +18, hold: 0, underperform: -18, sell: -30 };
        rows.push(row("共识评级", recLabel ?? recKey, map[recKey] ?? 0));
      }
      if (targetUpside != null) {
        const d = targetUpside > 40 ? +15 : targetUpside > 20 ? +10 : targetUpside > 10 ? +5 : targetUpside > 0 ? +2 : targetUpside < -10 ? -15 : -5;
        rows.push(row("目标价空间", fPc(targetUpside), d));
      }
      if (analystCount != null) {
        rows.push(row("分析师覆盖", `${analystCount}位`, analystCount >= 10 ? +3 : 0));
      }
    }

    rows.push({ lbl: "综合得分", val: "", delta: data.scores?.[dim] ?? 0, cls: "total" });
    return { title: `${TITLES[dim] ?? dim}  ·  权重 ${WEIGHTS[dim] ?? "—"}`, rows };
  }

  // ── Metric tip popup: body-level singleton ────────────────────────────────
  // Mounted on document.body — .page-enter keeps transform applied (fill both),
  // which turns ancestors into containing blocks for position:fixed and breaks
  // viewport-based coordinates for any popup nested inside the page.
  let _tipEls = null;
  function ensureTipPopup() {
    if (_tipEls) return _tipEls;
    const overlay = document.createElement("div");
    overlay.className = "sa-tip-overlay";
    const popup = document.createElement("div");
    popup.className = "sa-tip-popup";
    popup.innerHTML = `<div class="sa-tip-hdr">
        <span class="sa-tip-name"></span>
        <span class="sa-tip-close">✕</span>
      </div>
      <div class="sa-tip-body">
        <div class="sa-tip-desc"></div>
        <div class="sa-tip-thresh"></div>
        <div class="sa-tip-bd" style="display:none"></div>
      </div>`;
    document.body.append(overlay, popup);
    const close = () => {
      overlay.classList.remove("open");
      popup.classList.remove("open");
      popup._lastKey = null;
    };
    overlay.addEventListener("click", close);
    popup.querySelector(".sa-tip-close").addEventListener("click", close);
    // Anchored popovers drift when the page scrolls under them — just close
    window.addEventListener("scroll", e => {
      if (!popup.contains(e.target)) close();
    }, { capture: true, passive: true });
    _tipEls = { overlay, popup, close };
    return _tipEls;
  }

  // ── Render full analysis card ─────────────────────────────────────────────
  function renderAnalysisPanel(data) {
    const panel = $("#wl-analysis-panel");
    if (!panel) return;

    const {
      sym, name, industry, exchange, marketCapStr, marketCap, ipoYear, price,
      wk52High, wk52Low, wk52Pos, ema50, ema200, rsi,
      scores, metrics, analyst, quarterlyEPS,
      nextEarnings, daysToEarnings, earningsRisk,
      recommendation, summary, updatedAt,
    } = data;

    // Grade / bar colors
    const gradeColor = g => { const l = g?.[0]; return l === "A" ? "var(--up)" : l === "B" ? "var(--accent)" : l === "C" ? "var(--warn)" : l === "D" ? "var(--down)" : saGradeColor(scores?.overall); };
    const barColor   = s => s >= 75 ? "var(--up)" : s >= 60 ? "var(--accent)" : s >= 45 ? "var(--warn)" : "var(--down)";

    // Recommendation badge style (5 tiers)
    const recStyle = {
      strong:    { bg: "oklch(0.78 0.17 145/0.22)", border: "oklch(0.78 0.17 145/0.7)",  text: "var(--up)",     glow: "0 0 8px oklch(0.78 0.17 145/0.35)" },
      immediate: { bg: "oklch(0.78 0.17 145/0.14)", border: "oklch(0.78 0.17 145/0.45)", text: "var(--up)" },
      watch:     { bg: "oklch(0.78 0.12 195/0.12)", border: "oklch(0.78 0.12 195/0.4)",  text: "var(--accent)" },
      wait:      { bg: "oklch(0.80 0.15 75/0.12)",  border: "oklch(0.80 0.15 75/0.4)",   text: "var(--warn)" },
      avoid:     { bg: "oklch(0.70 0.19 25/0.12)",  border: "oklch(0.70 0.19 25/0.4)",   text: "var(--down)" },
    }[recommendation?.action ?? "watch"] ?? {};

    // Metric formatters
    const fV  = (v, d = 1, s = "x") => v != null ? `${parseFloat(v.toFixed(d))}${s}` : "—";
    const fP  = v => {
      if (v == null) return "—";
      const n = Math.abs(v) < 2 ? v * 100 : v; // normalize if raw decimal
      return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
    };
    const fPn = v => { // no +/- for margins
      if (v == null) return "—";
      const n = Math.abs(v) < 2 ? v * 100 : v;
      return `${n.toFixed(1)}%`;
    };

    // Market cap — computed client-side so format is always fresh (not stuck in Redis cache)
    const mcDisplay = marketCap != null
      ? marketCap >= 1e6  ? `$${(marketCap / 1e6).toFixed(2)}T`
      : marketCap >= 1000 ? `$${(marketCap / 1000).toFixed(1)}B`
      : `$${Math.round(marketCap)}M`
      : (marketCapStr && marketCapStr !== "N/A" ? marketCapStr : null);

    // 52-week bar (minimal redesign: EMA labels above bar, price info below)
    const fPr = v => v == null ? "—" : v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : v.toFixed(0);
    const w52bar = (wk52High && wk52Low && wk52Pos != null) ? (() => {
      const pct = wk52Pos;
      const ptClr = pct >= 65 ? "var(--up)" : pct <= 35 ? "var(--down)" : "var(--warn)";
      const ema50p  = (ema50  && ema50  >= wk52Low && ema50  <= wk52High)
        ? +((ema50  - wk52Low) / (wk52High - wk52Low) * 100).toFixed(1) : null;
      const ema200p = (ema200 && ema200 >= wk52Low && ema200 <= wk52High)
        ? +((ema200 - wk52Low) / (wk52High - wk52Low) * 100).toFixed(1) : null;
      return `<div class="sa-52w">
        <div class="sa-52w-ema-row">
          ${ema200p != null ? `<span class="sa-52w-ema-lbl" style="left:${ema200p}%">EMA 200</span>` : ""}
          ${ema50p  != null ? `<span class="sa-52w-ema-lbl sa-52w-ema-lbl50" style="left:${ema50p}%">EMA 50</span>` : ""}
        </div>
        <div class="sa-52w-track-row">
          <span class="sa-52w-bound">$${fPr(wk52Low)}</span>
          <div class="sa-52w-bar-outer">
            <div class="sa-52w-track">
              ${ema200p != null ? `<div class="sa-52w-etick" style="left:${ema200p}%"></div>` : ""}
              ${ema50p  != null ? `<div class="sa-52w-etick sa-52w-etick50" style="left:${ema50p}%"></div>` : ""}
              <div class="sa-52w-dot" style="left:${pct}%;background:${ptClr}"></div>
            </div>
          </div>
          <span class="sa-52w-bound">$${fPr(wk52High)}</span>
        </div>
        <div class="sa-52w-info">
          <span style="color:${ptClr};font-weight:700">$${fPr(price)}</span>
          <span style="color:${ptClr}">52w ${pct}%分位</span>
        </div>
      </div>`;
    })() : "";

    // Earnings tag
    const earnTag = nextEarnings
      ? `<span class="sa-tag ${earningsRisk === "high" ? "earn-high" : earningsRisk === "moderate" ? "earn-mod" : ""}">财报 ${nextEarnings}（${daysToEarnings}天）</span>` : "";

    // Score bars — clickable for per-stock breakdown
    const scoreBars = [
      { lbl: "技术面",   dim: "trend",     val: scores.trend },
      { lbl: "估值",     dim: "valuation", val: scores.valuation },
      { lbl: "成长性",   dim: "growth",    val: scores.growth },
      { lbl: "财务",     dim: "health",    val: scores.health },
      { lbl: "分析师",   dim: "analyst",   val: scores.analyst },
    ].map(({ lbl, dim, val }) => val != null ? `
      <div class="sa-score-row" data-dim="${dim}" title="点击查看得分明细">
        <div class="sa-score-lbl"><span>${lbl}</span><span class="sa-score-num">${val}</span></div>
        <div class="sa-bar-track"><div class="sa-bar-fill" style="width:${val}%;background:${barColor(val)}"></div></div>
      </div>` : "").join("");

    // Metric color coding helper (key → raw numeric value → CSS color or null)
    const metricColor = (k, raw) => {
      if (raw == null) return null;
      const v = parseFloat(raw); if (isNaN(v)) return null;
      const G = "var(--up)", W = "var(--warn)", R = "var(--down)";
      const m = {
        pe: v<0?R:v<18?G:v<32?null:v<50?W:R, forwardpe: v<0?R:v<18?G:v<30?null:v<45?W:R,
        peg: v<0?R:v<1?G:v<2?null:v<3?W:R, evebitda: v<0?R:v<10?G:v<18?null:v<30?W:R,
        ps: v<2?G:v<8?null:v<20?W:R, pb: v<0?R:v<2?G:v<5?null:W,
        revgrowth: v>20?G:v>8?null:v>0?W:R, epsgrowth: v>20?G:v>5?null:v>0?W:R,
        netmargin: v>15?G:v>5?null:v>0?W:R, grossmargin: v>60?G:v>35?null:v>15?W:R,
        roe: v>20?G:v>10?null:v>0?W:R, roa: v>10?G:v>5?null:v>0?W:R,
        fcf: v>0?G:R, ocf: v>0?G:R, de: v<0.5?G:v<1.5?null:v<3?W:R,
        currentratio: v>2?G:v>1?null:R, rsi14: v>70?W:v<30?W:null,
        quickratio: v>1?G:W, beta: null, divyield: v>3?G:null,
      };
      return m[k] ?? null;
    };

    // Tooltip definitions [title, description, thresholds]
    const METRIC_TIPS = {
      pe:          ["P/E (TTM)", "市盈率，即股价除以过去12个月每股盈利。反映市场愿意为每1元利润支付多少倍价格，是最常用的估值参考。", "< 15  偏低（价值区）\n15–25  合理区间\n25–35  偏贵需注意\n> 35   高估溢价\n负值   公司亏损中"],
      forwardpe:   ["远期 P/E", "前瞻市盈率，股价除以分析师预期下一财年EPS。成长型公司远期PE通常低于TTM PE，更能反映未来增长潜力。", "< 15  低估或低增长\n15–25  合理\n25–40  成长溢价\n> 40   高估值风险"],
      peg:         ["PEG 比率", "市盈增长比，即P/E除以EPS年增速（%）。将估值与增长速度结合，适合对比不同成长阶段的公司。", "< 0.8  低估（增长被忽视）\n0.8–1.2  合理定价\n1.2–2.0  轻度溢价\n> 2.0   增长溢价过高"],
      evebitda:    ["EV/EBITDA", "企业价值除以息税折旧摊销前利润。含债务在内的综合估值，不受资本结构和税率影响，是并购和跨公司比较首选指标。", "< 8    偏低（含杠杆价值）\n8–14   合理区间\n14–20  偏贵\n> 20   高估或重资产溢价"],
      ps:          ["P/S 市销率", "股价除以每股营收。适用于盈利为负的成长期公司，衡量市场对营收的定价。", "< 2    传统行业合理\n2–5    消费/工业正常\n5–15   SaaS/科技可接受\n> 15   需要高增速支撑"],
      pb:          ["P/B 市净率", "股价除以每股净资产（账面价值）。反映市场对公司净资产的溢价，对重资产行业和金融股参考价值最高。", "< 1    低于账面（价值陷阱需甄别）\n1–3    合理溢价\n3–6    轻资产/高ROE\n> 6    高成长溢价，风险上升"],
      revgrowth:   ["收入增速 YoY", "同比营收增长率，反映公司业务规模扩张速度。持续强劲的收入增长是估值溢价的核心支撑。", "> 30%  高速扩张\n15–30%  健康增长\n5–15%  稳健\n0–5%   缓慢\n< 0%   收缩，需关注原因"],
      epsgrowth:   ["EPS 增速 YoY", "每股盈利同比增速。若EPS增速持续高于收入增速，说明利润率在扩张；反之则需关注成本压力。", "> 25%  盈利高速扩张\n10–25%  健康\n0–10%   温和增长\n< 0%   盈利萎缩"],
      netmargin:   ["净利率", "净利润除以总营收，衡量公司将收入转化为最终利润的效率，是竞争壁垒和定价权的综合体现。", "> 25%  卓越（科技/软件）\n15–25%  优秀\n5–15%  合理（行业依赖）\n1–5%   薄利（零售/物流）\n< 0%   亏损中"],
      grossmargin: ["毛利率", "毛利润（营收-直接成本）除以营收。反映产品本身的竞争壁垒和定价权，是利润率的天花板。", "> 70%  极强护城河（SaaS/药品）\n45–70%  优秀\n25–45%  制造业合理\n< 25%  低壁垒或价格竞争激烈"],
      roe:         ["ROE 股本回报率", "净利润除以股东权益，衡量公司利用股东资金创造利润的效率。注意排除高杠杆人为拉高的情况（查看D/E）。", "> 25%  卓越资本配置\n15–25%  优秀\n8–15%  合格\n< 8%   资本效率偏低"],
      roa:         ["ROA 总资产回报率", "净利润除以总资产，衡量公司整体资产的盈利效率，受杠杆影响比ROE小，适合跨资本结构比较。", "> 15%  卓越\n8–15%  优秀\n3–8%   合理\n1–3%   金融行业正常范围\n< 1%   效率偏低"],
      fcf:         ["FCF 自由现金流", "经营现金流减去资本支出，代表企业真实的造血能力。正向FCF可用于回购、分红或再投资，比净利润更难被会计手段粉饰。", "强正值  造血能力强，可回购/分红\n弱正值  维持运营\n负值    扩张期消耗（需结合业务背景判断）"],
      ocf:         ["OCF 经营现金流", "核心业务产生的现金（含非现金费用调整）。应与净利润方向一致；若OCF长期远低于净利润，盈利质量存疑。", "强正值  盈利质量高\n与净利润匹配  正常\n明显低于净利润  应收账款积压？\n负值    核心业务耗现金"],
      de:          ["D/E 负债率", "总债务除以股东权益，反映财务杠杆水平。高D/E在低利率时可放大ROE，但加息或衰退期偿债压力大幅上升。", "< 0.3  极度稳健\n0.3–1.0  健康\n1.0–2.0  中等杠杆，需关注利息覆盖\n> 2.0   高杠杆，偿债风险上升"],
      currentratio:["流动比率", "流动资产除以流动负债，衡量公司在12个月内偿还短期债务的能力。", "> 2.5  充裕但可能资金利用率低\n1.5–2.5  健康\n1.0–1.5  偏紧，需关注现金流\n< 1.0   短期偿付有压力"],
      rsi14:       ["RSI 14日", "相对强弱指数，采用Wilder平滑法计算14日涨跌幅的比率。反映短中期价格动量，>70超买区，<30超卖区。", "70–100  超买区，注意回调风险\n55–70   强势动量区\n45–55   中性震荡\n30–45   偏弱动量\n0–30    超卖区，可能反弹"],
      ema50:       ["EMA 50日", "50日指数移动均线，对近期价格赋予更高权重，是判断短中期趋势的关键参考线。", "价格 > EMA50  短中期趋势偏多\n价格 ≈ EMA50  支撑/压力位测试\n价格 < EMA50  短期趋势偏弱"],
      ema200:      ["EMA 200日", "200日指数移动均线，是判断长期牛熊结构的核心分界线。机构投资者普遍以此作为仓位参考依据。", "价格 > EMA200  长期牛市结构\nEMA50上穿EMA200  金叉，多头信号\nEMA50下穿EMA200  死叉，空头信号\n价格 < EMA200  长期趋势偏空"],
      quickratio:  ["速动比率", "（流动资产 − 存货）除以流动负债。排除了变现能力最弱的存货，比流动比率更保守，适用于存货周转慢的行业。", "> 1.5  充裕\n1.0–1.5  合格\n0.7–1.0  偏紧\n< 0.7   短期流动性压力较大"],
      beta:        ["Beta 系数", "股票相对大盘（S&P 500）的波动敏感度。Beta越高，涨跌幅通常越剧烈，适合不同风险偏好的投资者选择。", "< 0.5   低波动，防御型\n0.5–0.9  稳健，低于市场敏感度\n1.0      与大盘同步\n1.0–1.5  进攻型，放大涨跌\n> 1.5    高波动，高风险高回报"],
      divyield:    ["股息率", "年化每股股息除以股价，反映股东直接收益回报。高股息往往出现在成熟、稳定的行业；成长股通常不分红而选择再投资。", "0%       无分红，再投资扩张\n0.5–1.5%  象征性分红\n1.5–3%   合理回报\n3–5%     较高股息收益\n> 5%     高股息，需核实可持续性"],
    };

    // Metric card builder
    const mkMC = ({ v, l, raw, k }) => {
      const col = metricColor(k, raw);
      return `<div class="sa-mc">
        <div class="sa-mc-val"${col ? ` style="color:${col}"` : ""}>${v}</div>
        <div class="sa-mc-lbl"><span>${l}</span><span class="sa-mc-info" data-tipk="${k}">ⓘ</span></div>
      </div>`;
    };

    // Key metrics — sectioned rows with category labels
    const metricSections = [
      {
        label: "估值", cols: 3,
        items: [
          { v: fV(metrics.pe),        l: "P/E",      raw: metrics.pe,        k: "pe" },
          { v: fV(metrics.forwardPE), l: "远期P/E",   raw: metrics.forwardPE, k: "forwardpe" },
          { v: fV(metrics.peg),       l: "PEG",       raw: metrics.peg,       k: "peg" },
          { v: fV(metrics.evEbitda),  l: "EV/EBITDA", raw: metrics.evEbitda,  k: "evebitda" },
          { v: fV(metrics.ps),        l: "P/S",       raw: metrics.ps,        k: "ps" },
          { v: fV(metrics.pb),        l: "P/B",       raw: metrics.pb,        k: "pb" },
        ],
      },
      {
        label: "成长", cols: 2,
        items: [
          { v: fP(metrics.revGrowth), l: "收入增速", raw: metrics.revGrowth, k: "revgrowth" },
          { v: fP(metrics.epsGrowth), l: "EPS增速",  raw: metrics.epsGrowth, k: "epsgrowth" },
        ],
      },
      {
        label: "盈利能力",
        items: [
          { v: fPn(metrics.netMargin),   l: "净利率", raw: metrics.netMargin,   k: "netmargin" },
          { v: fPn(metrics.grossMargin), l: "毛利率", raw: metrics.grossMargin, k: "grossmargin" },
          { v: fPn(metrics.roe),         l: "ROE",    raw: metrics.roe,         k: "roe" },
          { v: fPn(metrics.roa),         l: "ROA",    raw: metrics.roa,         k: "roa" },
        ],
      },
      {
        label: "财务",
        items: [
          { v: metrics.freeCashflow != null ? `${metrics.freeCashflow >= 0 ? "" : "−"}$${Math.abs(metrics.freeCashflow).toFixed(1)}B` : "—", l: "FCF", raw: metrics.freeCashflow,      k: "fcf" },
          { v: metrics.operatingCashflow != null ? `$${metrics.operatingCashflow.toFixed(1)}B` : "—",                                       l: "OCF", raw: metrics.operatingCashflow, k: "ocf" },
          { v: metrics.deRatio?.toFixed(2)    ?? "—", l: "D/E",    raw: metrics.deRatio,      k: "de" },
          { v: metrics.currentRatio?.toFixed(2) ?? "—", l: "流动比率", raw: metrics.currentRatio, k: "currentratio" },
        ],
      },
    ];

    const metricsHTML = metricSections.map(s => {
      const cols = s.cols ?? 4;
      const style = cols !== 4 ? ` style="grid-template-columns:repeat(${cols},1fr)"` : "";
      return `<div class="sa-sec-label">${s.label}</div>
      <div class="sa-metrics-grid"${style}>${s.items.map(mkMC).join("")}</div>`;
    }).join("");

    const techMetrics = [
      rsi    != null ? { v: rsi.toFixed(1),                          l: "RSI(14)",  raw: rsi,                   k: "rsi14" }      : null,
      ema50  != null ? { v: `$${ema50.toFixed(1)}`,                   l: "EMA50",    raw: ema50,                  k: "ema50" }      : null,
      ema200 != null ? { v: `$${ema200.toFixed(1)}`,                   l: "EMA200",   raw: ema200,                 k: "ema200" }     : null,
      metrics.quickRatio != null ? { v: `${metrics.quickRatio.toFixed(2)}x`, l: "速动比率",  raw: metrics.quickRatio, k: "quickratio" } : null,
      metrics.beta       != null ? { v: metrics.beta.toFixed(2),              l: "Beta",      raw: metrics.beta,       k: "beta" }       : null,
      metrics.divYield   != null ? { v: `${metrics.divYield.toFixed(2)}%`,    l: "股息率",    raw: metrics.divYield,   k: "divyield" }   : null,
    ].filter(Boolean);

    const techStrip = techMetrics.length ? `
      <div class="sa-sec-label">技术指标</div>
      <div class="sa-metrics-grid sa-tech-grid">${techMetrics.map(mkMC).join("")}</div>` : "";

    // Quarterly EPS beat/miss strip (visual summary)
    const epsStripHTML = quarterlyEPS?.length ? `
      <div class="sa-eps-strip">
        <div class="sa-eps-ttl">季度 EPS</div>
        <div class="sa-eps-items">
          ${quarterlyEPS.map(q => {
            const bc = q.beat === true ? "beat" : q.beat === false ? "miss" : "na";
            const av = q.actual   != null ? `$${Math.abs(q.actual)   < 0.1 ? q.actual.toFixed(3)   : q.actual.toFixed(2)}` : "—";
            const ev = q.estimate != null ? `e${Math.abs(q.estimate) < 0.1 ? q.estimate.toFixed(3) : q.estimate.toFixed(2)}` : "";
            return `<div class="sa-eps-q">
              <div class="sa-eps-dot ${bc}">${q.beat===true?"✓":q.beat===false?"✗":"·"}</div>
              <div class="sa-eps-val ${bc}">${av}</div>
              ${ev ? `<div class="sa-eps-est">${ev}</div>` : ""}
              <div class="sa-eps-per">${q.period}</div>
            </div>`;
          }).join("")}
        </div>
      </div>` : "";

    // Parse Claude sections
    const secNames = ["公司简介", "估值分析", "成长性", "盈利与现金流", "财务健康", "技术面", "综合建议"];
    const sections = secNames.map(n => {
      const m = summary?.match(new RegExp(`【${n}】\\s*([\\s\\S]*?)(?=【|$)`));
      return m ? { n, body: m[1].trim() } : null;
    }).filter(Boolean);

    // Age tag — today shows HH:MM, older shows date
    const ageStr = updatedAt ? (() => {
      const d = new Date(updatedAt);
      const today = new Date().toLocaleDateString("en-CA");
      if (d.toLocaleDateString("en-CA") === today) {
        return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
      }
      return `${d.getMonth() + 1}月${d.getDate()}日`;
    })() : "";

    panel.innerHTML = `<div class="sa-card">
      <div class="sa-header">
        <div class="sa-company-row">
          <div>
            <div class="sa-sym">${sym}</div>
            <div class="sa-name">${name}</div>
          </div>
          <div class="sa-hdr-right">
            ${price != null ? `<div class="sa-price">$${price.toFixed(2)}</div>` : ""}
            <button class="sa-collapse-btn" id="sa-collapse" title="收起/展开分析">▲ 收起</button>
          </div>
        </div>
        <div class="sa-tags">
          ${industry ? `<span class="sa-tag">${industry}</span>` : ""}
          ${exchange  ? `<span class="sa-tag">${exchange.split(" ")[0]}</span>` : ""}
          ${mcDisplay ? `<span class="sa-tag">Mkt Cap ${mcDisplay}</span>` : ""}
          ${ipoYear ? `<span class="sa-tag">上市 ${ipoYear}</span>` : ""}
          ${earnTag}
        </div>
        ${w52bar}
      </div>

      <div id="sa-body">
      <div class="sa-scores">
        <div class="sa-grade-row">
          <div class="sa-grade" style="color:${gradeColor(scores.grade)}">${scores.grade}</div>
          <div>
            <div class="sa-overall-num" style="color:${gradeColor(scores.grade)}">${scores.overall}<span style="font-size:13px;font-weight:400;color:var(--fg-3)">/100</span></div>
            <div class="sa-overall-sub">综合评分</div>
          </div>
          <div class="sa-radar-inline">${buildRadarSVG(scores)}</div>
        </div>
        <div class="sa-score-grid">${scoreBars}</div>
      </div>

      ${recommendation ? `<div class="sa-rec">
        <span class="sa-rec-badge" style="background:${recStyle.bg};border-color:${recStyle.border};color:${recStyle.text}${recStyle.glow ? `;box-shadow:${recStyle.glow}` : ""}">${recommendation.label ?? ""}</span>
        ${recommendation.entry ? `<span class="sa-rec-entry">${recommendation.entry}</span>` : ""}
      </div>` : ""}

      ${analyst?.recLabel ? (() => {
        const recCls = { strongBuy: "sa-ab-buy-strong", buy: "sa-ab-buy", hold: "sa-ab-hold", underperform: "sa-ab-under", sell: "sa-ab-sell" }[analyst.recKey] ?? "sa-ab-hold";
        const up = analyst.targetUpside;
        const upColor = up == null ? "var(--fg-2)" : up >= 0 ? "var(--up)" : "var(--down)";
        const upStr   = up != null ? `${up >= 0 ? "▲" : "▼"} ${Math.abs(up).toFixed(1)}%` : "";
        return `<div class="sa-analyst-strip">
          <span class="sa-analyst-badge ${recCls}">${analyst.recLabel}</span>
          ${analyst.targetMean ? `<span class="sa-analyst-target">目标 <b>$${analyst.targetMean.toFixed(1)}</b></span>` : ""}
          ${upStr ? `<span class="sa-analyst-upside" style="color:${upColor}">${upStr}</span>` : ""}
          ${analyst.analystCount ? `<span class="sa-analyst-meta">${analyst.analystCount}位分析师</span>` : ""}
          ${analyst.targetLow && analyst.targetHigh ? `<span class="sa-analyst-meta">$${analyst.targetLow.toFixed(0)}~$${analyst.targetHigh.toFixed(0)}</span>` : ""}
        </div>`;
      })() : ""}

      <div class="sa-metrics">
        <div class="sa-metrics-hdr">关键指标</div>
        ${metricsHTML}
        ${techStrip}
        ${epsStripHTML}
      </div>

      ${sections.length ? `<div class="sa-analysis">
        ${sections.map((s, i) => {
          const isLast = i === sections.length - 1;
          return `<div class="sa-sec">
            <div class="sa-sec-hdr" data-sai="${i}">
              <span class="sa-sec-title">${s.n}</span>
              <span class="sa-sec-chev${isLast ? " open" : ""}">▶</span>
            </div>
            <div class="sa-sec-body${isLast ? " open" : ""}" id="sa-s-${i}">${formatSectionBody(s.body)}</div>
          </div>`;
        }).join("")}
      </div>` : ""}

      <div class="sa-actions">
        <button class="btn primary" id="sa-btn-add" style="font-size:12px;padding:7px 14px">⭐ 加入自选</button>
        <button class="btn" id="sa-btn-pos" style="font-size:12px;padding:7px 14px">📈 开仓</button>
        <button class="btn" id="sa-btn-re" style="font-size:12px;padding:7px 14px;color:var(--fg-3)">↻ 重新分析</button>
        ${ageStr ? `<span class="sa-age">${ageStr}更新</span>` : ""}
      </div>
      </div>
    </div>`;

    panel.style.display = "";

    // Accordion
    $$(".sa-sec-hdr", panel).forEach(hdr => {
      hdr.addEventListener("click", () => {
        const i = hdr.dataset.sai;
        const body = $(`#sa-s-${i}`, panel);
        const chev = hdr.querySelector(".sa-sec-chev");
        if (!body) return;
        const open = body.classList.toggle("open");
        chev.classList.toggle("open", open);
      });
    });

    // Add to watchlist
    $("#sa-btn-add", panel)?.addEventListener("click", () => {
      if (WATCHLIST.find(w => w.sym === data.sym)) { alert(`${data.sym} 已在自选列表`); return; }
      WATCHLIST.push({
        sym: data.sym, name: data.name,
        sector: data.industry ?? "—",
        color: "oklch(0.35 0.01 250)",
        price: data.price ?? null,
        setup: data.recommendation?.label ?? "",
        bxScore: data.scores?.overall ?? 50,
        bxSlope: 0,
        note: "", addedAt: new Date().toISOString().slice(0, 10),
        _aiGrade: data.scores?.grade,
      });
      saveToStorage(); renderWatchlist();
      $("#sa-btn-add", panel).textContent = "✓ 已加入自选";
      setTimeout(() => { const b = $("#sa-btn-add", panel); if (b) b.innerHTML = "⭐ 加入自选"; }, 2000);
    });

    // Open position
    $("#sa-btn-pos", panel)?.addEventListener("click", () => {
      switchPage("desk");
      setTimeout(() => {
        const ti = $("#form-ticker"); if (ti) ti.value = data.sym;
        const ei = $("#form-entry");  if (ei && data.price) ei.value = data.price.toFixed(2);
        const fd = $("#form-date");   if (fd) fd.value = new Date().toISOString().slice(0, 10);
        openModal("new-position-modal");
      }, 80);
    });

    // Re-analyze
    $("#sa-btn-re", panel)?.addEventListener("click", () => triggerAnalysis(data.sym, true));

    // Collapse / expand the whole analysis (header + 52w bar stay visible)
    const collapseBtn = $("#sa-collapse", panel);
    collapseBtn?.addEventListener("click", () => {
      const body = $("#sa-body", panel);
      if (!body) return;
      const collapsed = body.style.display === "none";
      body.style.display = collapsed ? "" : "none";
      collapseBtn.textContent = collapsed ? "▲ 收起" : "▼ 展开";
    });

    // Metric tooltip popup — anchored beside the clicked card (body-mounted)
    $$(".sa-mc-info", panel).forEach(el => {
      el.addEventListener("click", e => {
        e.stopPropagation();
        const tip = METRIC_TIPS[el.dataset.tipk];
        if (!tip) return;
        const { overlay, popup, close } = ensureTipPopup();
        if (popup._lastKey === el.dataset.tipk && popup.classList.contains("open")) {
          close(); return;
        }
        popup.querySelector(".sa-tip-name").textContent = tip[0];
        const _mDesc = popup.querySelector(".sa-tip-desc");
        _mDesc.textContent = tip[1];
        _mDesc.style.display = "";
        const _mBd = popup.querySelector(".sa-tip-bd");
        if (_mBd) _mBd.style.display = "none";
        const thresh = popup.querySelector(".sa-tip-thresh");
        if (tip[2]) {
          thresh.innerHTML = tip[2].split('\n').map(line => {
            const m = line.match(/^(.+?)\s{2,}(.+)$/);
            if (m) return `<div class="sa-thresh-row"><span class="sa-thresh-key">${m[1]}</span><span class="sa-thresh-val">${m[2]}</span></div>`;
            return `<div class="sa-thresh-row sa-thresh-full">${line}</div>`;
          }).join('');
          thresh.style.display = "";
        } else { thresh.style.display = "none"; }
        popup._lastKey = el.dataset.tipk;
        // Measure first (hidden), then anchor below the card; flip above if no room
        popup.style.visibility = "hidden";
        popup.classList.add("open");
        const pw = popup.offsetWidth, ph = popup.offsetHeight;
        const r = (el.closest(".sa-mc") ?? el).getBoundingClientRect();
        const pad = 8, gap = 8;
        const left = Math.min(Math.max(r.left + r.width / 2 - pw / 2, pad), window.innerWidth - pw - pad);
        let top = r.bottom + gap;
        if (top + ph > window.innerHeight - pad) top = r.top - ph - gap;
        if (top < pad) top = pad;
        popup.style.left = left + "px";
        popup.style.top  = top + "px";
        popup.style.visibility = "";
        overlay.classList.add("open");
      });
    });

    // Score bar click → breakdown popup
    $$(".sa-score-row[data-dim]", panel).forEach(scoreRow => {
      scoreRow.addEventListener("click", e => {
        e.stopPropagation();
        const dim = scoreRow.dataset.dim;
        const key = `dim:${dim}`;
        const { overlay, popup, close } = ensureTipPopup();
        if (popup._lastKey === key && popup.classList.contains("open")) { close(); return; }
        const bd = buildDimBreakdown(dim, data);
        const rowsHTML = bd.rows.map(r => {
          const dStr = r.cls === "base" ? String(r.delta) : r.cls === "total" ? String(r.delta) : (r.delta > 0 ? `+${r.delta}` : r.delta === 0 ? "±0" : String(r.delta));
          return `<div class="sa-bd-row sa-bd-${r.cls}">
            <span class="sa-bd-lbl">${r.lbl}</span>
            <span class="sa-bd-val">${r.val}</span>
            <span class="sa-bd-delta">${dStr}</span>
          </div>`;
        }).join("");
        popup.querySelector(".sa-tip-name").textContent = bd.title;
        popup.querySelector(".sa-tip-desc").style.display = "none";
        popup.querySelector(".sa-tip-thresh").style.display = "none";
        const _dBd = popup.querySelector(".sa-tip-bd");
        _dBd.innerHTML = `<div class="sa-bd-rows">${rowsHTML}</div>`;
        _dBd.style.display = "";
        popup._lastKey = key;
        popup.style.visibility = "hidden";
        popup.classList.add("open");
        overlay.classList.add("open");
        const pw = popup.offsetWidth, ph = popup.offsetHeight;
        const rect = scoreRow.getBoundingClientRect();
        const pad = 8, gap = 6;
        const left = Math.min(Math.max(rect.left + rect.width / 2 - pw / 2, pad), window.innerWidth - pw - pad);
        let top = rect.bottom + gap;
        if (top + ph > window.innerHeight - pad) top = rect.top - ph - gap;
        if (top < pad) top = pad;
        popup.style.left = left + "px";
        popup.style.top  = top  + "px";
        popup.style.visibility = "";
      });
    });
  }

  // ============ MARKET PAGE ============
  // Zone thresholds mirror the three-axis model boundaries exactly.
  // VIX/VXN → 轴B risk capacity labels. FGI/RSI → 轴C sentiment labels.
  const MKT_ZONES = {
    vix: {
      label: "VIX", cap: 60,
      zones: [
        { max: 15,  color: "#22c55e", label: "充裕 · 100%上限",  badge: "充裕 100%" },
        { max: 20,  color: "#3b82f6", label: "正常 · 75%上限",   badge: "正常 75%" },
        { max: 30,  color: "#f97316", label: "收缩 · 50%上限",   badge: "收缩 50%" },
        { max: 50,  color: "#ef4444", label: "极小 · 25%上限",   badge: "极小 25%" },
        { max: 9999,color: "#92400e", label: "恐慌 · 清仓观望",  badge: "恐慌" },
      ]
    },
    vxn: {
      label: "VXN (Nasdaq)", cap: 80,
      zones: [
        { max: 20,  color: "#22c55e", label: "充裕",   badge: "充裕" },
        { max: 27,  color: "#3b82f6", label: "正常",   badge: "正常" },
        { max: 40,  color: "#f97316", label: "收缩",   badge: "收缩" },
        { max: 65,  color: "#ef4444", label: "极小",   badge: "极小" },
        { max: 9999,color: "#92400e", label: "恐慌",   badge: "恐慌" },
      ]
    },
    fg: {
      label: "恐惧贪婪指数", cap: 100,
      zones: [
        { max: 25,  color: "#22c55e", label: "极端恐惧 · 分批进", badge: "极端恐惧" },
        { max: 40,  color: "#3b82f6", label: "偏冷 · 可加仓",     badge: "偏冷" },
        { max: 60,  color: "#eab308", label: "中性 · 正常",       badge: "中性" },
        { max: 75,  color: "#f97316", label: "偏热 · 不追高",     badge: "偏热" },
        { max: 9999,color: "#ef4444", label: "极端过热 · 止盈",   badge: "极端过热" },
      ]
    },
    rsi: {
      label: "VOO RSI(14)", cap: 100,
      zones: [
        { max: 38,  color: "#22c55e", label: "极弱 · 分批进",   badge: "极弱" },
        { max: 45,  color: "#3b82f6", label: "偏弱 · 可加仓",   badge: "偏弱" },
        { max: 65,  color: "#eab308", label: "中性 · 正常",     badge: "中性" },
        { max: 72,  color: "#f97316", label: "偏热 · 不追高",   badge: "偏热" },
        { max: 9999,color: "#ef4444", label: "超买 · 止盈",     badge: "超买" },
      ]
    }
  };

  const MKT_REGIMES = [
    {
      id: "panic",
      regime: "🟤 抛售",
      color: "#92400e",
      condition: v => v.vix > 50,
      cond:    "VIX > 50",
      meaning: "极端抛售，市场失控",
      action: "清仓观望，等待 VIX 回落至 40 以下再评估。不抄底，不加仓。",
      posSize: "0%",
      stopRule: "不适用",
    },
    {
      id: "defense",
      regime: "🔴 防守",
      color: "#ef4444",
      condition: v => v.vix >= 30 || v.fg < 20,
      cond:    "VIX ≥ 30 或 FGI < 20",
      meaning: "高波动或极度恐惧",
      action: "减仓至轻仓，收紧止损，回避所有新多单。关注关键支撑位是否守住。",
      posSize: "≤ 25%",
      stopRule: "极紧 (−3%)",
    },
    {
      id: "caution",
      regime: "🟠 谨慎",
      color: "#f97316",
      condition: v => v.vix >= 20 && (v.fg < 40 || v.vixTrend === "up"),
      cond:    "VIX ≥ 20 且 (FGI < 40 或 VIX 均线上升)",
      meaning: "波动放大，方向不确定",
      action: "降低整体仓位，优先持有高质量个股，止损收紧，暂停追涨。",
      posSize: "50%",
      stopRule: "收紧 (−4%)",
    },
    {
      id: "hot",
      regime: "🟡 偏热",
      color: "#eab308",
      condition: v => v.vix < 20 && (v.rsi > 70 || v.fg > 70),
      cond:    "VIX < 20 且 RSI > 70 或 FGI > 70",
      meaning: "低波动，但情绪过热",
      action: "不追高，分批止盈，等待回调再布局。现有持仓可持有，不加仓。",
      posSize: "75%",
      stopRule: "正常 (−6%)",
    },
    {
      id: "attack",
      regime: "🟢 进攻",
      color: "#22c55e",
      condition: v => v.vix < 12 && v.rsi >= 45 && v.rsi <= 70 && v.fg > 25,
      cond:    "VIX < 12 且 RSI 45–70 且 FGI > 25",
      meaning: "低波动，动量健康",
      action: "持有成长 + 动量龙头，积极布局突破形态，止损可适当放宽。",
      posSize: "100%",
      stopRule: "宽松 (−8%)",
    },
    {
      id: "steady",
      regime: "🔵 稳健",
      color: "#3b82f6",
      condition: () => true,
      cond:    "VIX 12–20 · RSI / FGI 正常区间",
      meaning: "正常风险环境",
      action: "持有核心仓位，优质个股逢回调买入，止损正常执行。",
      posSize: "75%",
      stopRule: "正常 (−6%)",
    },
  ];

  function calcRSI(closes, period = 14) {
    if (closes.length < period + 2) return null;
    // Seed: SMA of first `period` changes
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) avgGain += diff; else avgLoss -= diff;
    }
    avgGain /= period;
    avgLoss /= period;
    // Wilder's smoothing for remaining bars
    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    }
    if (avgLoss === 0) return 100;
    return +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(1);
  }

  function getZone(cfg, val) {
    return cfg.zones.find(z => val <= z.max) || cfg.zones[cfg.zones.length - 1];
  }

  function mkZoneBarHTML(cfg, val) {
    const cap = cfg.cap;
    const clamped = Math.min(val, cap);
    const pct = (clamped / cap * 100).toFixed(1);
    // Each segment width = its own range / cap (not cumulative)
    const segs = cfg.zones.map((z, i) => {
      const prevMax = i === 0 ? 0 : Math.min(cfg.zones[i - 1].max, cap);
      const segMax  = Math.min(z.max, cap);
      const w = ((segMax - prevMax) / cap * 100).toFixed(2);
      return `<div class="mkt-seg" style="width:${w}%;background:${z.color}"></div>`;
    });
    return `
      <div class="mkt-zone-bar">
        <div class="mkt-bar-track">${segs.join("")}</div>
        <div class="mkt-bar-ptr" style="left:${pct}%"></div>
      </div>`;
  }

  // GEX state → 5 levels matching the rules table, driven by distFlipPct.
  function gexState(distFlipPct, regime) {
    if (distFlipPct != null) {
      if (distFlipPct > 2)     return { color: "#22c55e", label: "深度正 Gamma", mode: "波动压制",
        interp: "做市商深度净多 Gamma，波动被强力压制，倾向区间震荡。策略：区间操作可加码；Call Wall 附近受阻概率高，不追突破。" };
      if (distFlipPct > 0.3)   return { color: "#22c55e", label: "正 Gamma", mode: "波动压制",
        interp: "做市商净多 Gamma，对冲与行情反向——买跌卖涨，波动被压制。策略：区间高抛低吸；Call Wall 附近易受阻回落，不追突破。" };
      if (distFlipPct >= -0.3) return { color: "#eab308", label: "临界", mode: "临界翻转",
        interp: "价格贴近 Gamma Flip，波动性质随时切换。跌破 Flip 转负 Gamma（波动骤升），站上则转正（趋稳）。策略：轻仓、等方向确认，把 Flip 当多空分界线。" };
      if (distFlipPct >= -2)   return { color: "#f97316", label: "负 Gamma", mode: "波动放大",
        interp: "做市商净空 Gamma，对冲与行情同向——涨追涨、跌杀跌，波动被放大。策略：顺势跟随，收紧或减仓；跌破 Put Wall 会加速下行。" };
      return { color: "#ef4444", label: "深度负 Gamma", mode: "波动放大",
        interp: "做市商深度净空 Gamma，波动剧烈放大、下跌容易加速。策略：大幅收仓、严格止损、勿抄底；跌破 Put Wall 进一步加速。" };
    }
    if (regime === "negative") return { color: "#ef4444", label: "负 Gamma", mode: "波动放大",
      interp: "做市商净空 Gamma，对冲与行情同向，波动被放大。策略：顺势跟随，收紧或减仓。" };
    if (regime === "neutral")  return { color: "#eab308", label: "临界", mode: "临界翻转",
      interp: "价格贴近 Gamma Flip，波动性质随时切换。策略：轻仓、等方向确认。" };
    return { color: "#22c55e", label: "正 Gamma", mode: "波动压制",
      interp: "做市商净多 Gamma，波动被压制。策略：区间高抛低吸；Call Wall 附近不追突破。" };
  }

  // Collapsible rulebook at the bottom of the GEX card (same pattern as 市场模型详情)
  function gxRulesHTML() {
    const mkTable = (title, head, rows) => `
      <div class="pb3-section">
        <div class="pb3-section-head">${title}</div>
        <table class="mkt-pb-table">
          <thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead>
          <tbody>${rows.map(r => `<tr>
            <td style="color:${r[3] || "var(--fg-1)"};font-weight:700;white-space:nowrap">${r[0]}</td>
            <td style="font-family:var(--f-mono);font-size:10.5px;color:var(--fg-3)">${r[1]}</td>
            <td style="font-size:12px">${r[2]}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
    return `
      <details class="gx-rules">
        <summary>GEX 详细规则 · 点击展开</summary>
        <div class="gx-rules-body">
          ${mkTable("状态判定 · 现价 vs Gamma Flip", ["状态", "触发条件", "含义与仓位因子"], [
            ["深度正 Gamma", "现价高于 Flip > 2%",   "波动强压制，区间可加码 · 仓位 ×1.15", "#22c55e"],
            ["正 Gamma",     "Flip 上方 0.3%–2%",    "正常操作 · 仓位 ×1.0", "#22c55e"],
            ["临界",         "Flip ±0.3% 内",        "随时翻转，轻仓等方向 · 仓位 ×0.75", "var(--warn)"],
            ["负 Gamma",     "Flip 下方 0.3%–2%",    "波动放大，收仓+宽止损 · 仓位 ×0.6", "#f97316"],
            ["深度负 Gamma", "现价低于 Flip > 2%",   "高危，大幅收仓、勿抄底 · 仓位 ×0.4", "#ef4444"],
          ])}
          ${mkTable("三个关键价位", ["价位", "是什么", "怎么用"], [
            ["Gamma Flip", "累计净γ过零的价位",       "多空波动分界线：跌破→转负γ、波动骤升；站上→趋稳。最重要的预警线", "var(--warn)"],
            ["Call Wall",  "上方 call γ 最大行权价",  "阻力 + 磁吸：正γ时价格到此易受阻回落，突破难持续，不追", "#ef4444"],
            ["Put Wall",   "下方 put γ 最大行权价",   "支撑 + 缓冲：负γ环境下跌破会加速下行，可作防守参考位", "#22c55e"],
          ])}
          ${mkTable("读数规则", ["指标", "规则", "注意"], [
            ["Net GEX",  "SPX 每波动1%的做市商对冲金额", "看符号、分位、Flip距离；绝对值随 spot² 和持仓量膨胀，别用固定阈值刻舟求剑"],
            ["波段口径", "净值剔除 0DTE 后的部分",       "0DTE 收盘即清零；正转负 = 隔夜无缓冲，持仓过夜要谨慎"],
            ["分位数",   "当前净值在近 N 天（至多120）的排位", "≥80% 缓冲垫厚 · ≤20% 偏薄；样本不足5天不显示"],
            ["OpEx",     "每月第三个周五月度到期",       "到期后大量 γ 清零，随后一周方向性移动概率增大"],
          ])}
          <div class="pb3-tip">与三轴模型的配合：建议仓位 = 轴B（VIX）仓位上限 × GEX 仓位因子。方向轴逆风时照旧禁新仓，GEX 不改变闸门。</div>
          <div class="gx-rules-note">数据：CBOE 延迟15分钟报价（SPX+SPXW 0DTE）· 范围 0-30DTE、行权价 ±15% · 公式 Σ γ×OI×100×spot²×1%（call 正 / put 负）· 1小时缓存 · 与外部 GEX 面板绝对值不同属正常（口径差异），以趋势和相对位置为准</div>
        </div>
      </details>`;
  }

  function mkGexCardHTML(gex) {
    const net = gex?.netGexBn ?? gex?.gexBn;
    if (!gex || net == null) return "";
    const st   = gexState(gex.distFlipPct, gex.regime);
    const swing = gex.swingGexBn;
    const hero = swing != null ? swing : net;
    const heroSign = hero > 0 ? "+" : "";
    const heroColor = hero > 0 ? "#22c55e" : hero < 0 ? "#ef4444" : "var(--fg-1)";
    const netSign = net > 0 ? "+" : "";
    const netColor = net > 0 ? "#22c55e" : net < 0 ? "#ef4444" : "var(--fg-1)";
    const factor = gex.posFactor ?? 1;
    const facColor = factor >= 1 ? "#22c55e" : factor >= 0.7 ? "#eab308" : "#ef4444";
    const opexWarn = gex.daysToOpEx <= 3;

    // Price-structure bar: Put Wall (support) — Flip (pivot) — spot — Call Wall (resistance)
    const { spot, flip, callWall, putWall } = gex;
    const lv = [putWall, flip, spot, callWall].filter(v => v != null);
    let barHTML = "";
    if (spot != null && lv.length >= 2) {
      let min = Math.min(...lv), max = Math.max(...lv);
      const pad = (max - min) * 0.10 || spot * 0.01;
      min -= pad; max += pad;
      const pos = v => Math.max(1, Math.min(99, (v - min) / (max - min) * 100));
      const flipPos = flip != null ? pos(flip) : 50;
      const tick = (v, cls, label) => v == null ? "" :
        `<div class="gx-tick ${cls}" style="left:${pos(v)}%"><span class="gx-tick-lbl">${label}</span></div>`;
      barHTML = `
        <div class="gx-bar">
          <div class="gx-bar-track" style="background:linear-gradient(90deg,#ef444455 0%,#ef444455 ${flipPos}%,#22c55e55 ${flipPos}%,#22c55e55 100%)"></div>
          ${tick(putWall,  "put",  "Put")}
          ${tick(callWall, "call", "Call")}
          ${flip != null ? `<div class="gx-tick flip" style="left:${flipPos}%"><span class="gx-tick-lbl">Flip</span></div>` : ""}
          <div class="gx-spot" style="left:${pos(spot)}%;border-color:${st.color}"></div>
        </div>`;
    }

    const distPill = (label, pct, level, cls) => level == null ? "" :
      `<div class="gx-lvl ${cls}"><span class="gx-lvl-name">${label}</span><span class="gx-lvl-val">${level}</span>${pct != null ? `<span class="gx-lvl-dist">${pct > 0 ? "+" : ""}${pct}%</span>` : ""}</div>`;

    const d = gex.dte || {};
    const dteItem = (name, val) => val == null ? "" :
      `<span class="gx-dte-item"><span class="gx-dte-name">${name}</span><b style="color:${val >= 0 ? "#22c55e" : "#ef4444"}">${val > 0 ? "+" : ""}${val}B</b></span>`;
    const dteHTML = (d.d0 != null || d.d1_7 != null || d.d8_30 != null)
      ? `<div class="gx-dte">${dteItem("0DTE", d.d0)}${dteItem("1-7D", d.d1_7)}${dteItem("8-30D", d.d8_30)}</div>` : "";

    // Day-over-day change + percentile — prefer swing metrics, fallback to net
    const chgParts = [];
    const chgVal = gex.swingChgBn ?? gex.netChgBn;
    if (chgVal != null) {
      const up = chgVal >= 0;
      chgParts.push(`<span style="color:${up ? "#22c55e" : "#ef4444"}">${up ? "▲" : "▼"} ${up ? "+" : ""}${chgVal}B 较昨日</span>`);
    }
    const pctVal = gex.swingPctile ?? gex.pctile;
    if (pctVal != null)
      chgParts.push(`<span>近${gex.histDays}天分位 <b>${pctVal}%</b></span>`);
    const chgRow = chgParts.length ? `<div class="gx-chgrow">${chgParts.join(`<span class="gx-dot">·</span>`)}</div>` : "";

    // Swing divergence warning
    let swingNote = "";
    if (swing != null && net > 0 && swing < 0)
      swingNote = `<div class="gx-swing-warn">Net GEX 为正但剔0DTE后转负——缓冲全靠当日期权，隔夜持仓无保护</div>`;
    else if (swing != null && net > 0 && swing < net * 0.5)
      swingNote = `<div class="gx-swing-warn mild">0DTE占比高，缓冲的隔日延续性偏弱</div>`;

    return `
      <div class="mkt-card mkt-gex-card">
        <div class="mkt-card-label">做市商 Gamma <span class="mkt-gex-src">SPX 1-30 · CBOE</span></div>
        <div class="mkt-card-row">
          <span class="mkt-card-val" style="color:${heroColor}">${heroSign}${hero}<span class="mkt-gex-unit">B</span></span>
          <span class="mkt-gex-mode" style="color:${st.color}">${st.label} · ${st.mode}</span>
          <span class="gx-factor-tag" style="color:${facColor};border-color:${facColor}40;background:${facColor}12">×${factor}</span>
        </div>
        <div class="gx-hero-sub">波段口径 1-30</div>
        ${swingNote}
        ${chgRow}
        <div class="gx-net-ref">Net GEX<span class="gx-net-ref-tag">0-30</span> <b style="color:${netColor}">${netSign}${net}B</b></div>
        ${barHTML}
        <div class="gx-levels">
          ${distPill("Put Wall", gex.distPutPct, putWall, "put")}
          ${distPill("Gamma Flip", gex.distFlipPct, flip, "flip")}
          ${distPill("现价", null, spot, "spot")}
          ${distPill("Call Wall", gex.distCallPct, callWall, "call")}
        </div>
        <div class="mkt-gex-interp">${st.interp}</div>
        ${dteHTML}
        <div class="mkt-gex-metarow">
          <span>建议仓位 = 轴B上限 × <b style="color:${facColor}">${factor}</b></span>
          <span class="${opexWarn ? "warn" : ""}">月度OpEx <b>${gex.daysToOpEx}天</b>${opexWarn ? " · Gamma清零，方向性放大" : ""}</span>
        </div>
        ${gxRulesHTML()}
      </div>`;
  }

  function mkIndicatorHTML(key, val, pctChg, absChg, extra = "") {
    const cfg = MKT_ZONES[key];
    const zone = getZone(cfg, val);
    // VIX/VXN: up = bad (red); FG/RSI: up = good (green)
    const invertColor = key === "fg" || key === "rsi";
    let chgStr = "";
    if (pctChg != null || absChg != null) {
      const up   = (pctChg ?? absChg) >= 0;
      const good = invertColor ? up : !up;
      const clr  = good ? "#22c55e" : "#ef4444";
      const arr  = up ? "▲" : "▼";
      const abs  = absChg != null ? `${up ? "+" : ""}${absChg.toFixed(2)}` : "";
      const pct  = pctChg != null ? `(${up ? "+" : ""}${pctChg.toFixed(2)}%)` : "";
      chgStr = `<div class="mkt-chg-row" style="color:${clr}">${arr} ${abs}${abs && pct ? " " : ""}${pct}</div>`;
    }
    return `
      <div class="mkt-card">
        <div class="mkt-card-label">${cfg.label}</div>
        <div class="mkt-card-row">
          <span class="mkt-card-val" style="color:${zone.color}">${val}</span>
          ${extra}
        </div>
        ${chgStr}
        <div class="mkt-badge" style="color:${zone.color};border-color:${zone.color}40;background:${zone.color}12">
          <span class="mkt-badge-dot" style="background:${zone.color}"></span>${zone.label}
        </div>
        ${mkZoneBarHTML(cfg, val)}
      </div>`;
  }

  function mkPlaybookHTML() {
    // Three-axis reference handbook (replaces old 6-regime table).
    const axisA = [
      { label: "做多", color: "#22c55e", cond: "价格 > EMA50 > EMA200", action: "有做多资格，正常布局" },
      { label: "中性", color: "#eab308", cond: "价格在 EMA50/EMA200 之间回调", action: "少开新仓，持有已有仓位" },
      { label: "做空", color: "#ef4444", cond: "EMA50/EMA200 死叉 或 价格 < EMA200", action: "禁止新多仓，严格执行止损" },
    ];
    const axisB = [
      { label: "充裕", color: "#22c55e", cond: "VIX < 15",    action: "仓位上限 100% · 止损 −10%" },
      { label: "正常", color: "#3b82f6", cond: "VIX 15–20",   action: "仓位上限 75%  · 止损 −8%" },
      { label: "收缩", color: "#f97316", cond: "VIX 20–30",   action: "仓位上限 50%  · 止损 −5%" },
      { label: "极小", color: "#ef4444", cond: "VIX ≥ 30",    action: "仓位上限 25%  · 止损 −5%" },
    ];
    const axisC = [
      { label: "极端恐惧", color: "#22c55e", cond: "FGI < 25 且 RSI < 38", action: "分批建仓候选，等 VIX 回落确认" },
      { label: "偏冷",     color: "#3b82f6", cond: "FGI < 40 或 RSI < 45", action: "可小幅加仓，不追高" },
      { label: "中性",     color: "#eab308", cond: "FGI 40–60，RSI 45–65", action: "正常操作，按计划执行" },
      { label: "偏热",     color: "#f97316", cond: "FGI 60–75 或 RSI 65–72", action: "持仓不加码，盯紧止损" },
      { label: "极端过热", color: "#ef4444", cond: "FGI > 75 或 RSI > 72",   action: "禁止新仓，盈利仓减仓 1/3，收紧止损" },
    ];
    const mkSection = (title, sub, rows) => `
      <div class="pb3-section">
        <div class="pb3-section-head">${title} <span class="pb3-section-sub">${sub}</span></div>
        <table class="mkt-pb-table">
          <thead><tr><th>状态</th><th>触发条件</th><th>操作含义</th></tr></thead>
          <tbody>${rows.map(r => `<tr>
            <td style="color:${r.color};font-weight:700;white-space:nowrap">${r.label}</td>
            <td style="font-family:var(--f-mono);font-size:10.5px;color:var(--fg-3)">${r.cond}</td>
            <td style="font-size:12px">${r.action}</td>
          </tr>`).join("")}</tbody>
        </table>
      </div>`;
    return `
      <div class="mkt-playbook">
        <div class="mkt-playbook-title">市场模型详情</div>
        ${mkSection("轴A · 方向（趋势）", "决定有没有做多资格", axisA)}
        ${mkSection("轴B · 风险容量（VIX）", "决定开多少（仓位上限）", axisB)}
        ${mkSection("轴C · 情绪（FGI / RSI）", "决定何时止盈或分批进", axisC)}
        <div class="pb3-tip">三轴合并规则：方向逆风 = 闸门（禁新多）&gt; 情绪极端过热 = 止盈优先 &gt; 情绪极端恐惧 = 分批进 &gt; 正常进攻</div>
      </div>`;
  }

  function getCurrentRegime(vix, fg, rsi, vixTrend = "flat") {
    return MKT_REGIMES.find(r => r.condition({ vix, fg, rsi, vixTrend }));
  }

  // ============ THREE-AXIS MARKET MODEL ============
  // VIX 管"开多少(仓位)"，趋势管"哪个方向"，情绪极端(FGI/RSI)管"何时止盈/反向"。
  // 三个轴独立评分，最后合并，避免用单一 VIX 在周期边界给出自相矛盾的信号。

  function calcSMA(closes, period) {
    if (!closes || closes.length < period) return null;
    const slice = closes.slice(-period);
    return +(slice.reduce((a, b) => a + b, 0) / period).toFixed(2);
  }

  function calcEMA(closes, period) {
    if (!closes || closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
    return +ema.toFixed(2);
  }

  // 轴A：方向（趋势）—— VOO 价格 vs EMA50 / EMA200。决定"有没有做多资格"。
  function getDirectionAxis(price, ma50, ma200) {
    if (price == null || ma50 == null)
      return { id: "unknown", label: "未知", color: "var(--fg-3)", desc: "趋势数据不足", eligible: true };
    if (ma200 == null)
      return price > ma50
        ? { id: "tailwind", label: "做多", color: "#22c55e", desc: "价格 > EMA50，趋势偏多", eligible: true }
        : { id: "headwind", label: "做空", color: "#ef4444", desc: "价格跌破 EMA50", eligible: false };
    const deathCross = ma50 < ma200;
    if (deathCross || price < ma200)
      return { id: "headwind", label: "做空", color: "#ef4444",
        desc: deathCross ? "EMA50/EMA200 死叉，长期趋势走弱" : "价格跌破 EMA200，回避新多单", eligible: false };
    if (price > ma50 && ma50 > ma200)
      return { id: "tailwind", label: "做多", color: "#22c55e", desc: "价格 > EMA50 > EMA200，多头结构完整", eligible: true };
    return { id: "neutral", label: "中性", color: "#eab308", desc: "价格在均线间回调，方向待确认", eligible: true };
  }

  // 轴B：风险容量（VIX）—— 仓位上限 + 止损宽度。只管"多少"，不管"买不买"。
  function getRiskAxis(vix) {
    if (vix < 15)  return { id: "full",    label: "充裕", color: "#22c55e", posMax: 100, stop: "宽松 −10%" };
    if (vix < 20)  return { id: "normal",  label: "正常", color: "#3b82f6", posMax: 75,  stop: "正常 −8%" };
    if (vix < 30)  return { id: "reduced", label: "收缩", color: "#f97316", posMax: 50,  stop: "收紧 −5%" };
    return            { id: "minimal", label: "极小", color: "#ef4444", posMax: 25,  stop: "极紧 −5%" };
  }

  // 轴C：情绪（FGI + RSI）—— 对方向的倾斜修正：过热减仓、恐惧分批进。
  function getSentimentAxis(fg, rsi, vixTrend = "flat") {
    if (fg > 75 || rsi > 72)
      return { id: "euphoria", label: "极端过热", color: "#ef4444", tilt: "trim",
        desc: "禁止新仓，盈利仓位减仓 1/3，收紧止损" };
    if (fg >= 60 || rsi >= 65)
      return { id: "warm", label: "偏热", color: "#f97316", tilt: "hold",
        desc: "可持仓，不加仓，盯紧止损" };
    if (fg < 25 && rsi < 38)
      return { id: "panic", label: "极端恐惧", color: "#22c55e", tilt: "accumulate",
        desc: vixTrend === "down" ? "分批建仓候选，VIX 已回落" : "分批建仓候选，待 VIX 回落确认" };
    if (fg < 40 || rsi < 45)
      return { id: "cool", label: "偏冷", color: "#3b82f6", tilt: "scale",
        desc: "可小幅分批加仓，不追高" };
    return { id: "neutral", label: "中性", color: "#eab308", tilt: "normal", desc: "正常操作" };
  }

  // 合并三轴 → 综合操作建议。方向轴是闸门，情绪轴做倾斜，风险轴给上限。
  function combineAxes(dir, risk, sent, gex) {
    const gexWarn = (gex && gex.regime === "negative")
      ? `；负Gamma（${gex.netGexBn ?? gex.gexBn}B，仓位×${gex.posFactor ?? "?"}），做市商对冲放大波动、下跌易加速，止损勿松、勿抄底。`
      : (gex && gex.regime === "neutral")
      ? `；Gamma临界（贴近Flip $${gex.flip ?? "?"}），波动随时切换，轻仓等方向。`
      : (gex && gex.regime === "positive" && gex.swingGexBn != null && gex.swingGexBn < 0)
      ? `；正Gamma但剔0DTE后转负（${gex.swingGexBn}B），缓冲仅限当日，隔夜持仓谨慎。`
      : "";
    if (!dir.eligible)
      return { headline: "❌ 禁止新多仓", color: "#ef4444",
        detail: `方向轴逆风（${dir.desc}）。无论 VIX 多低都不新开多仓，优先保护现有仓位、严格执行止损。${gexWarn}` };
    if (sent.tilt === "trim")
      return { headline: "⚠️ 止盈 / 禁新仓", color: "#f97316",
        detail: `情绪极端过热（${sent.desc}）。即使仓位容量到 ${risk.posMax}%，此时也应止盈而非加仓。${gexWarn}` };
    if (sent.tilt === "accumulate")
      return { headline: "🔄 分批建仓", color: "#22c55e",
        detail: `${sent.desc}。仓位上限 ${risk.posMax}%，只买最强个股，分批进、不一次满仓。${gexWarn}` };
    if (sent.tilt === "scale")
      return { headline: "⏫ 小幅加仓", color: "#3b82f6",
        detail: `${sent.desc}。仓位上限 ${risk.posMax}%，止损 ${risk.stop}。${gexWarn}` };
    if (sent.tilt === "hold")
      return { headline: "⏸️ 持仓观望", color: "#eab308",
        detail: `情绪偏热，持有现有仓位不加码。仓位上限 ${risk.posMax}%，止损 ${risk.stop}。${gexWarn}` };
    return { headline: "✅ 正常进攻", color: "#22c55e",
      detail: `三轴健康，可正常布局。仓位上限 ${risk.posMax}%，止损 ${risk.stop}。${gexWarn}` };
  }

  function buildAxes({ price, ma50, ma200, vix, fg, rsi, vixTrend, gex }) {
    const dir  = getDirectionAxis(price, ma50, ma200);
    const risk = getRiskAxis(vix);
    const sent = getSentimentAxis(fg, rsi, vixTrend);
    const combined = combineAxes(dir, risk, sent, gex);
    return { dir, risk, sent, combined, vix, fg, rsi, price, ma50, ma200, gex };
  }

  function mkAxesHTML(axes) {
    if (!axes) return "";
    const { dir, risk, sent, combined, vix, fg, rsi, price, ma50, ma200 } = axes;
    const maNote = (ma50 != null && ma200 != null)
      ? `EMA50 ${ma50} · EMA200 ${ma200}`
      : (ma50 != null ? `EMA50 ${ma50}` : "数据不足");
    return `
      <div class="mkt-axes">
        <div class="mkt-section-label">市场模型 · 综合建议</div>
        <div class="mkt-combine" style="border-color:${combined.color}55;background:${combined.color}12">
          <div class="mkt-combine-head" style="color:${combined.color}">${combined.headline}</div>
          <div class="mkt-combine-detail">${combined.detail}</div>
        </div>
        <div class="mkt-axis-grid">
          <div class="mkt-axis-card" style="border-color:${dir.color}40">
            <div class="mkt-axis-top"><span class="mkt-axis-name">方向 · 趋势</span><span class="mkt-axis-val" style="color:${dir.color}">${dir.label}</span></div>
            <div class="mkt-axis-meta">${price != null ? `VOO ${price}` : ""} <span class="mkt-axis-dim">${maNote}</span></div>
            <div class="mkt-axis-desc">${dir.desc}</div>
            <div class="mkt-axis-gate ${dir.eligible ? "ok" : "block"}">${dir.eligible ? "✓ 有做多资格" : "✕ 禁止新多仓"}</div>
          </div>
          <div class="mkt-axis-card" style="border-color:${risk.color}40">
            <div class="mkt-axis-top"><span class="mkt-axis-name">风险容量 · VIX</span><span class="mkt-axis-val" style="color:${risk.color}">${risk.posMax}%</span></div>
            <div class="mkt-axis-meta">VIX ${vix} <span class="mkt-axis-dim">容量 ${risk.label}</span></div>
            <div class="mkt-axis-desc">仓位上限 ${risk.posMax}% · 止损 ${risk.stop}</div>
            <div class="mkt-axis-gate dim">决定"开多少"</div>
          </div>
          <div class="mkt-axis-card" style="border-color:${sent.color}40">
            <div class="mkt-axis-top"><span class="mkt-axis-name">情绪 · FGI/RSI</span><span class="mkt-axis-val" style="color:${sent.color}">${sent.label}</span></div>
            <div class="mkt-axis-meta">FGI ${fg} · RSI ${rsi} <span class="mkt-axis-dim">${sent.tilt === "trim" ? "减仓倾斜" : sent.tilt === "accumulate" || sent.tilt === "scale" ? "加仓倾斜" : "中性"}</span></div>
            <div class="mkt-axis-desc">${sent.desc}</div>
            <div class="mkt-axis-gate dim">决定"何时止盈/反向"</div>
          </div>
        </div>
      </div>`;
  }

  function renderMarket(data) {
    const el = $("#market-content");
    if (!el) return;
    const { vix, vxn, fg, rsi, vixChg, vxnChg, vixAbs, vxnAbs, fgAbs, fgChg, rsiAbs, rsiChg, vixEMA10, vixTrend, vxnEMA10, vxnTrend, axes } = data;
    const today = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
    const ema10Tag = (ema10, trend) => ema10 == null ? "" : (() => {
      const arr = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
      const clr = trend === "up" ? "#ef4444" : trend === "down" ? "#22c55e" : "var(--fg-3)";
      return `<span style="font-size:11px;font-family:var(--f-mono);color:var(--fg-3);margin-left:6px">EMA10 <span style="color:${clr};font-weight:700">${ema10} ${arr}</span></span>`;
    })();
    el.innerHTML = `
      <div class="page-topbar">
        <div class="page-title">
          <span class="page-title-en">Market</span>
          <span class="page-title-zh">市场</span>
        </div>
        <div class="mkt-date">${today}</div>
      </div>
      <div class="brief-card" id="market-brief">
        <div class="brief-loading">正在生成今日市场简报…</div>
      </div>
      <div class="mkt-module-sep"></div>
      ${mkAxesHTML(axes)}
      <div class="mkt-row">
        ${mkIndicatorHTML("vix", vix, vixChg, vixAbs, ema10Tag(vixEMA10, vixTrend))}
        ${mkIndicatorHTML("vxn", vxn, vxnChg, vxnAbs, ema10Tag(vxnEMA10, vxnTrend))}
      </div>
      <div class="mkt-row">
        ${mkIndicatorHTML("fg", fg, fgChg, fgAbs)}
        ${mkIndicatorHTML("rsi", rsi, rsiChg, rsiAbs)}
      </div>
      ${axes?.gex ? `<div class="mkt-row mkt-row-full">${mkGexCardHTML(axes.gex)}</div>` : ""}
      <div class="mkt-playbook-ref">
        <details>
          <summary>市场模型详情 · 点击展开</summary>
          ${mkPlaybookHTML()}
        </details>
      </div>
      <div class="brief-card dd-card" id="drawdown-card"></div>
      <div class="mkt-module-sep"></div>
      <div id="sector-rotation" class="sect-section"></div>`;
  }

  async function fetchMarketData() {
    const el = $("#market-content");
    if (!el) return;
    el.innerHTML = `<div class="mkt-loading"><span>Loading market data…</span></div>`;
    try {
      // 400 calendar days ≈ 270 trading days — enough for VOO 200MA (direction axis).
      const fromDate = (() => { const d = new Date(); d.setDate(d.getDate() - 400); return d.toISOString().slice(0, 10); })();
      const [quoteRes, histRes, fgRes] = await Promise.allSettled([
        fetch("/api/quote?stocks=%5EVIX,%5EVXN,SPY,QQQ,DIA,IWM").then(r => r.json()),
        fetch("/api/history?symbols=VOO,%5EVIX,%5EVXN&from=" + fromDate).then(r => r.json()),
        fetch("/api/feargreed?gex=1").then(r => r.json()),
      ]);

      // VIX / VXN
      let vix = 0, vxn = 0, vixChg = null, vxnChg = null, vixAbs = null, vxnAbs = null;
      if (quoteRes.status === "fulfilled" && quoteRes.value?.results) {
        const q = quoteRes.value.results;
        if (q["^VIX"]) {
          const last = q["^VIX"].last, pc = q["^VIX"].prevClose;
          vix    = +last.toFixed(2);
          vixAbs = pc != null ? +(last - pc).toFixed(2) : null;
          vixChg = pc != null ? +((last - pc) / pc * 100).toFixed(2) : (q["^VIX"].changePct != null ? +q["^VIX"].changePct.toFixed(2) : null);
        }
        if (q["^VXN"]) {
          const last = q["^VXN"].last, pc = q["^VXN"].prevClose;
          vxn    = +last.toFixed(2);
          vxnAbs = pc != null ? +(last - pc).toFixed(2) : null;
          vxnChg = pc != null ? +((last - pc) / pc * 100).toFixed(2) : (q["^VXN"].changePct != null ? +q["^VXN"].changePct.toFixed(2) : null);
        }
      }

      // RSI from VOO history (today + yesterday)
      let rsi = 0, rsiPrev = null;
      // VOO price + moving averages for the direction axis (轴A)
      let benchPrice = null, benchMA50 = null, benchMA200 = null;
      if (histRes.status === "fulfilled" && histRes.value?.results?.["VOO"]) {
        const raw = histRes.value.results["VOO"];
        const closes = Object.keys(raw).sort().map(k => raw[k]);
        const r = calcRSI(closes);
        if (r != null) rsi = r;
        if (closes.length > 1) {
          const rp = calcRSI(closes.slice(0, -1));
          if (rp != null) rsiPrev = rp;
        }
        benchPrice = closes.length ? +closes[closes.length - 1].toFixed(2) : null;
        benchMA50  = calcEMA(closes, 50);
        benchMA200 = calcEMA(closes, 200);
      }

      // VIX / VXN EMA10 + trend direction
      const calcEMA10Trend = (results, sym) => {
        const raw = results?.[sym];
        if (!raw) return { ema10: null, trend: "flat" };
        const closes = Object.keys(raw).sort().map(k => raw[k]);
        if (closes.length < 10) return { ema10: null, trend: "flat" };
        const ema10 = calcEMA(closes, 10);
        let trend = "flat";
        if (closes.length >= 13) {
          const prevEMA10 = calcEMA(closes.slice(0, -3), 10);
          if (prevEMA10 != null) {
            if (ema10 > prevEMA10 + 0.5)      trend = "up";
            else if (ema10 < prevEMA10 - 0.5) trend = "down";
          }
        }
        return { ema10, trend };
      };
      const histResults = histRes.status === "fulfilled" ? histRes.value?.results : null;
      const { ema10: vixEMA10, trend: vixTrend } = calcEMA10Trend(histResults, "^VIX");
      const { ema10: vxnEMA10, trend: vxnTrend } = calcEMA10Trend(histResults, "^VXN");

      // Fear & Greed
      let fg = 50, fgPrev = null;
      if (fgRes.status === "fulfilled" && fgRes.value?.score != null) {
        fg = fgRes.value.score;
        fgPrev = fgRes.value.prevScore ?? null;
      }

      const fgAbs = fgPrev != null ? +(fg - fgPrev).toFixed(1) : null;
      const fgChg = fgPrev != null && fgPrev !== 0 ? +((fg - fgPrev) / fgPrev * 100).toFixed(2) : null;
      const rsiAbs = rsiPrev != null ? +(rsi - rsiPrev).toFixed(2) : null;
      const rsiChg = rsiPrev != null && rsiPrev !== 0 ? +((rsi - rsiPrev) / rsiPrev * 100).toFixed(2) : null;

      if (vix === 0 && vxn === 0 && rsi === 0) {
        el.innerHTML = `<div class="mkt-loading">无法加载数据，请稍后再试</div>`;
        return;
      }

      // Extract index daily % changes
      const indices = {};
      if (quoteRes.status === "fulfilled" && quoteRes.value?.results) {
        const q = quoteRes.value.results;
        for (const sym of ["SPY", "QQQ", "DIA", "IWM"]) {
          if (q[sym]?.last != null && q[sym]?.prevClose != null) {
            indices[sym] = +((q[sym].last - q[sym].prevClose) / q[sym].prevClose * 100).toFixed(2);
          }
        }
      }

      let gex = null;
      if (fgRes.status === "fulfilled" && fgRes.value?.gex?.gexBn != null) gex = fgRes.value.gex;

      const axes = buildAxes({ price: benchPrice, ma50: benchMA50, ma200: benchMA200, vix, fg, rsi, vixTrend, gex });
      renderMarket({ vix, vxn, fg, rsi, vixChg, vxnChg, vixAbs, vxnAbs, fgAbs, fgChg, rsiAbs, rsiChg, vixEMA10, vixTrend, vxnEMA10, vxnTrend, axes });
      // AI brief context: pass the three-axis combined recommendation + direction/sentiment/posMax.
      const mktCtx = {
        vix, fg, rsi, regime: axes.combined.headline, vixTrend, indices,
        direction: axes.dir.label, posMax: axes.risk.posMax, sentiment: axes.sent.label,
        gex: gex ? { regime: gex.regime, netGexBn: gex.netGexBn, posFactor: gex.posFactor,
          flip: gex.flip, callWall: gex.callWall, putWall: gex.putWall,
          distFlipPct: gex.distFlipPct, daysToOpEx: gex.daysToOpEx,
          swingGexBn: gex.swingGexBn, pctile: gex.pctile } : null,
      };
      _lastMktCtx = mktCtx;
      initDrawdownCard();
      fetchSectorData()
        .then(sectors => { _lastMktCtx = { ...mktCtx, sectors }; initMarketBriefCard(_lastMktCtx); })
        .catch(()    => initMarketBriefCard(mktCtx));
    } catch (e) {
      el.innerHTML = `<div class="mkt-loading">Error: ${e.message}</div>`;
    }
  }

  // ── Brief: local-cache helpers ────────────────────────────────────────────
  function _briefAgeTag(updatedAt) {
    if (!updatedAt) return "";
    const m = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60000);
    const lbl = m < 5 ? "刚刚" : m < 60 ? `${m}分钟前` : `${Math.floor(m / 60)}小时前`;
    return `<span style="font-size:9px;color:var(--fg-3);font-family:var(--f-mono)">${lbl}</span>`;
  }
  // Cache slot aligned to Beijing 09:30 / 21:30 — same logic as the API
  function _bjSlotKey() {
    const bjMs = Date.now() + 8 * 3600 * 1000;
    const bj   = new Date(bjMs);
    const h = bj.getUTCHours(), m = bj.getUTCMinutes();
    const eve = h > 21 || (h === 21 && m >= 30);
    const mor = !eve && (h > 9  || (h === 9  && m >= 30));
    if (eve) return bj.toISOString().slice(0, 10) + ":pm";
    if (mor) return bj.toISOString().slice(0, 10) + ":am";
    return new Date(bjMs - 86400000).toISOString().slice(0, 10) + ":pm";
  }
  function _saveBrief(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ ...data, _slot: _bjSlotKey() })); } catch (_) {}
  }
  function _loadBrief(key) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || "null");
      if (!data || data._slot !== _bjSlotKey()) return null;
      return data;
    } catch { return null; }
  }
  const MARKET_BRIEF_LS   = "trendo_brief_v1_market";
  const HOLDINGS_BRIEF_LS = "trendo_brief_v1_holdings";
  function _briefSummaryHTML(summary) {
    return summary.split(/\n+/).filter(l => l.trim())
      .map(l => `<div class="brief-line">${l.replace(/【(.+?)】/g, '<span class="brief-section-title">【$1】</span> ')}</div>`)
      .join("");
  }

  // ── Holdings brief ─────────────────────────────────────────────────────────
  function _renderHoldingsBrief(el, data) {
    const { summary, updatedAt, hasNews } = data;
    const timeStr = updatedAt
      ? new Date(updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "—";
    const newsTag = hasNews
      ? `<span style="font-size:9px;color:var(--fg-3);font-family:var(--f-mono)">含新闻</span>` : "";
    el.innerHTML = `
      <div class="brief-head">
        <span class="brief-badge">AI</span>
        <span class="brief-title">持仓分析 · Portfolio</span>
        ${newsTag}${_briefAgeTag(updatedAt)}
        <span class="brief-time">${timeStr} 更新</span>
        <button class="brief-toggle" title="收起/展开">▾</button>
        <button class="brief-refresh" title="重新生成">↻</button>
      </div>
      <div class="brief-body">
        <div class="brief-summary">${_briefSummaryHTML(summary)}</div>
      </div>`;
    if (localStorage.getItem("trendo_holdings_brief_collapsed") === "1") el.classList.add("collapsed");
    el.querySelector(".brief-toggle")?.addEventListener("click", () => {
      const collapsed = el.classList.toggle("collapsed");
      localStorage.setItem("trendo_holdings_brief_collapsed", collapsed ? "1" : "0");
    });
    el.querySelector(".brief-refresh")?.addEventListener("click", () => fetchHoldingsBrief(true));
  }

  function initHoldingsBriefCard() {
    const el = $("#holdings-brief");
    if (!el || !HOLDINGS.length) return;
    el.style.display = "";
    const saved = _loadBrief(HOLDINGS_BRIEF_LS);
    if (saved?.summary) { _renderHoldingsBrief(el, saved); return; }
    el.innerHTML = `
      <div class="brief-head">
        <span class="brief-badge">AI</span>
        <span class="brief-title">持仓分析 · Portfolio</span>
        <button class="brief-gen-btn" style="margin-left:auto">生成分析</button>
      </div>`;
    el.querySelector(".brief-gen-btn")?.addEventListener("click", () => fetchHoldingsBrief(false));
  }

  async function fetchHoldingsBrief(force = false) {
    const el = $("#holdings-brief");
    if (!el || !HOLDINGS.length) return;
    el.style.display = "";

    const refreshBtn = el.querySelector(".brief-refresh, .brief-gen-btn");
    if (refreshBtn?.classList.contains("brief-refresh")) refreshBtn.classList.add("spinning");
    else el.innerHTML = `<div class="brief-loading">正在分析持仓…</div>`;

    try {
      // Encode: sym:pnlPct:rMult:days:status:earnings:trimInfo
      // trimInfo format: "{trimPct}p{avgR}R" e.g. "33p+1.5R" = 33% already closed at avg +1.5R
      const holdStr = HOLDINGS.map(h => {
        const pnl  = h.pnlPct  != null ? h.pnlPct.toFixed(1)  : "0";
        const r    = h.rMult   != null ? h.rMult.toFixed(1)   : "0";
        const d    = h.days    ?? 0;
        const s    = h.status  || "ok";
        const earn = h.earnings || "";
        // Partial close info: look up same sym+entry+cost in CLOSED_POSITIONS
        const partials = CLOSED_POSITIONS.filter(c =>
          c.sym === h.sym && c.entry === h.entry && c.cost === h.cost && c.exitReason === "partial"
        );
        let trim = "";
        if (partials.length > 0) {
          const closedQty = partials.reduce((s, c) => s + (c.qty || 0), 0);
          const origQty   = closedQty + (h.qty || 0);
          const trimPct   = origQty > 0 ? Math.round(closedQty / origQty * 100) : 0;
          const avgR      = partials.reduce((s, c) => s + (c.rMult || 0), 0) / partials.length;
          trim = `${trimPct}p${avgR >= 0 ? "+" : ""}${avgR.toFixed(1)}R`;
        }
        return `${h.sym}:${pnl}:${r}:${d}:${s}:${earn}:${trim}`;
      }).join(",");

      const params = new URLSearchParams({ h: holdStr });
      if (force) params.set("force", "1");

      // Pass current market context
      const ctx = _lastMktCtx;
      if (ctx) {
        if (ctx.vix   != null) params.set("vix",      ctx.vix);
        if (ctx.fg    != null) params.set("fg",       ctx.fg);
        if (ctx.rsi   != null) params.set("rsi",      ctx.rsi);
        if (ctx.regime)        params.set("regime",   ctx.regime);
        if (ctx.vixTrend)      params.set("vixTrend", ctx.vixTrend);
        if (ctx.indices && Object.keys(ctx.indices).length)
          params.set("idx", Object.entries(ctx.indices).map(([s, v]) => `${s}:${v}`).join(","));
        if (ctx.sectors?.length)
          params.set("sect", [...ctx.sectors]
            .sort((a, b) => b.score - a.score)
            .map(s => `${s.sym}|${s.zh ?? s.sym}:${s.score}:${s.dailyChg ?? ""}`)
            .join(","));
      }

      const res = await fetch("/api/holdings-brief?" + params.toString(), { signal: AbortSignal.timeout(35000) });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const { summary, updatedAt, hasNews } = await res.json();
      const data = { summary, updatedAt, hasNews };
      _saveBrief(HOLDINGS_BRIEF_LS, data);
      _renderHoldingsBrief(el, data);
    } catch (e) {
      el.innerHTML = `
        <div class="brief-head">
          <span class="brief-badge">AI</span>
          <span class="brief-title">持仓分析 · Portfolio</span>
          <button class="brief-refresh" title="重试" style="margin-left:auto">↻</button>
        </div>
        <div class="brief-error">加载失败：${e.message}，点击重试</div>`;
      el.querySelector(".brief-refresh")?.addEventListener("click", () => fetchHoldingsBrief(true));
    }
  }

  // ── Market brief ───────────────────────────────────────────────────────────
  function _renderMarketBrief(el, data, mktCtx) {
    const { summary, headlines, updatedAt } = data;
    const timeStr = updatedAt
      ? new Date(updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "—";
    el.innerHTML = `
      <div class="brief-head">
        <span class="brief-badge">AI</span>
        <span class="brief-title">今日简报 · Daily Brief</span>
        ${_briefAgeTag(updatedAt)}
        <span class="brief-time">${timeStr} 更新</span>
        <button class="brief-toggle" title="收起/展开">▾</button>
        <button class="brief-refresh" title="重新生成">↻</button>
      </div>
      <div class="brief-body">
        <div class="brief-summary">${_briefSummaryHTML(summary)}</div>
        ${headlines?.length ? `
          <div class="brief-divider"></div>
          <div class="brief-headlines">${headlines.map(h => `<div class="brief-hl">${h}</div>`).join("")}</div>` : ""}
      </div>`;
    if (localStorage.getItem("trendo_brief_collapsed") === "1") el.classList.add("collapsed");
    el.querySelector(".brief-toggle")?.addEventListener("click", () => {
      const collapsed = el.classList.toggle("collapsed");
      localStorage.setItem("trendo_brief_collapsed", collapsed ? "1" : "0");
    });
    el.querySelector(".brief-refresh")?.addEventListener("click", () => fetchMarketBrief(true, mktCtx));
  }

  function initMarketBriefCard(mktCtx) {
    const el = $("#market-brief");
    if (!el) return;
    const saved = _loadBrief(MARKET_BRIEF_LS);
    if (saved?.summary) { _renderMarketBrief(el, saved, mktCtx); return; }
    el.innerHTML = `
      <div class="brief-head">
        <span class="brief-badge">AI</span>
        <span class="brief-title">今日简报 · Daily Brief</span>
        <button class="brief-gen-btn" style="margin-left:auto">生成简报</button>
      </div>`;
    el.querySelector(".brief-gen-btn")?.addEventListener("click", () => fetchMarketBrief(false, mktCtx));
  }

  async function fetchMarketBrief(force = false, mktCtx = null) {
    const el = $("#market-brief");
    if (!el) return;

    const refreshBtn = el.querySelector(".brief-refresh");
    if (refreshBtn) refreshBtn.classList.add("spinning");
    else el.innerHTML = `<div class="brief-loading">正在生成今日市场简报…</div>`;

    try {
      const params = new URLSearchParams();
      if (force) params.set("force", "1");
      if (mktCtx?.vix    != null) params.set("vix",      mktCtx.vix);
      if (mktCtx?.fg     != null) params.set("fg",       mktCtx.fg);
      if (mktCtx?.rsi    != null) params.set("rsi",      mktCtx.rsi);
      if (mktCtx?.regime)         params.set("regime",   mktCtx.regime);
      if (mktCtx?.vixTrend)       params.set("vixTrend", mktCtx.vixTrend);
      if (mktCtx?.direction)      params.set("dir",      mktCtx.direction);
      if (mktCtx?.posMax != null) params.set("posmax",   mktCtx.posMax);
      if (mktCtx?.sentiment)      params.set("senti",    mktCtx.sentiment);
      if (mktCtx?.indices && Object.keys(mktCtx.indices).length)
        params.set("idx", Object.entries(mktCtx.indices).map(([s, v]) => `${s}:${v}`).join(","));
      if (mktCtx?.sectors?.length)
        params.set("sect", [...mktCtx.sectors]
          .sort((a, b) => b.score - a.score)
          .map(s => `${s.sym}|${s.zh}:${s.score}:${s.dailyChg ?? ""}`)
          .join(","));
      if (mktCtx?.gex?.regime)
        params.set("gex", [mktCtx.gex.regime, mktCtx.gex.netGexBn, mktCtx.gex.posFactor,
          mktCtx.gex.distFlipPct, mktCtx.gex.daysToOpEx,
          mktCtx.gex.swingGexBn ?? "", mktCtx.gex.pctile ?? ""].join(":"));

      const res = await fetch("/api/market-summary?" + params.toString(), { signal: AbortSignal.timeout(25000) });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const { summary, headlines, updatedAt } = await res.json();
      const data = { summary, headlines, updatedAt };
      _saveBrief(MARKET_BRIEF_LS, data);
      _renderMarketBrief(el, data, mktCtx);
    } catch (e) {
      el.innerHTML = `
        <div class="brief-head">
          <span class="brief-badge">AI</span>
          <span class="brief-title">今日简报 · Daily Brief</span>
          <button class="brief-refresh" title="重试" style="margin-left:auto">↻</button>
        </div>
        <div class="brief-error">加载失败：${e.message}，点击右上角重试</div>`;
      el.querySelector(".brief-refresh")?.addEventListener("click", () => fetchMarketBrief(true, mktCtx));
    }
  }

  // ── Drawdown analogs (历史回撤参考) ─────────────────────────────────────────
  const DRAWDOWN_LS = "trendo_drawdown_v2";
  const DD_TIER_ORDER = ["normal", "significant", "sharp", "crash"];
  const DD_TIER_COLOR = { normal: "#eab308", significant: "#f97316", sharp: "#92400e", crash: "#ef4444" };
  const DD_TIER_RANGE = { normal: "−2~−3%", significant: "−3~−5%", sharp: "−5~−8%", crash: "≤−8%" };

  function _ddCell(c) {
    if (!c) return `<td class="dd-na">—</td>`;
    const clr = c.median >= 0 ? "var(--up)" : "var(--down)";
    return `<td><span class="dd-med" style="color:${clr}">${c.median >= 0 ? "+" : ""}${c.median}%</span>` +
      `<span class="dd-win">胜率 ${c.win}%</span></td>`;
  }

  function _ddBenchTable(benchName, stats, matchedTierId, isMatchBench) {
    if (!stats) return "";
    const rows = DD_TIER_ORDER.map(tid => {
      const t = stats[tid];
      if (!t) return "";
      const hit = isMatchBench && tid === matchedTierId;
      return `<tr class="${hit ? "dd-hit" : ""}">
        <td>
          <div class="dd-tier">
            <span class="dd-dot" style="background:${DD_TIER_COLOR[tid]}"></span>
            <span class="dd-tier-name">${t.label}</span>
            <span class="dd-range">${DD_TIER_RANGE[tid]}</span>
          </div>
          <div class="dd-n">${t.count}次</div>
        </td>
        ${_ddCell(t.fwd[5])}${_ddCell(t.fwd[10])}${_ddCell(t.fwd[20])}${_ddCell(t.fwd[50])}
      </tr>`;
    }).join("");
    const sy = stats._startYear;
    const spanLabel = sy ? `${sy}年起 · ${new Date().getFullYear() - sy}年` : "";
    // List crash (≤−8%) and sharp (−5~−8%) event dates — the small-sample, high-impact tiers
    const evLine = (tid, name) => {
      const evs = stats[tid]?.events;
      if (!evs?.length) return "";
      const txt = evs.slice().reverse().map(e => `${e.date}(${e.ret}%)`).join("、");
      return `<div class="dd-events"><span style="color:${DD_TIER_COLOR[tid]}">${name}</span> ${txt}</div>`;
    };
    return `<div class="dd-bench-label">${benchName}${spanLabel ? " · " + spanLabel : ""}</div>
      <table class="dd-table">
        <thead><tr><th>级别</th><th>5日</th><th>10日</th><th>20日</th><th>50日</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${evLine("crash", "崩跌")}${evLine("sharp", "急跌")}`;
  }

  // Monthly seasonality: VOO/QQQ month-over-month returns bucketed by calendar
  // month across all years of history (computed server-side from the same
  // fetch as the drawdown tiers above — see api/drawdown-context.js monthly).
  const MO_LABELS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];

  function _moCell(m) {
    if (!m || !m.count) return `<td class="dd-na">—</td>`;
    const clr = m.median >= 0 ? "var(--up)" : "var(--down)";
    return `<td title="均值 ${m.avg >= 0 ? "+" : ""}${m.avg}% · 波动(σ) ${m.std}% · 最好 +${m.best}% · 最差 ${m.worst}% · ${m.count}个样本">
      <span class="dd-med" style="color:${clr}">${m.median >= 0 ? "+" : ""}${m.median}%</span>
      <span class="dd-win">${m.win}%</span>
    </td>`;
  }

  function _mkMonthlyHTML(monthly) {
    if (!monthly || (!monthly.VOO && !monthly.QQQ)) return "";
    const row = (name, arr) => arr
      ? `<tr><td class="mo-sym">${name}</td>${arr.map(_moCell).join("")}</tr>` : "";
    return `<div class="dd-bench-label" style="margin-top:14px">月度季节性 · Monthly Seasonality</div>
      <div class="mo-scroll">
        <table class="mo-table">
          <thead><tr><th></th>${MO_LABELS.map(l => `<th>${l}</th>`).join("")}</tr></thead>
          <tbody>${row("VOO", monthly.VOO)}${row("QQQ", monthly.QQQ)}</tbody>
        </table>
      </div>
      <div class="dd-foot">按日历月分组：月末收盘价相对上月末收盘价的涨跌幅，同一月份跨多年样本取<b>中位数</b>与上涨概率（胜率，方块下方数字）；本月未收盘不计入。悬停格子查看均值/波动率/极值。</div>`;
  }

  function _renderDrawdown(el, data) {
    const { todayDrop, matched, stats, monthly, summary, updatedAt } = data;
    const timeStr = updatedAt
      ? new Date(updatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "—";
    const dropTag = `VOO ${todayDrop?.VOO != null ? (todayDrop.VOO >= 0 ? "+" : "") + todayDrop.VOO + "%" : "—"} · QQQ ${todayDrop?.QQQ != null ? (todayDrop.QQQ >= 0 ? "+" : "") + todayDrop.QQQ + "%" : "—"}`;
    const banner = matched
      ? `<div class="dd-banner" style="border-color:${DD_TIER_COLOR[matched.tierId]}55;background:${DD_TIER_COLOR[matched.tierId]}14">
           今日 <b>${matched.bench} ${matched.drop}%</b> → 归入 <b style="color:${DD_TIER_COLOR[matched.tierId]}">${matched.label}</b> 级别（下表高亮行）
         </div>`
      : `<div class="dd-banner dd-banner-calm">今日无显著单日下跌（${dropTag}），下表为历史参考</div>`;
    const aiBlock = summary
      ? `<div class="brief-summary dd-ai">${_briefSummaryHTML(summary)}</div>` : "";
    el.innerHTML = `
      <div class="brief-head">
        <span class="brief-badge" style="background:var(--down)">历史</span>
        <span class="brief-title">历史回撤参考 · Drawdown Analogs</span>
        ${_briefAgeTag(updatedAt)}
        <span class="brief-time">${timeStr} 更新</span>
        <button class="brief-toggle" title="收起/展开">▾</button>
        <button class="brief-refresh" title="重新生成">↻</button>
      </div>
      <div class="brief-body">
        ${banner}
        ${aiBlock}
        <div class="dd-tables">
          ${_ddBenchTable("VOO", stats?.VOO, matched?.tierId, matched?.bench === "VOO")}
          ${_ddBenchTable("QQQ", stats?.QQQ, matched?.tierId, matched?.bench === "QQQ")}
        </div>
        <div class="dd-foot">数据：Yahoo Finance（VOO 自2010年、QQQ 自1999年全历史）。某天单日跌幅落入某档后，<b>以当天收盘价为基准</b>，统计 N 个交易日后收盘价的涨跌幅；表内为所有同档历史样本的<b>中位数</b>与上涨概率（胜率）。样本少的档位（急跌/崩跌）仅供参考。</div>
        ${_mkMonthlyHTML(monthly)}
      </div>`;
    if (localStorage.getItem("trendo_drawdown_collapsed") === "1") el.classList.add("collapsed");
    el.querySelector(".brief-toggle")?.addEventListener("click", () => {
      const collapsed = el.classList.toggle("collapsed");
      localStorage.setItem("trendo_drawdown_collapsed", collapsed ? "1" : "0");
    });
    el.querySelector(".brief-refresh")?.addEventListener("click", () => fetchDrawdown(true));
  }

  function initDrawdownCard() {
    const el = $("#drawdown-card");
    if (!el) return;
    const saved = _loadBrief(DRAWDOWN_LS);
    if (saved?.stats) { _renderDrawdown(el, saved); return; }
    el.innerHTML = `
      <div class="brief-head">
        <span class="brief-badge" style="background:var(--down)">历史</span>
        <span class="brief-title">历史回撤参考 · Drawdown Analogs</span>
        <button class="brief-gen-btn" style="margin-left:auto">生成分析</button>
      </div>`;
    el.querySelector(".brief-gen-btn")?.addEventListener("click", () => fetchDrawdown(false));
  }

  async function fetchDrawdown(force = false) {
    const el = $("#drawdown-card");
    if (!el) return;
    const refreshBtn = el.querySelector(".brief-refresh");
    if (refreshBtn) refreshBtn.classList.add("spinning");
    else el.innerHTML = `<div class="brief-loading">正在计算历史回撤情景…</div>`;

    try {
      const params = new URLSearchParams({ gen: "1" });
      if (force) params.set("force", "1");
      const ctx = _lastMktCtx;
      if (ctx) {
        if (ctx.vix    != null) params.set("vix",    ctx.vix);
        if (ctx.direction)      params.set("dir",    ctx.direction);
        if (ctx.sentiment)      params.set("senti",  ctx.sentiment);
        if (ctx.regime)         params.set("regime", ctx.regime);
      }
      const res = await fetch("/api/drawdown-context?" + params.toString(), { signal: AbortSignal.timeout(35000) });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      _saveBrief(DRAWDOWN_LS, data);
      _renderDrawdown(el, data);
    } catch (e) {
      el.innerHTML = `
        <div class="brief-head">
          <span class="brief-badge" style="background:var(--down)">历史</span>
          <span class="brief-title">历史回撤参考 · Drawdown Analogs</span>
          <button class="brief-refresh" title="重试" style="margin-left:auto">↻</button>
        </div>
        <div class="brief-error">加载失败：${e.message}，点击右上角重试</div>`;
      el.querySelector(".brief-refresh")?.addEventListener("click", () => fetchDrawdown(true));
    }
  }

  // ============ SECTOR ROTATION ============
  const BENCH_SYM = "VOO";
  const SECTOR_ETFS = [
    { sym: "XLK",  zh: "科技",          en: "Technology",                  layer: 2 },
    { sym: "XLY",  zh: "非必需消费",     en: "Consumer Discretionary",      layer: 2 },
    { sym: "XLF",  zh: "金融",          en: "Financials",                  layer: 2 },
    { sym: "XLI",  zh: "工业",          en: "Industrials",                 layer: 2 },
    { sym: "XLE",  zh: "能源",          en: "Energy",                      layer: 2 },
    { sym: "XLV",  zh: "医疗健康",      en: "Health Care",                 layer: 2 },
    { sym: "XLP",  zh: "必需消费",      en: "Consumer Staples",            layer: 2 },
    { sym: "XLB",  zh: "材料",          en: "Materials",                   layer: 2 },
    { sym: "SMH",  zh: "半导体",        en: "Semiconductors",              layer: 3 },
    { sym: "IGV",  zh: "软件",          en: "Software",                    layer: 3 },
    { sym: "CLOU", zh: "云计算",        en: "Cloud Computing",             layer: 3 },
    { sym: "CIBR", zh: "网络安全",      en: "Cybersecurity",               layer: 3 },
    { sym: "DTCR", zh: "数据中心",      en: "Data Centers",                layer: 3 },
    { sym: "QTUM", zh: "量子计算",      en: "Quantum Computing",           layer: 3 },
    { sym: "BOTZ", zh: "机器人/AI",     en: "Robotics & AI",               layer: 3 },
    { sym: "ITA",  zh: "航空航天/国防",  en: "Aerospace & Defense",         layer: 3 },
    { sym: "UFO",  zh: "太空探索",      en: "Space Exploration",           layer: 3 },
    { sym: "XBI",  zh: "生物科技",      en: "Biotech",                     layer: 3 },
    { sym: "IBIT", zh: "比特币",        en: "Bitcoin",                     layer: 3 },
    { sym: "BKCH", zh: "区块链",        en: "Blockchain",                  layer: 3 },
    { sym: "GLD",  zh: "黄金",          en: "Gold",                        layer: 3 },
    { sym: "COPX", zh: "铜矿",          en: "Copper Mining",               layer: 3 },
    { sym: "REMX", zh: "稀土材料",      en: "Critical Materials",              layer: 3 },
    { sym: "GRID", zh: "清洁能源电网",  en: "Clean Energy Smart Grid",     layer: 3 },
    { sym: "MAGS", zh: "科技七巨头",    en: "Magnificent Seven",            layer: 3 },
    { sym: "URA",  zh: "铀矿/核能",     en: "Uranium & Nuclear Energy",     layer: 3 },
  ];

  let sectorView   = "card";
  let sectorFilter = "all";
  let sectorSort   = "score";
  let sectorData   = null;
  let vooStats     = null;

  function linregSlope(arr) {
    const n = arr.length;
    if (n < 2) return 0;
    const xm = (n - 1) / 2;
    const ym = arr.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xm) * (arr[i] - ym);
      den += (i - xm) * (i - xm);
    }
    return den === 0 ? 0 : +(num / den).toFixed(3);
  }

  function calcEtfStats(closes, vooCloses) {
    // The 5-day slope loop below anchors its oldest point 4 trading days back and
    // needs a 60-day-ago close relative to THAT day, i.e. index closes.length-65 —
    // not closes.length-61. A closes.length<62 guard let that index go negative
    // for borderline history windows (e.g. 95 calendar days ~ 65 trading days minus
    // a holiday cluster), silently falling back to today's score for the early
    // points and flattening/corrupting the slope. Require the full 65 here.
    if (!closes || closes.length < 65 || !vooCloses || vooCloses.length < 65) return null;
    const last = closes.at(-1), c20 = closes.at(-21), c60 = closes.at(-61);
    const retF = last / c20 - 1, retS = last / c60 - 1;
    const score = (retF * 1.0 + retS * 1.5) * 100;
    const vLast = vooCloses.at(-1), v20 = vooCloses.at(-21), v60 = vooCloses.at(-61);
    const a20 = retF - (vLast / v20 - 1);
    const a60 = retS - (vLast / v60 - 1);
    // 5-day score slope: rebuild the composite score as of each of the last 5
    // trading days (each using its own 20D/60D lookback anchor, matching a
    // per-bar Pine `score` series), then fit a line through those 5 points.
    const recent = [];
    for (let i = 4; i >= 0; i--) {
      const idx = closes.length - 1 - i;
      const c = closes[idx], c2 = closes[idx - 20], c6 = closes[idx - 60];
      recent.push(((c / c2 - 1) * 1.0 + (c / c6 - 1) * 1.5) * 100);
    }
    const slope = linregSlope(recent);
    let state, stateColor, stateClass;
    if      (a20 > 0 && a60 > 0)  { state = "主升 ✅"; stateColor = "#22c55e"; stateClass = "sect-up";    }
    else if (a20 > 0 && a60 <= 0) { state = "启动 🟠"; stateColor = "#f97316"; stateClass = "sect-start"; }
    else if (a20 <= 0 && a60 > 0) { state = "降温 🧊"; stateColor = "#38bdf8"; stateClass = "sect-cool";  }
    else                           { state = "弱势 ❌"; stateColor = "#ef4444"; stateClass = "sect-weak";  }
    return {
      retF:  +(retF  * 100).toFixed(2),
      retS:  +(retS  * 100).toFixed(2),
      score: +score.toFixed(2),
      a20:   +(a20   * 100).toFixed(2),
      a60:   +(a60   * 100).toFixed(2),
      slope, state, stateColor, stateClass,
    };
  }

  function getSortedFiltered() {
    if (!sectorData) return [];
    const list = sectorFilter === "sector" ? sectorData.filter(e => e.layer === 2)
               : sectorFilter === "theme"  ? sectorData.filter(e => e.layer === 3)
               : sectorData;
    const key = { score: "score", ret20: "retF", ret60: "retS", alpha20: "a20", slope: "slope" }[sectorSort] || "score";
    return [...list].sort((a, b) => b[key] - a[key]);
  }

  function sectCardHTML(item, rank) {
    const hot = rank <= 3 && item.stateClass === "sect-up";
    const badge = hot
      ? `<span class="sect-hot-badge">HOT</span>`
      : `<span class="sect-state-badge" style="background:${item.stateColor}20;color:${item.stateColor}">${item.state}</span>`;
    const gc = v => v >= 0 ? "#22c55e" : "#ef4444";
    const gs = v => v >= 0 ? "+" : "";
    return `
      <div class="sect-card ${item.stateClass}">
        <div class="sect-card-top"><span class="sect-rank">#${rank}</span>${badge}</div>
        <div class="sect-card-main">
          <span class="sect-card-sym">${item.sym}</span>
          <span class="sect-card-en">${item.en}</span>
        </div>
        <div class="sect-card-zh">${item.zh}</div>
        <div class="sect-card-score" style="color:${gc(item.score)}">${item.score >= 0 ? "↗" : "↘"} ${item.score.toFixed(1)}</div>
        <div class="sect-card-footer">
          <span class="sect-card-ret" style="color:${gc(item.retF)}">20D ${gs(item.retF)}${item.retF}%</span>
          <span class="sect-card-slope" style="color:${gc(item.slope)}">${item.slope >= 0 ? "▲" : "▼"} ${Math.abs(item.slope).toFixed(2)}</span>
        </div>
      </div>`;
  }

  function sectRowHTML(item, rank) {
    const gc = v => v >= 0 ? "#22c55e" : "#ef4444";
    const gs = v => v >= 0 ? "+" : "";
    const rankChg = item.rankPrev != null ? item.rankPrev - rank : null;
    const rankChgHTML = rankChg == null ? `<span style="color:var(--fg-3)">—</span>`
      : rankChg > 0 ? `<span style="color:#22c55e">▲${rankChg}</span>`
      : rankChg < 0 ? `<span style="color:#ef4444">▼${Math.abs(rankChg)}</span>`
      : `<span style="color:var(--fg-3)">—</span>`;
    return `<tr data-sym="${item.sym}" data-zh="${item.zh}" data-en="${item.en}" style="cursor:pointer">
      <td class="sc-rank">${rank}</td>
      <td class="sc-sym">${item.sym}</td>
      <td><div class="sc-name-en">${item.en}</div><div class="sc-name-zh">${item.zh}</div></td>
      <td class="sc-score" style="color:${gc(item.score)}">${gs(item.score)}${item.score.toFixed(1)}</td>
      <td style="color:${gc(item.retF)}">${gs(item.retF)}${item.retF}%</td>
      <td style="color:${gc(item.a20)}">${gs(item.a20)}${item.a20}%</td>
      <td style="color:${gc(item.retS)}">${gs(item.retS)}${item.retS}%</td>
      <td style="color:${gc(item.a60)}">${gs(item.a60)}${item.a60}%</td>
      <td class="sc-state" style="color:${item.stateColor}">${item.state}</td>
      <td class="sc-slope" style="color:${gc(item.slope)}">${item.slope >= 0 ? "▲" : "▼"} ${Math.abs(item.slope).toFixed(2)}</td>
      <td style="font-family:var(--f-mono);font-size:11.5px;text-align:center">${rankChgHTML}</td>
    </tr>`;
  }

  function renderSectorRotation() {
    const el = $("#sector-rotation");
    if (!el || !sectorData) return;
    const sorted = getSortedFiltered();

    const filterBtns = ["all", "sector", "theme"].map(f =>
      `<button class="sect-filter-btn${sectorFilter === f ? " active" : ""}" data-filter="${f}">${f === "all" ? "全部" : f === "sector" ? "板块" : "主题"}</button>`
    ).join("");

    const sortOpts = [["score","综合得分"],["ret20","20D"],["ret60","60D"],["alpha20","Alpha"],["slope","斜率"]].map(
      ([v, l]) => `<option value="${v}"${sectorSort === v ? " selected" : ""}>${l}</option>`
    ).join("");

    const viewBtns = `
      <div class="sect-view-toggle">
        <button class="sect-view-btn${sectorView === "card"  ? " active" : ""}" data-view="card">⊞</button>
        <button class="sect-view-btn${sectorView === "table" ? " active" : ""}" data-view="table">☰</button>
      </div>`;

    const body = sectorView === "card"
      ? `<div class="sect-cards">${sorted.map((e, i) => sectCardHTML(e, i + 1)).join("")}</div>`
      : `<div class="sect-table-wrap"><table class="sect-table">
          <thead><tr>
            <th>#</th><th>代码</th><th>板块 / 主题</th>
            <th>综合得分</th><th>20D</th><th>α20</th><th>60D</th><th>α60</th>
            <th>状态</th><th>5D斜率</th><th title="昨日排名变化">排名↕</th>
          </tr></thead>
          <tbody>${sorted.map((e, i) => sectRowHTML(e, i + 1)).join("")}</tbody>
        </table></div>`;

    const gc = v => v >= 0 ? "var(--up)" : "var(--down)";
    const gs = v => v >= 0 ? "+" : "";
    const vooBenchHTML = vooStats ? `
      <div class="voo-bench-strip">
        <span class="voo-bench-label">VOO</span>
        <span class="voo-bench-stat" style="color:${gc(vooStats.ret20)}">20D ${gs(vooStats.ret20)}${vooStats.ret20}%</span>
        <span class="voo-bench-divider">·</span>
        <span class="voo-bench-stat" style="color:${gc(vooStats.ret60)}">60D ${gs(vooStats.ret60)}${vooStats.ret60}%</span>
        <span class="voo-bench-divider">·</span>
        <span class="voo-bench-score" style="color:${gc(vooStats.score)}">${vooStats.score >= 0 ? "↗" : "↘"} ${vooStats.score.toFixed(1)}</span>
      </div>` : "";

    el.innerHTML = `
      <div class="sect-head">
        <div class="sect-title-row">
          <div class="sect-title">板块轮动 <span style="font-size:9px;color:var(--fg-3);font-weight:400;margin-left:4px">基准 VOO · ${sorted.length} 个</span></div>
          ${vooBenchHTML}
        </div>
        <div class="sect-controls">
          <div class="sect-filter">${filterBtns}</div>
          <select class="sect-sort" id="sect-sort-sel">${sortOpts}</select>
          ${viewBtns}
        </div>
      </div>
      ${body}`;

    el.querySelectorAll(".sect-view-btn").forEach(b =>
      b.addEventListener("click", () => { sectorView = b.dataset.view; renderSectorRotation(); })
    );
    el.querySelectorAll(".sect-filter-btn").forEach(b =>
      b.addEventListener("click", () => { sectorFilter = b.dataset.filter; renderSectorRotation(); })
    );
    const sel = el.querySelector("#sect-sort-sel");
    if (sel) sel.addEventListener("change", () => { sectorSort = sel.value; renderSectorRotation(); });

    // Click: open holdings panel
    el.querySelectorAll(".sect-card").forEach(card => {
      const sym = card.querySelector(".sect-card-sym")?.textContent?.trim();
      const etf = sectorData?.find(e => e.sym === sym);
      if (sym && etf) card.addEventListener("click", () => openHoldingsPanel(etf));
    });
    el.querySelectorAll("tr[data-sym]").forEach(row => {
      row.addEventListener("click", () => {
        const etf = sectorData?.find(e => e.sym === row.dataset.sym);
        if (etf) openHoldingsPanel(etf);
      });
    });
  }

  // ---- Holdings Panel ----
  const holdingsCache = {};

  function openHoldingsPanel(etf) {
    const panel = $("#hld-panel"), backdrop = $("#hld-backdrop");
    const head = $("#hld-head"), body = $("#hld-body"), footer = $("#hld-footer");
    if (!panel || !head || !body) return;

    head.innerHTML = `
      <div>
        <div class="hld-head-sym">${etf.sym}</div>
        <div class="hld-head-en">${etf.en}</div>
        <div class="hld-head-zh">${etf.zh}</div>
      </div>
      <button class="hld-close" id="hld-close-btn">✕</button>`;
    body.innerHTML = `<div class="hld-no-data">加载持仓数据…</div>`;
    if (footer) footer.innerHTML = "";

    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    backdrop?.classList.add("open");
    document.body.style.overflow = "hidden";

    $("#hld-close-btn")?.addEventListener("click", closeHoldingsPanel);
    backdrop?.addEventListener("click", closeHoldingsPanel, { once: true });

    fetchEtfHoldings(etf.sym).then(data => renderHoldings(body, footer, data));
  }

  function closeHoldingsPanel() {
    $("#hld-panel")?.classList.remove("open");
    $("#hld-backdrop")?.classList.remove("open");
    $("#hld-panel")?.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  async function fetchEtfHoldings(sym) {
    if (holdingsCache[sym]) return holdingsCache[sym];
    try {
      const res  = await fetch(`/api/holdings?symbol=${encodeURIComponent(sym)}`);
      const data = await res.json();
      holdingsCache[sym] = data;
      return data;
    } catch (e) {
      return { error: e.message };
    }
  }

  function renderHoldings(body, footer, data) {
    if (!body) return;
    if (!data || data.error || !data.holdings?.length) {
      const msg = data?.physical ? "该 ETF 为实物持仓（如黄金/比特币），无股票成分" : "暂无持仓数据";
      body.innerHTML = `<div class="hld-no-data">${msg}</div>`;
      if (footer) footer.innerHTML = "";
      return;
    }
    const list = data.holdings;
    const maxW  = list[0]?.weight || 1;
    const total = +list.reduce((s, h) => s + (h.weight || 0), 0).toFixed(1);

    body.innerHTML = list.map((h, i) => {
      const barW = h.weight != null ? (h.weight / maxW * 100).toFixed(1) : 0;
      return `
        <div class="hld-row">
          <span class="hld-num">${i + 1}</span>
          <span class="hld-code">${h.sym}</span>
          <span class="hld-name">${h.name}</span>
          <span class="hld-wt">${h.weight != null ? h.weight + "%" : "—"}</span>
          <div class="hld-bar-wrap"><div class="hld-bar" style="width:${barW}%"></div></div>
        </div>`;
    }).join("");

    if (footer) footer.innerHTML = `
      <span>前 ${list.length} 大持仓</span>
      <span>合计 <strong>${total}%</strong></span>`;
  }

  async function fetchSectorData() {
    const el = $("#sector-rotation");
    if (!el) return;
    el.innerHTML = `<div class="mkt-loading" style="padding:28px 20px">加载板块数据…</div>`;
    try {
      // 95 calendar days ~= 65 trading days, right at calcEtfStats' minimum for the
      // 5-day slope (needs 65 trading bars) — a holiday-heavy stretch could dip
      // below that. Widen the window for margin.
      const from = (() => { const d = new Date(); d.setDate(d.getDate() - 130); return d.toISOString().slice(0, 10); })();
      const syms = [BENCH_SYM, ...SECTOR_ETFS.map(e => e.sym)];
      const res  = await fetch(`/api/history?symbols=${syms.map(encodeURIComponent).join(",")}&from=${from}`);
      const data = await res.json();
      if (!data?.results) { el.innerHTML = `<div class="mkt-loading">无法加载板块数据</div>`; return; }

      const vooRaw = data.results[BENCH_SYM] || {};
      const vooCloses = Object.keys(vooRaw).sort().map(k => vooRaw[k]);

      if (vooCloses.length >= 62) {
        const r20 = vooCloses.at(-1) / vooCloses.at(-21) - 1;
        const r60 = vooCloses.at(-1) / vooCloses.at(-61) - 1;
        vooStats = {
          ret20: +(r20 * 100).toFixed(2),
          ret60: +(r60 * 100).toFixed(2),
          score: +((r20 * 1.0 + r60 * 1.5) * 100).toFixed(2),
        };
      }

      const vooClosesPrev = vooCloses.slice(0, -1);

      sectorData = SECTOR_ETFS.map(etf => {
        const raw = data.results[etf.sym] || {};
        const closes = Object.keys(raw).sort().map(k => raw[k]);
        const stats  = calcEtfStats(closes, vooCloses);
        if (!stats) return null;
        // Compute yesterday's score for rank-change calculation
        const statsPrev = calcEtfStats(closes.slice(0, -1), vooClosesPrev);
        // Daily % change
        const dailyChg = closes.length >= 2
          ? +((closes.at(-1) / closes.at(-2) - 1) * 100).toFixed(2)
          : null;
        return { ...etf, ...stats, scorePrev: statsPrev?.score ?? null, dailyChg };
      }).filter(Boolean);

      // Assign yesterday's ranks
      const prevSorted = [...sectorData]
        .filter(e => e.scorePrev != null)
        .sort((a, b) => b.scorePrev - a.scorePrev);
      prevSorted.forEach((e, i) => { e.rankPrev = i + 1; });

      renderSectorRotation();
      return sectorData;
    } catch (e) {
      el.innerHTML = `<div class="mkt-loading">Error: ${e.message}</div>`;
    }
  }

  // ============ SYNC PANEL ============
  function wireSyncPanel() {
    const btn   = document.getElementById("sync-btn");
    const panel = document.getElementById("sync-panel");
    if (!btn || !panel) return;

    btn.addEventListener("click", e => {
      e.stopPropagation();
      panel.classList.toggle("open");
      if (panel.classList.contains("open")) renderSyncPanel();
    });
    document.addEventListener("click", e => {
      if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove("open");
    });
  }

  function renderSyncPanel() {
    const panel = document.getElementById("sync-panel");
    if (!panel) return;
    const keyDisplay = syncKey || "(未生成)";
    panel.innerHTML = `
      <div class="sp-title">跨设备同步</div>
      <div class="sp-section">
        <div class="sp-label">你的同步密钥</div>
        <div class="sp-key-row" id="sp-key-view">
          <code class="sp-key">${keyDisplay}</code>
          ${syncKey ? `<button class="sp-copy" id="sp-copy-btn">复制</button>` : ""}
          ${syncKey ? `<button class="sp-edit-btn" id="sp-edit-btn">编辑</button>` : ""}
        </div>
        <div class="sp-key-row sp-key-edit-row" id="sp-key-edit" style="display:none">
          <input class="sp-input sp-key-edit-input" id="sp-key-edit-input" value="${syncKey}" placeholder="自定义密钥（最少8位）" maxlength="40">
          <button class="sp-action" id="sp-save-key">保存</button>
          <button class="sp-action sp-cancel-btn" id="sp-cancel-edit">取消</button>
        </div>
        ${syncKey ? `<div class="sp-hint">在其他设备上输入此密钥即可同步数据</div>` : ""}
        ${!syncKey ? `<button class="sp-action" id="sp-gen">生成密钥</button>` : ""}
      </div>
      <div class="sp-sep"></div>
      <div class="sp-section">
        <div class="sp-label">在此设备使用已有密钥</div>
        <div class="sp-input-row">
          <input class="sp-input" id="sp-key-input" placeholder="xxxx-xxxx-xxxx" value="">
          <button class="sp-action" id="sp-apply">载入</button>
        </div>
      </div>
      <div id="sync-status" class="sp-status" data-state="${syncKey ? 'pending' : 'off'}">
        ${syncKey ? (lastSyncAt ? `已同步 ${String(lastSyncAt.getHours()).padStart(2,"0")}:${String(lastSyncAt.getMinutes()).padStart(2,"0")}` : "同步中…") : "未同步"}
      </div>
    `;

    // Copy button
    document.getElementById("sp-copy-btn")?.addEventListener("click", function() {
      navigator.clipboard.writeText(syncKey).then(() => {
        this.textContent = "✓"; setTimeout(() => this.textContent = "复制", 1500);
      });
    });

    // Toggle to edit mode
    document.getElementById("sp-edit-btn")?.addEventListener("click", () => {
      document.getElementById("sp-key-view").style.display = "none";
      document.getElementById("sp-key-edit").style.display = "flex";
      document.getElementById("sp-key-edit-input").focus();
      document.getElementById("sp-key-edit-input").select();
    });

    // Cancel edit
    document.getElementById("sp-cancel-edit")?.addEventListener("click", () => {
      document.getElementById("sp-key-view").style.display = "flex";
      document.getElementById("sp-key-edit").style.display = "none";
    });

    // Save custom key
    const saveKey = async () => {
      const newKey = (document.getElementById("sp-key-edit-input")?.value || "").trim();
      if (newKey.length < 8) { alert("密钥至少需要 8 位字符"); return; }
      const btn = document.getElementById("sp-save-key");
      btn.textContent = "保存中…"; btn.disabled = true;
      syncKey = newKey;
      localStorage.setItem("trendo_sync_key", syncKey);
      await syncPush();
      renderSyncPanel();
      renderSyncStatus();
    };
    document.getElementById("sp-save-key")?.addEventListener("click", saveKey);
    document.getElementById("sp-key-edit-input")?.addEventListener("keydown", e => {
      if (e.key === "Enter") saveKey();
      if (e.key === "Escape") document.getElementById("sp-cancel-edit")?.click();
    });

    document.getElementById("sp-gen")?.addEventListener("click", async () => {
      syncKey = generateSyncKey();
      localStorage.setItem("trendo_sync_key", syncKey);
      renderSyncPanel();
      renderSyncStatus();
      await syncPush();
    });

    document.getElementById("sp-apply")?.addEventListener("click", async () => {
      const input = document.getElementById("sp-key-input");
      const key = (input?.value || "").trim();
      if (key.length < 8) return;
      const btn = document.getElementById("sp-apply");
      btn.textContent = "载入中…"; btn.disabled = true;
      const data = await syncPull(key);
      if (data) {
        syncKey = key;
        localStorage.setItem("trendo_sync_key", syncKey);
        applyCloudData(data);
        lastSyncAt = new Date();
        renderSyncPanel();
        renderSyncStatus();
      } else {
        btn.textContent = "未找到数据"; btn.disabled = false;
        setTimeout(() => { btn.textContent = "载入"; btn.disabled = false; }, 2000);
      }
    });

  }

  // ============ TICKER TAPE ============
  function renderTape() {
    const track = document.getElementById("tape-track");
    if (!track) return;
    if (!HOLDINGS.length) return;
    const items = HOLDINGS.slice(0, 20).map(h => {
      const p = h.last >= 1000
        ? h.last.toLocaleString("en-US", { maximumFractionDigits: 0 })
        : h.last.toFixed(2);
      const c = +(h.changePct ?? 0).toFixed(2);
      return { s: h.sym, p, c };
    });
    const html = items.map(i => {
      const cls = i.c >= 0 ? "up" : "down";
      const sign = i.c >= 0 ? "+" : "−";
      return `<span class="ti"><span class="s">${i.s}</span><span class="p">${i.p}</span><span class="c ${cls}">${sign}${Math.abs(i.c).toFixed(2)}%</span></span>`;
    }).join("");
    track.innerHTML = html + html;
  }
  function wireHoldingsViewToggle() {
    const btn = document.getElementById("holdings-view-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      holdingsViewMode = holdingsViewMode === "list" ? "card" : "list";
      localStorage.setItem("trendo_holdings_view", holdingsViewMode);
      renderTable();
    });
  }

  function wireSimHoldingsViewToggle() {
    const btn = document.getElementById("sim-holdings-view-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      simHoldingsViewMode = simHoldingsViewMode === "list" ? "card" : "list";
      localStorage.setItem("trendo_sim_holdings_view", simHoldingsViewMode);
      renderSimTable();
    });
  }

  function initPullToRefresh() {
    if (window.innerWidth > 768) return;
    const ptrEl = document.getElementById("ptr-indicator");
    const ptrTxt = document.getElementById("ptr-text");
    if (!ptrEl) return;
    const THRESHOLD = 65;
    let startY = 0, pulling = false;

    document.addEventListener("touchstart", e => {
      startY = e.touches[0].clientY;
      pulling = window.scrollY <= 0;
    }, { passive: true });

    document.addEventListener("touchmove", e => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) return;
      const prog = Math.min(dy / THRESHOLD, 1);
      ptrEl.style.opacity = prog.toFixed(2);
      ptrEl.style.height = Math.min(dy * 0.45, 40) + "px";
      if (ptrTxt) ptrTxt.textContent = dy >= THRESHOLD ? "释放以刷新" : "下拉刷新";
      ptrEl.classList.toggle("ptr-ready", dy >= THRESHOLD);
    }, { passive: true });

    document.addEventListener("touchend", () => {
      if (!pulling) return;
      pulling = false;
      const wasReady = ptrEl.classList.contains("ptr-ready");
      ptrEl.classList.remove("ptr-ready");
      if (!wasReady) {
        ptrEl.style.opacity = "0";
        ptrEl.style.height = "0";
        return;
      }
      ptrEl.classList.add("ptr-spinning");
      if (ptrTxt) ptrTxt.textContent = "正在刷新…";
      ptrEl.style.height = "38px";
      ptrEl.style.opacity = "1";
      fetchPrices().finally(() => {
        ptrEl.classList.remove("ptr-spinning");
        ptrEl.style.opacity = "0";
        ptrEl.style.height = "0";
      });
    }, { passive: true });
  }

  loadFromStorage();

  // Retroactively stamp existing data saved before savedAt tracking was added.
  // Use epoch 0 so cloud always wins on first sync — prevents mobile from pushing stale data.
  if (!localStorage.getItem("trendo_v4_savedAt")) {
    localStorage.setItem("trendo_v4_savedAt", "1970-01-01T00:00:00.000Z");
  }
  // iOS Safari: position:fixed inside position:sticky fails to anchor to viewport.
  // Move navbar to <body> so it correctly pins to the bottom on mobile.
  if (window.innerWidth <= 768) {
    const nav = document.querySelector(".navbar");
    if (nav) document.body.appendChild(nav);
  }

  renderTape();
  wireHost();
  renderOverview();
  renderTable();
  renderBottom();
  if (HOLDINGS.length > 0) initHoldingsBriefCard();
  wireHoldingsViewToggle();
  wireSimHoldingsViewToggle();
  initPullToRefresh();
  wireControls();
  wireTweaks();
  wireTableTabs();
  wireNewPositionModal();
  $("#add-to-close")?.addEventListener("click",  () => closeModal("add-to-modal"));
  $("#add-to-cancel")?.addEventListener("click", () => closeModal("add-to-modal"));
  $("#cc-close")?.addEventListener("click",  () => closeModal("cc-modal"));
  $("#cc-cancel")?.addEventListener("click", () => closeModal("cc-modal"));
  wireEquityModal();
  wireClosePositionModal();
  wireDeleteModal();
  wireWatchlistForm();
  wireSimControls();
  wireSyncPanel();
  renderSyncStatus();
  // After startup sync settles, propagate any local-only full analysis content up to
  // the cloud. Runs AFTER reconciliation so bumping savedAt can't clobber newer cloud
  // data. This is what lets a stock analyzed days ago (before _fullData existed) become
  // visible on every other device without re-calling the API.
  // Re-derive scores/grade/recommendation for every history record from its stored
  // _fullData, so scoring-rule changes apply to ALL cards on load — not lazily on open
  // — with zero API calls. Returns true if any entry's grade/overall shifted.
  function upgradeAnalysisHistory() {
    let changed = false;
    analysisHistory.forEach(e => {
      const fd = e._fullData;
      if (!fd?._date || fd.price == null) return;
      _upgradeAnalysis(fd);
      const s = fd.scores || {};
      if (e.grade !== s.grade || e.overall !== s.overall) {
        e.grade = s.grade ?? e.grade;
        e.overall = s.overall ?? e.overall;
        changed = true;
      }
      // Keep the per-symbol localStorage cache consistent with the upgraded copy
      try { localStorage.setItem(`wl_analysis_${e.sym}`, JSON.stringify(fd)); } catch (_) {}
    });
    return changed;
  }

  function backfillAnalysisFullData() {
    const changed = _fillHistFullData(analysisHistory);
    _restoreHistCache(analysisHistory);
    const upgraded = upgradeAnalysisHistory();
    if (changed || upgraded) {
      saveToStorage(); // bumps savedAt + schedules syncPush → other devices pull the full content
      if (currentPage === "inspirations" && inspSubTab === "watchlist") renderAnalysisHistory();
    }
  }
  // Sync strategy: last-write-wins based on savedAt timestamp.
  // On startup: fetch cloud, compare timestamps, pull if cloud is newer else push.
  // This ensures cross-device changes (e.g. desktop → mobile) propagate automatically.
  if (syncKey) syncOnStartup().finally(backfillAnalysisFullData);
  else backfillAnalysisFullData();
  // Re-pull when the tab regains focus: the background order worker
  // (api/order-check.js) may have filled sim pending orders while this tab was
  // throttled/asleep. Pull-if-newer prevents a stale local push from
  // resurrecting an already-executed order.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      if (syncKey) syncOnStartup();
      // Force immediate price refresh so pending orders execute as soon as the tab is active
      lastPriceFetch = 0;
    }
  });
  // Push to cloud on page close so pending orders reach Redis even if the 2s
  // debounce timer didn't fire (e.g. tab closed immediately after adding an order).
  // sendBeacon is guaranteed to complete after page close; keepalive fetch would
  // also work but sendBeacon needs no auth header (key travels in the URL).
  window.addEventListener("pagehide", () => {
    if (!syncKey) return;
    clearTimeout(syncTimer);
    try {
      const blob = new Blob([JSON.stringify(_buildSyncPayload())], { type: "application/json" });
      navigator.sendBeacon(`/api/data?key=${encodeURIComponent(syncKey)}`, blob);
    } catch (_) {}
  });
  // Restore last visited page so refresh doesn't always reset to Dashboard
  let _lastPage = localStorage.getItem("trendo_last_page");
  if (_lastPage === "journal" || _lastPage === "watchlist") _lastPage = "inspirations";
  if (_lastPage && _lastPage !== "desk") switchPage(_lastPage);

  tick(); setInterval(tick, 1000);

})();
