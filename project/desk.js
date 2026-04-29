// ========= Swing Desk — render + interactions =========
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

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
    const eqCount  = HOLDINGS.filter(h => h.kind === "equity").length;
    const etfCount = HOLDINGS.filter(h => h.kind === "etf").length;
    const crCount  = HOLDINGS.filter(h => h.kind === "crypto").length;
    const eqLabel  = eqCount + (etfCount > 0 ? `+${etfCount}ETF` : "") + " 美股";
    const pnlSign = fmt.sign(totalPnlDollar);

    // Today PnL: real calculation from prevClose
    const todayPnl = HOLDINGS.reduce((sum, h) => sum + Math.round(((h.last || 0) - (h.prevClose || h.last || 0)) * (h.qty || 0)), 0);
    const todayPct = totalNotional > 0 ? todayPnl / totalNotional : 0;
    const todaySign = fmt.sign(todayPnl);

    const portfolioValue = totalNotional + totalPnlDollar;

    const ov = $("#overview");
    ov.innerHTML = `
      <div class="ov-card" id="nav-card">
        <div class="label" style="justify-content:space-between">总资产<button class="nav-edit-btn" title="Edit base NAV">✎</button></div>
        <div class="value">$${portfolioValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
        <div class="sub"><span class="muted">基准 $${totalNotional.toLocaleString("en-US",{maximumFractionDigits:0})} <span class="${pnlSign}" style="font-size:10.5px">${totalPnlDollar >= 0 ? "+" : ""}${fmt.signed(totalPnlDollar)}</span></span></div>
      </div>
      ${card({
        label: "总浮盈 / 浮亏", info: false,
        value: `<span class="${pnlSign}">${fmt.signed(totalPnlDollar)}</span>`,
        sub: `<span class="chip ${pnlSign}">${fmt.pct(totalPnlPct)}</span><span class="muted">${winners}W · ${losers}L</span>`,
        spark: barBalanceSVG(Math.max(winners, 1), Math.max(losers, 0), 90, 36)
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
        sub: `<span class="chip neu">${eqLabel}</span><span class="chip neu">${crCount} 加密</span>`,
        spark: ""
      })}
      ${pieCard()}
    `;
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
          <span class="tiny">仓位分布</span>
          <span class="big">${invested.toFixed(0)}% <span class="tiny">已投</span></span>
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
    { val: -2, label: "−2", sub: "Bearish",    cls: "bx-down"   },
    { val: -1, label: "−1", sub: "→ Bull",     cls: "bx-warn"   },
    { val:  0, label: " 0", sub: "Neutral",    cls: "bx-neu"    },
    { val:  1, label: "+1", sub: "Less Bull",  cls: "bx-softup" },
    { val:  2, label: "+2", sub: "Bullish",    cls: "bx-up"     },
  ];
  const SWATCH_COLORS = [
    "oklch(0.70 0.16 200)", "oklch(0.68 0.17 260)", "oklch(0.72 0.14 280)",
    "oklch(0.72 0.14 320)", "oklch(0.70 0.16 340)", "oklch(0.70 0.18 25)",
    "oklch(0.72 0.16 40)",  "oklch(0.78 0.13 90)",  "oklch(0.75 0.14 140)",
    "oklch(0.74 0.15 170)", "oklch(0.72 0.16 60)",  "oklch(0.35 0.01 250)",
  ];
  const slopeNumClass   = v => { const n = parseFloat(v); return n > 0 ? "up" : n < 0 ? "down" : "flat"; };
  const slopeNumDisplay = v => { const n = parseFloat(v) || 0; return n > 0 ? `+${n}` : `${n}`; };

  const slopeClass = v => parseFloat(v) > 0 ? "up" : parseFloat(v) < 0 ? "down" : "flat";

  function bxSectionHTML(h) {
    const bx = h.bx;
    const scoreButtons = field => BX_SCORE_OPTS.map(o => `
      <button class="bx-score-btn ${o.cls} ${bx[field] === o.val ? "active" : ""}"
              data-bx-field="${field}" data-bx-val="${o.val}">
        <span class="bx-val">${o.label}</span>
        <span class="bx-sub">${o.sub}</span>
      </button>`).join("");
    const getSlopeDir = obj => {
      if (obj.slopeDir !== undefined) return obj.slopeDir;
      const n = parseFloat(obj.slope) || 0;
      return n > 0 ? 1 : n < 0 ? -1 : 0;
    };
    const slopeCell = (field, val, dir) => {
      const n = parseFloat(val) || 0;
      const d = dir ?? 0;
      const tint = d > 0 ? "tint-up" : d < 0 ? "tint-down" : "tint-flat";
      return `<div class="bx-slope-cell">
        <input type="number" class="bx-slope-input ${tint}" data-slope-field="${field}" value="${n}" step="0.1">
        <div class="bx-slope-dots">
          <button class="bx-dot up${d > 0 ? ' active' : ''}" data-dir-field="${field}" data-dot-val="1" title="上升"></button>
          <button class="bx-dot flat${d === 0 ? ' active' : ''}" data-dir-field="${field}" data-dot-val="0" title="中性"></button>
          <button class="bx-dot down${d < 0 ? ' active' : ''}" data-dir-field="${field}" data-dot-val="-1" title="下降"></button>
        </div>
      </div>`;
    };
    const colorStrip = () => `
      <div class="bx-color-inline">
        ${SWATCH_COLORS.map(c => `<button class="bx-color-opt${bx.sector.color===c?' active':''}"
          style="background:${c}" data-color-val="${c}" title="${c}"></button>`).join('')}
      </div>`;
    return `
      <div class="drawer-section">
        <h4><span class="idx">02</span>BX Trend &amp; 市场背景</h4>

        <div class="bx-row">
          <div class="bx-row-label">Daily BX Trend <span class="bx-hint">入场后第 ${h.days} 日</span></div>
          <div class="bx-daily-seg">
            ${["0-5","5-15","15+"].map(v => `
              <button class="bx-daily-btn ${bx.dailyBars === v ? "active" : ""}"
                      data-bx-field="dailyBars" data-bx-val="${v}">
                ${v}<span class="bx-sub">bars</span>
              </button>`).join("")}
          </div>
        </div>

        <div class="bx-row">
          <div class="bx-row-label">Weekly BX</div>
          <div class="bx-score-seg">${scoreButtons("weekly")}</div>
        </div>

        <div class="bx-row">
          <div class="bx-row-label">Monthly BX</div>
          <div class="bx-score-seg">${scoreButtons("monthly")}</div>
        </div>

        ${colorStrip()}
        <div class="bx-align-grid">
          <div class="bx-align-hdr">
            <span></span><span class="bx-meta-lbl">Score</span><span class="bx-meta-lbl">Slope</span>
          </div>
          <div class="bx-align-row">
            <div class="bx-align-label">
              <span class="bx-name" contenteditable="true"
                    data-bx-field="sectorName" spellcheck="false"
                    style="background:${bx.sector.color}">${bx.sector.name}</span>
            </div>
            <span class="bx-chip-score" contenteditable="true"
                  data-bx-field="sectorScore">${bx.sector.score}</span>
            ${slopeCell("sectorSlope", bx.sector.slope, getSlopeDir(bx.sector))}
          </div>
          <div class="bx-align-row">
            <div class="bx-align-label">
              <span class="bx-meta-lbl" style="font-size:11px;text-transform:none;letter-spacing:0;color:var(--fg-1)">Overall vs VOO</span>
            </div>
            <span class="bx-chip-score" contenteditable="true"
                  data-bx-field="overallScore">${bx.overall.score}</span>
            ${slopeCell("overallSlope", bx.overall.slope, getSlopeDir(bx.overall))}
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
      drawerNote.addEventListener("blur", () => { h.journalNote = drawerNote.value; saveToStorage(); });
    }
  }

  function wireBX(h) {
    const dr = $("#drawer");

    // Slope number input — saves only the numeric value, no dot sync
    $$(".bx-slope-input", dr).forEach(input => {
      const commit = () => {
        const n = parseFloat(input.value) || 0;
        if (input.dataset.slopeField === "sectorSlope") h.bx.sector.slope = n;
        else h.bx.overall.slope = n;
        saveToStorage();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
    });

    // Slope color dots — saves only direction, independent of number; also tints input
    $$(".bx-dot[data-dir-field]", dr).forEach(dot => {
      dot.addEventListener("click", () => {
        const field = dot.dataset.dirField;
        const d = parseFloat(dot.dataset.dotVal);
        if (field === "sectorSlope") h.bx.sector.slopeDir = d;
        else h.bx.overall.slopeDir = d;
        $$(`[data-dir-field="${field}"].bx-dot`, dr).forEach(b =>
          b.classList.toggle("active", parseFloat(b.dataset.dotVal) === d)
        );
        const tint = d > 0 ? "tint-up" : d < 0 ? "tint-down" : "tint-flat";
        const inp = $(`[data-slope-field="${field}"].bx-slope-input`, dr);
        if (inp) { inp.classList.remove("tint-up", "tint-flat", "tint-down"); inp.classList.add(tint); }
        saveToStorage();
      });
    });

    // Inline color strip — click a color to immediately apply it
    $$(".bx-color-opt", dr).forEach(opt => {
      opt.addEventListener("click", () => {
        const c = opt.dataset.colorVal;
        h.bx.sector.color = c;
        const nameEl = $("[data-bx-field='sectorName']", dr);
        if (nameEl) nameEl.style.background = c;
        $$(".bx-color-opt", dr).forEach(o => o.classList.toggle("active", o.dataset.colorVal === c));
        saveToStorage();
      });
    });

    // Score/bars buttons
    $$("[data-bx-field][data-bx-val]", dr).forEach(btn => {
      if (btn.tagName !== "BUTTON") return;
      btn.addEventListener("click", () => {
        const field = btn.dataset.bxField;
        if (field === "dailyBars") {
          h.bx.dailyBars = btn.dataset.bxVal;
          $$(`[data-bx-field="dailyBars"]`, dr).forEach(b => b.classList.toggle("active", b.dataset.bxVal === h.bx.dailyBars));
        } else if (field === "weekly" || field === "monthly") {
          h.bx[field] = +btn.dataset.bxVal;
          $$(`[data-bx-field="${field}"]`, dr).forEach(b => b.classList.toggle("active", +b.dataset.bxVal === h.bx[field]));
        }
        saveToStorage();
      });
    });

    $$("[contenteditable][data-bx-field]", dr).forEach(el => {
      el.addEventListener("blur", () => {
        const v = el.textContent.trim(), f = el.dataset.bxField;
        if (f === "sectorName")   h.bx.sector.name   = v;
        if (f === "sectorScore")  h.bx.sector.score  = v;
        if (f === "overallScore") h.bx.overall.score = v;
        saveToStorage();
      });
      el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
    });
  }

  // ============ GLOBAL STATE ============

  // Logo fallback: primary source → TradingView → hide (show text initials)
  window._trLogoErr = function(img, sym, kind) {
    if (!img.dataset.tried) {
      img.dataset.tried = "1";
      img.src = kind === "crypto"
        ? `https://s3-symbol-logo.tradingview.com/crypto/XTVC${sym.toUpperCase()}--big.svg`
        : `https://s3-symbol-logo.tradingview.com/${sym.toUpperCase()}--big.svg`;
    } else {
      img.style.display = "none";
    }
  };

  function logoImg(h) {
    const src = h.kind === "crypto"
      ? `https://assets.coincap.io/assets/icons/${h.sym.toLowerCase()}@2x.png`
      : `https://financialmodelingprep.com/image-stock/${h.sym}.png`;
    return `<img src="${src}" loading="lazy" decoding="async" onerror="_trLogoErr(this,'${h.sym}','${h.kind || ""}')">`;
  }

  let sortKey = "pnl", sortDir = -1, filter = "all", query = "", selectedSym = null;
  let activeTab = "open";
  let totalNotional = 60000;
  let reviewPeriod = "week";
  let pendingCloseSym = null;
  let pendingDeleteSym = null, pendingDeleteFrom = null;
  let currentPage = "desk";
  let journalFilter = "all";
  let equityPeriod = "week";

  // Simulation state
  let simActiveTab = "open";
  let simSortKey = "pnl", simSortDir = -1;
  let simFilter = "all", simQuery = "";
  let simSelectedSym = null;
  let simNotional = 100000;
  let newPositionContext = "desk"; // "desk" | "sim"
  let pendingCloseCtx = "desk";
  let pendingDeleteCtx = "desk";
  let lastPriceFetch = 0;
  const PRICE_INTERVAL_MS = 30000;

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
    const payload = {
      holdings: HOLDINGS, closed: CLOSED_POSITIONS, notional: totalNotional,
      watchlist: WATCHLIST, simHoldings: SIM_HOLDINGS, simClosed: SIM_CLOSED,
      simNotional, savedAt: new Date().toISOString()
    };
    try {
      const r = await fetch(`/api/data?key=${encodeURIComponent(syncKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (r.ok) { lastSyncAt = new Date(); renderSyncStatus(); }
      else       { renderSyncStatus("error"); }
    } catch (_) { renderSyncStatus("error"); }
  }

  async function syncPull(key) {
    try {
      const r = await fetch(`/api/data?key=${encodeURIComponent(key)}`);
      if (!r.ok) return null;
      const { data } = await r.json();
      return data;
    } catch (_) { return null; }
  }

  function applyCloudData(data) {
    if (!data) return;
    // Use Array.isArray checks — plain `if ([])` is always truthy, even for empty arrays
    if (Array.isArray(data.holdings))    HOLDINGS.splice(0, HOLDINGS.length, ...data.holdings);
    if (Array.isArray(data.closed))      CLOSED_POSITIONS.splice(0, CLOSED_POSITIONS.length, ...data.closed);
    if (data.notional != null)           totalNotional = data.notional;
    if (Array.isArray(data.watchlist))   WATCHLIST.splice(0, WATCHLIST.length, ...data.watchlist);
    if (Array.isArray(data.simHoldings)) SIM_HOLDINGS.splice(0, SIM_HOLDINGS.length, ...data.simHoldings);
    if (Array.isArray(data.simClosed))   SIM_CLOSED.splice(0, SIM_CLOSED.length, ...data.simClosed);
    if (data.simNotional != null)        simNotional = data.simNotional;
    // Persist locally then re-render
    saveLocalOnly();
    renderOverview(); renderTable(); renderTape();
    if (currentPage === "journal")   renderJournal();
    if (currentPage === "sim")       renderSim();
    if (currentPage === "analytics") renderAnalytics();
    if (currentPage === "watchlist") renderWatchlist();
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

  // ============ PERSISTENCE ============
  function saveLocalOnly() {
    try {
      localStorage.setItem("trendo_v4_holdings",     JSON.stringify(HOLDINGS));
      localStorage.setItem("trendo_v4_closed",       JSON.stringify(CLOSED_POSITIONS));
      localStorage.setItem("trendo_v4_notional",     String(totalNotional));
      localStorage.setItem("trendo_v4_watchlist",    JSON.stringify(WATCHLIST));
      localStorage.setItem("trendo_v4_sim_holdings", JSON.stringify(SIM_HOLDINGS));
      localStorage.setItem("trendo_v4_sim_closed",   JSON.stringify(SIM_CLOSED));
      localStorage.setItem("trendo_v4_sim_notional", String(simNotional));
      localStorage.setItem("trendo_v4_savedAt",      new Date().toISOString());
    } catch (e) { /* storage unavailable */ }
  }

  function saveToStorage() {
    saveLocalOnly();
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncPush, 2000);
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
    } catch (e) { /* corrupted storage, use defaults */ }
  }

  // ============ DERIVED FIELD RECOMPUTE ============
  function recomputeHolding(h, notional) {
    const base = notional ?? totalNotional;
    h.qty = Math.round((h.size / 100 * base) / h.cost);
    h.pnlDollar = Math.round((h.last - h.cost) * h.qty);
    h.pnlPct = h.cost > 0 ? (h.last - h.cost) / h.cost : 0;
    h.risk1R = h.stop ? h.cost - h.stop : 0;
    h.rMult = h.risk1R !== 0 ? (h.last - h.cost) / h.risk1R : 0;
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
      const label = (activeTab === "closed" && c.id === "last") ? "平仓价" : c.label;
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
      if (filter === "equity" && !["equity", "etf"].includes(h.kind)) return false;
      if (filter === "crypto" && h.kind !== "crypto") return false;
      if (filter === "risk") {
        const bucket = progressBucket(h);
        if (!["Early", "Near Stop"].includes(bucket)) return false;
      }
      if (filter === "target") {
        const bucket = progressBucket(h);
        if (bucket !== "Near Target") return false;
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

    // body
    const cols = COLS.filter(c => c.on && !(activeTab === "closed" && c.closedHide));
    $("#tbody").innerHTML = rows.map(h => {
      const isSel = selectedSym === h.sym ? "selected" : "";
      const cells = cols.map(c => renderCell(h, c.id)).join("");
      // Open: archive + delete; Closed: delete only
      const actions = activeTab === "open"
        ? `<td style="width:60px;padding:6px 4px"><div class="row-actions">
             <button class="close-pos-btn" data-sym="${h.sym}" title="平仓 (归档)">⊟</button>
             <button class="delete-btn" data-sym="${h.sym}" title="永久删除">✕</button>
           </div></td>`
        : `<td style="width:40px;padding:6px 4px"><div class="row-actions">
             <button class="delete-btn" data-sym="${h.sym}" data-from="closed" title="永久删除">✕</button>
           </div></td>`;
      return `<tr class="${isSel}" data-sym="${h.sym}">${cells}${actions}</tr>`;
    }).join("");

    $$("#tbody tr").forEach(tr => {
      tr.addEventListener("click", e => {
        if (e.target.closest(".close-pos-btn, .delete-btn")) return;
        openDrawer(tr.dataset.sym);
      });
    });

    // Archive button: open close-position modal
    $$(".close-pos-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        openCloseModal(btn.dataset.sym);
      });
    });

    // Delete button: open delete confirmation modal
    $$(".delete-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        openDeleteModal(btn.dataset.sym, btn.dataset.from || "open");
      });
    });

    // counts
    const rc = $("#row-count"); if (rc) rc.textContent = rows.length;
    $("#c-all").textContent = data.length;
    $("#c-eq").textContent = data.filter(h => h.kind === "equity").length;
    $("#c-cr").textContent = data.filter(h => h.kind === "crypto").length;
    $("#c-rk").textContent = data.filter(h => ["Early", "Near Stop"].includes(progressBucket(h))).length;
    $("#c-tg").textContent = data.filter(h => progressBucket(h) === "Near Target").length;
    $("#c-open").textContent = HOLDINGS.length;
    $("#c-closed").textContent = CLOSED_POSITIONS.length;
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
        const v = h.bx.dailyBars;
        const cls = v === "0-5" ? "bxbar-early" : (v === "5-15" ? "bxbar-mid" : "bxbar-late");
        const lbl = v === "0-5" ? "开始" : (v === "5-15" ? "中间" : "延续");
        return `<td><span class="bx-bar-chip ${cls}">${v}<span class="bx-bar-sub">${lbl}</span></span></td>`;
      }
      case "cost": return `<td class="right num muted">$${price(h.cost)}</td>`;
      case "last": {
        const p = (activeTab === "closed" && h.closePrice != null) ? h.closePrice : h.last;
        return `<td class="right num" style="font-weight:600">$${price(p)}</td>`;
      }
      case "qty": return `<td class="right num muted">${h.qty.toLocaleString("en-US")}</td>`;
      case "pnl": return `<td class="right"><div class="pnl-cell"><span class="num ${fmt.sign(h.pnlDollar)}" style="font-weight:600">${fmt.signed(h.pnlDollar)}</span><span class="num muted" style="font-size:10.5px">${fmt.pct(h.pnlPct)}</span></div></td>`;
      case "stop": return `<td class="right num" style="color:var(--down)">$${price(h.stop)}</td>`;
      case "target": return `<td class="right num" style="color:var(--up)">$${price(h.target)}</td>`;
      case "progstatus": {
        if (activeTab === "closed") {
          const pnl = h.pnlFinal ?? h.pnlDollar ?? 0;
          const win = pnl > 0;
          return `<td><span class="status ${win ? "on-track" : "near-stop"}"><span class="dot"></span>${win ? "盈利 · Win" : "亏损 · Loss"}</span></td>`;
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
  function openDrawer(sym) {
    const data = getTableData();
    const h = data.find(x => x.sym === sym);
    if (!h) return;
    selectedSym = sym;
    renderTable();
    $("#drawer").innerHTML = drawerHTML(h);
    wireBX(h);
    if (activeTab === "open") {
      wireDrawerEdits(h);
      wireDrawerCloseButton();
      wireAddToPosition(h, HOLDINGS, totalNotional, () => { renderTable(); renderOverview(); });
    }
    $("#drawer").classList.add("open");
    $("#backdrop").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
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

  function drawerHTML(h) {
    const isClosed = activeTab === "closed";
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
          <button class="close" id="drawer-close" title="关闭 (Esc)">✕</button>
        </div>
        <div class="hero-price">
          <span class="p">$${price(displayPrice)}</span>
          ${isClosed ? `<span class="muted" style="font-size:11px;font-family:var(--f-mono);align-self:center">平仓价</span>` : ""}
          <span class="pct ${pnlSign}">${fmt.pct(pnlPct)}</span>
          <span class="pnl ${pnlSign}">${fmt.signed(pnlAmt)}</span>
          <span class="muted" style="font-family:var(--f-mono);font-size:11px;margin-left:auto">${isClosed ? `平仓 ${fmt.date(h.closedAt)}` : `持仓 ${h.days}d · since ${fmt.date(h.entry)}`}</span>
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
        </div>` : ""}
      </div>

      <div class="drawer-body">
        <!-- 1. 概况 -->
        <div class="drawer-section">
          <h4><span class="idx">01</span>${isClosed ? "平仓记录" : "持仓概况"}</h4>
          ${isClosed ? `
          <div class="kv-grid">
            <div><div class="k">入场成本</div><div class="v mono">$${price(h.cost)}</div></div>
            <div><div class="k">出场价格</div><div class="v mono">$${price(h.closePrice ?? h.last)}</div></div>
            <div><div class="k">盈亏金额</div><div class="v big ${fmt.sign(pnlAmt)}">${fmt.signed(pnlAmt)}</div></div>
            <div><div class="k">盈亏百分比</div><div class="v ${fmt.sign(pnlAmt)}">${fmt.pct(h.pnlPct)}</div></div>
            <div><div class="k">R 倍数</div><div class="v big ${fmt.sign(h.rMult)}">${fmt.rMult(h.rMult)}</div></div>
            <div><div class="k">持有天数</div><div class="v">${h.days}<span class="sub">天</span></div></div>
          </div>` : `
          <div class="kv-grid">
            <div><div class="k">入场成本</div><div class="v mono">$${price(h.cost)}</div></div>
            <div><div class="k">现价<span class="edit-hint">点击编辑</span></div><div class="v"><span class="pos-edit mono" data-pos-field="last" contenteditable="true" spellcheck="false">$${price(h.last)}</span></div></div>
            <div><div class="k">止损<span class="edit-hint">点击编辑</span></div><div class="v"><span class="pos-edit" data-pos-field="stop" contenteditable="true" spellcheck="false">$${price(h.stop)}</span></div></div>
            <div><div class="k">目标<span class="edit-hint">点击编辑</span></div><div class="v"><span class="pos-edit" data-pos-field="target" contenteditable="true" spellcheck="false">$${price(h.target)}</span></div></div>
            <div><div class="k">仓位占比<span class="edit-hint">点击编辑</span></div><div class="v"><span class="pos-edit" data-pos-field="size" contenteditable="true" spellcheck="false">${h.size.toFixed(1)}</span><span class="sub">%</span></div></div>
            <div><div class="k">盈亏比 (R:R)</div><div class="v big up">${((h.target - h.cost) / (h.cost - h.stop)).toFixed(2)}<span class="sub">R</span></div></div>
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
              <div class="sub">${h.cost > h.stop ? `-${((h.cost - h.stop) / h.cost * 100).toFixed(1)}%` : "—"}</div>
            </div>
            <div class="plan-price-item">
              <div class="k">止盈价格</div>
              <div class="v mono up">$${price(h.target)}</div>
              <div class="sub">${h.target > h.cost ? `+${((h.target - h.cost) / h.cost * 100).toFixed(1)}%` : "—"}</div>
            </div>
            <div class="plan-price-item">
              <div class="k">盈亏比</div>
              <div class="v big ${(h.target - h.cost) > (h.cost - h.stop) ? 'up' : 'down'}">${h.cost > h.stop && h.target > h.cost ? ((h.target - h.cost) / (h.cost - h.stop)).toFixed(2) : "—"}<span class="sub"> R</span></div>
            </div>
          </div>

          <div class="plan-subhead">执行记录</div>
          <div class="exec-list">
            ${(h.entries || []).map(e => `
              <div class="exec-item">
                <span class="exec-type ${e.type === 'open' ? 'open' : 'add'}">${e.type === "open" ? "开仓" : "加仓"}</span>
                <span class="exec-date">${fmt.date(e.date)}</span>
                <span class="exec-price mono">$${price(e.price)}</span>
                <span class="exec-qty muted">${e.qty} 股</span>
              </div>`).join("") || `
              <div class="exec-item">
                <span class="exec-type open">开仓</span>
                <span class="exec-date">${fmt.date(h.entry)}</span>
                <span class="exec-price mono">$${price(h.cost)}</span>
                <span class="exec-qty muted">${h.qty} 股</span>
              </div>`}
          </div>

          <div class="plan-subhead">Journal 笔记</div>
          <textarea class="journal-note-area drawer-journal-note" data-sym="${h.sym}"
            placeholder="记录入场思路、心态、执行情况…" rows="4">${h.journalNote || ""}</textarea>
        </div>
      </div>
    `;
  }

  function levelBar(h) {
    const vals = [h.stop, h.cost, h.last, h.target].sort((a, b) => a - b);
    const lo = vals[0] * 0.98, hi = vals[3] * 1.02;
    const px = v => ((v - lo) / (hi - lo)) * 100;
    return `
      <div class="levelbar">
        <div class="track"></div>
        <div class="marker stop" style="left:${px(h.stop)}%">
          <span class="tag below" style="color:var(--down)">止损 $${price(h.stop)}</span>
          <div class="node"></div>
        </div>
        <div class="marker entry" style="left:${px(h.cost)}%">
          <span class="tag below">成本 $${price(h.cost)}</span>
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
    const today = new Date("2026-04-24");
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
      const holdColor = h.holdEarn ? "var(--up)" : "var(--warn)";
      const holdText  = h.holdEarn ? "计划持有" : "计划减仓";
      const srcBadge  = src === "sim"
        ? `<span class="evt-src sim">模拟</span>`
        : `<span class="evt-src real">持仓</span>`;
      return `
        <div class="event">
          <div class="when"><span class="d">${String(date.getDate()).padStart(2,"0")}</span>${MO[date.getMonth()]} · ${WD[date.getDay()]}</div>
          <div class="evt-sym-col"><span class="sym">${h.sym}</span>${srcBadge}</div>
          <div class="evt-days" style="color:${urgColor}">${daysLabel}</div>
          <span class="alert" style="color:${holdColor};background:color-mix(in oklch,${holdColor} 15%,transparent)">${holdText}</span>
        </div>`;
    }).join("");
  }

  function renderBottom() {
    const data = getReviewData();
    const total = data.length;
    const wins  = data.filter(h => (h.pnlFinal ?? h.pnlDollar ?? 0) > 0).length;
    const losses = total - wins;
    const winRatePct = total > 0 ? (wins / total * 100).toFixed(1) : null;
    const avgR   = total > 0 ? (data.reduce((s,h) => s + (h.rMult || 0), 0) / total).toFixed(2) : null;
    const avgDays = total > 0 ? (data.reduce((s,h) => s + (h.days || 1), 0) / total).toFixed(1) : null;

    const periodTitles = { week: "本周复盘", month: "本月复盘", all: "全部复盘" };
    const periodRanges = { week: "Apr 21 – Apr 24", month: "Apr 2026", all: "所有时间" };

    // BX bars breakdown
    const buckets = { "0-5": [], "5-15": [], "15+": [] };
    data.forEach(h => { const b = h.bx?.dailyBars || "15+"; if (buckets[b]) buckets[b].push(h); });
    const maxCount = Math.max(1, ...Object.values(buckets).map(b => b.length));

    function bxReviewRow(bucket, positions) {
      const cnt = positions.length;
      const w   = positions.filter(p => (p.pnlFinal ?? p.pnlDollar ?? 0) > 0).length;
      const avgDollar = cnt > 0 ? Math.round(positions.reduce((s, p) => s + (p.pnlFinal ?? p.pnlDollar ?? 0), 0) / cnt) : 0;
      const barW   = Math.round(cnt / maxCount * 100);
      const dColor = avgDollar >= 0 ? "var(--up)" : "var(--down)";
      const cls = bucket === "0-5" ? "bxbar-early" : bucket === "5-15" ? "bxbar-mid" : "bxbar-late";
      const lbl = bucket === "0-5" ? "开始" : bucket === "5-15" ? "中间" : "延续";
      return `
        <div class="bx-review-row">
          <div class="bx-review-chip">
            <span class="bx-bar-chip ${cls}">${bucket}<span class="bx-bar-sub">${lbl}</span></span>
          </div>
          <div class="bx-review-body">
            <div class="bx-review-track">
              <div class="bx-review-fill" style="width:${barW}%;background:${cnt > 0 ? dColor : "var(--bg-3)"}"></div>
            </div>
            <div class="bx-review-meta">
              ${cnt > 0
                ? `<span class="mono" style="font-size:10px;color:var(--fg-2)">${cnt} 笔 · ${Math.round(w / cnt * 100)}% 胜</span>
                   <span class="mono" style="font-size:10px;color:${dColor}">${fmt.signed(avgDollar)}</span>`
                : `<span style="font-size:10.5px;color:var(--fg-3)">—</span>`}
            </div>
          </div>
        </div>`;
    }

    const reviewPanel = $("#review-panel");
    reviewPanel.innerHTML = `
      <div class="panel-head">
        <div class="panel-title">${periodTitles[reviewPeriod]} <span class="count">${periodRanges[reviewPeriod]}</span></div>
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
          <div class="sub label" style="text-transform:none;letter-spacing:0">${total > 0 ? `${wins} 胜 / ${losses} 负 / ${total} 笔` : "暂无数据"}</div>
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
        <div class="panel-title" style="font-size:11.5px;letter-spacing:0.08em;text-transform:uppercase;color:var(--fg-2);font-weight:500">BX Bars 分布</div>
      </div>
      <div style="padding:10px 16px 14px">
        ${total === 0
          ? `<div style="color:var(--fg-3);font-size:12px;padding:14px 0;text-align:center">暂无已平仓数据<br><span style="font-size:10.5px;margin-top:4px;display:block">平仓后将在此显示 BX Bars 分布统计</span></div>`
          : Object.entries(buckets).map(([b, pos]) => bxReviewRow(b, pos)).join("")}
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
    $$(".panel-head .tab").forEach(tab => {
      tab.addEventListener("click", () => {
        $$(".panel-head .tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        activeTab = tab.dataset.tab;
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

    const todayStr = () => new Date().toISOString().slice(0, 10);
    const resetDateFields = () => {
      const fd = $("#form-date"); if (fd) fd.value = todayStr();
      const fe = $("#form-earnings"); if (fe) fe.value = "";
    };

    openBtn.addEventListener("click", () => { resetDateFields(); openModal("new-position-modal"); });
    closeBtn.addEventListener("click", () => closeModal("new-position-modal"));
    cancelBtn.addEventListener("click", () => closeModal("new-position-modal"));

    // Kind segmented control
    const kindSeg = $("#form-kind-seg");
    if (kindSeg) {
      kindSeg.addEventListener("click", e => {
        const btn = e.target.closest("button[data-kind]");
        if (!btn) return;
        $$("button", kindSeg).forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
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
        setTimeout(() => { fetchEarnBtn.disabled = false; fetchEarnBtn.textContent = "Auto-fetch"; }, 2000);
      });
    }

    form.addEventListener("submit", e => {
      e.preventDefault();
      const sym    = $("#form-ticker").value.toUpperCase().trim();
      const entry  = parseFloat($("#form-entry").value);
      const stop   = parseFloat($("#form-stop").value)   || 0;
      const target = parseFloat($("#form-target").value) || 0;
      const qty    = parseInt($("#form-qty").value);
      const isSim  = newPositionContext === "sim";

      const entryDateStr = ($("#form-date") && $("#form-date").value) || todayStr();
      const entryDate    = new Date(entryDateStr + "T00:00:00");
      const today        = new Date(); today.setHours(0, 0, 0, 0);
      const daysHeld     = Math.max(1, Math.round((today - entryDate) / 86400000) + 1);
      const earningsStr  = ($("#form-earnings") && $("#form-earnings").value) || null;

      if (!sym || !entry || !qty) { alert("请填写 Ticker、入场价、数量"); return; }
      if (!isSim && (!stop || !target)) { alert("真实仓位必须填写止损和止盈"); return; }

      const targetHoldings = isSim ? SIM_HOLDINGS : HOLDINGS;
      const targetClosed   = isSim ? SIM_CLOSED   : CLOSED_POSITIONS;
      if (targetHoldings.find(h => h.sym === sym) || targetClosed.find(h => h.sym === sym)) {
        alert("Position already exists");
        return;
      }
      if (!isSim && (stop >= entry || entry >= target)) {
        alert("Invalid price levels: stop < entry < target");
        return;
      }

      const kindBtn = $("#form-kind-seg .active");
      const kind = kindBtn ? kindBtn.dataset.kind : "equity";

      const base   = isSim ? simNotional : totalNotional;
      const size   = base > 0 ? (qty * entry / base) * 100 : 2.5;
      const newPos = {
        sym, qty, name: sym,
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
        bx: { dailyBars: "0-5", weekly: 0, monthly: 0, sector: { name: "—", color: "oklch(0.35 0.01 250)", score: "50", slope: 0, slopeDir: 0 }, overall: { score: "50", slope: 0, slopeDir: 0 } }
      };

      targetHoldings.push(newPos);
      saveToStorage();
      form.reset();
      closeModal("new-position-modal");
      if (newPositionContext === "sim") { renderSimTable(); renderSimOverview(); }
      else { renderTable(); renderOverview(); }
      newPositionContext = "desk";
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

    $("#equity-form").addEventListener("submit", e => {
      e.preventDefault();
      const newNav = parseFloat($("#equity-nav").value);
      if (newNav > 0) {
        totalNotional = newNav;
        saveToStorage();
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
    const input = $("#close-pos-price-input");
    input.value = pos.last;
    $("#close-pos-sym-label").textContent = sym;
    updateClosePnlPreview(pos, pos.last);
    openModal("close-pos-modal");
    setTimeout(() => { input.select(); }, 80);
  }

  function updateClosePnlPreview(pos, closePrice) {
    const pnlDollar = (closePrice - pos.cost) * pos.qty;
    const pnlPct = pos.cost > 0 ? pnlDollar / (pos.cost * pos.qty) : 0;
    const rMult = pos.risk1R > 0 ? (closePrice - pos.cost) / pos.risk1R : 0;
    const sign = pnlDollar >= 0 ? "up" : "down";
    const preview = $("#close-pos-pnl-preview");
    if (preview) {
      preview.innerHTML = `<span class="${sign}">${fmt.signed(pnlDollar)}</span><span class="muted" style="font-size:11px;margin-left:8px">${fmt.pct(pnlPct)}</span><span class="mono muted" style="font-size:11px;margin-left:8px">${fmt.rMult(rMult)}</span>`;
    }
  }

  function wireClosePositionModal() {
    const input = $("#close-pos-price-input");
    input.addEventListener("input", () => {
      if (!pendingCloseSym) return;
      const holdings = pendingCloseCtx === "sim" ? SIM_HOLDINGS : HOLDINGS;
      const pos = holdings.find(h => h.sym === pendingCloseSym);
      if (!pos) return;
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 0) updateClosePnlPreview(pos, val);
    });

    const closeFn = () => { pendingCloseSym = null; closeModal("close-pos-modal"); };
    $("#close-pos-modal-x").addEventListener("click", closeFn);
    $("#close-pos-cancel-btn").addEventListener("click", closeFn);

    const backdrop = $("#close-pos-modal");
    backdrop.addEventListener("click", e => { if (e.target === backdrop) { pendingCloseSym = null; closeModal("close-pos-modal"); } });

    $("#close-pos-confirm-btn").addEventListener("click", () => {
      if (!pendingCloseSym) return;
      const val = parseFloat(input.value);
      if (isNaN(val) || val <= 0) { input.focus(); return; }
      closePosition(pendingCloseSym, val);
      pendingCloseSym = null;
      closeModal("close-pos-modal");
    });
  }

  // closePosition — archives to closed array (real or sim based on ctx)
  function closePosition(sym, closePrice) {
    const isSim = pendingCloseCtx === "sim";
    const holdings = isSim ? SIM_HOLDINGS : HOLDINGS;
    const closed   = isSim ? SIM_CLOSED   : CLOSED_POSITIONS;
    const pos = holdings.find(h => h.sym === sym);
    if (!pos) return;

    const cp = (closePrice != null && closePrice > 0) ? closePrice : pos.last;
    pos.closedAt = new Date().toISOString().slice(0, 10);
    pos.closePrice = cp;
    pos.pnlDollar = (cp - pos.cost) * pos.qty;
    pos.pnlPct = pos.cost > 0 ? pos.pnlDollar / (pos.cost * pos.qty) : 0;
    pos.rMult = pos.risk1R > 0 ? (cp - pos.cost) / pos.risk1R : 0;
    pos.pnlFinal = pos.pnlDollar;
    pos.exitReason = "manual";

    holdings.splice(holdings.indexOf(pos), 1);
    closed.push(pos);

    saveToStorage();
    if (isSim) {
      if (simSelectedSym === sym) closeSimDrawer();
      renderSimTable(); renderSimOverview();
    } else {
      if (selectedSym === sym) closeDrawer();
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

  // ============ SEARCH / FILTERS / KEYBOARD ============
  function wireControls() {
    // Nav page switching
    $$(".navlink[data-page]").forEach(a => {
      a.addEventListener("click", e => { e.preventDefault(); switchPage(a.dataset.page); });
    });

    $("#search-input").addEventListener("input", e => { query = e.target.value; renderTable(); });
    $$(".filter-chip[data-filter]").forEach(b => b.addEventListener("click", () => {
      $$(".filter-chip[data-filter]").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      filter = b.dataset.filter;
      renderTable();
    }));
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
      if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); $("#search-input").focus(); }
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

    $$(".seg").forEach(seg => {
      seg.addEventListener("click", e => {
        if (e.target.tagName !== "BUTTON") return;
        $$("button", seg).forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        const key = seg.dataset.seg, val = e.target.dataset.val;
        if (key === "density") document.body.dataset.density = val;
        if (key === "font") document.body.dataset.font = val;
        if (key === "theme") document.body.dataset.theme = val;
        persist();
      });
    });

    const slider = $("#hue-slider");
    slider.addEventListener("input", e => {
      const h = e.target.value;
      document.documentElement.style.setProperty("--accent-h", h);
      $("#hue-val").textContent = h + "°";
      persist();
    });

    // theme toggle (dark / light)
    const tt = $("#theme-toggle");
    if (tt) tt.addEventListener("click", () => {
      const cur = document.body.dataset.theme || "dark";
      document.body.dataset.theme = cur === "dark" ? "light" : "dark";
      // reflect into theme segmented control if present
      const seg = document.querySelector('.seg[data-seg="theme"]');
      if (seg) {
        $$("button", seg).forEach(b => b.classList.toggle("active", b.dataset.val === document.body.dataset.theme));
      }
      persist();
    });
  }

  function persist() {
    try {
      const state = {
        density: document.body.dataset.density,
        font: document.body.dataset.font,
        theme: document.body.dataset.theme,
        accentHue: +$("#hue-slider").value,
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
    $("#clock-txt").textContent = `${hh}:${mm}:${ss}`;
    const lu = $("#last-updated");
    if (lu) lu.textContent = "更新于 " + hh + ":" + mm + ":" + ss;

    const now = Date.now();
    if (now - lastPriceFetch >= PRICE_INTERVAL_MS) {
      lastPriceFetch = now;
      fetchPrices();
    }
  }

  async function fetchPrices() {
    const all = [...HOLDINGS, ...SIM_HOLDINGS];
    if (!all.length) return;

    const stocks  = [...new Set(all.filter(h => h.kind !== "crypto").map(h => h.sym))];
    const cryptos = [...new Set(all.filter(h => h.kind === "crypto").map(h => h.sym))];

    const params = new URLSearchParams();
    if (stocks.length)  params.set("stocks",  stocks.join(","));
    if (cryptos.length) params.set("crypto",  cryptos.join(","));

    try {
      const res = await fetch(`/api/quote?${params}`);
      if (!res.ok) return;
      const { results } = await res.json();
      if (!results) return;

      let changed = false;
      all.forEach(h => {
        const q = results[h.sym];
        if (!q) return;
        const notional = SIM_HOLDINGS.includes(h) ? simNotional : totalNotional;
        if (q.prevClose != null && q.prevClose !== h.prevClose) {
          h.prevClose = q.prevClose;
          changed = true;
        }
        if (q.last != null && Math.abs(q.last - (h.last || 0)) > 0.0001) {
          h.last = q.last;
          changed = true;
          recomputeHolding(h, notional);
        }
      });

      if (changed) {
        saveToStorage();
        renderTape();
        renderOverview();
        renderTable();
        if (currentPage === "sim")       { renderSimOverview();   renderSimTable();   }
        if (currentPage === "analytics") renderAnalytics();
      }

      // Update live price indicator
      const statusEl = $("#price-status");
      if (statusEl) {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        statusEl.textContent = `LIVE · ${hh}:${mm}`;
        statusEl.dataset.live = "true";
      }
    } catch (_) {
      // Network error or API key not set — keep static prices silently
    }
  }

  // ============ PAGE SWITCHING ============
  function switchPage(page) {
    currentPage = page;
    const VIEWS = { desk: "desk-view", journal: "journal-view", sim: "sim-view", analytics: "analytics-view", watchlist: "watchlist-view" };
    Object.entries(VIEWS).forEach(([p, id]) => {
      const el = document.getElementById(id);
      if (el) el.style.display = p === page ? "" : "none";
    });
    $$(".navlink[data-page]").forEach(a => a.classList.toggle("active", a.dataset.page === page));
    if (page === "journal")   renderJournal();
    if (page === "sim")       renderSim();
    if (page === "analytics") renderAnalytics();
    if (page === "watchlist") renderWatchlist();
  }

  // ============ JOURNAL ============
  function renderJournal() {
    const combined = [
      ...HOLDINGS.map(h => ({ h, from: "open" })),
      ...CLOSED_POSITIONS.map(h => ({ h, from: "closed" })),
    ].filter(({ h, from }) => {
      if (journalFilter === "open")   return from === "open";
      if (journalFilter === "closed") return from === "closed";
      return true;
    }).sort((a, b) => {
      const dA = a.from === "closed" ? (a.h.closedAt || a.h.entry) : a.h.entry;
      const dB = b.from === "closed" ? (b.h.closedAt || b.h.entry) : b.h.entry;
      return dB.localeCompare(dA);
    });

    const feed = $("#journal-feed");
    if (!feed) return;
    feed.innerHTML = combined.map(({ h, from }) => journalCardHTML(h, from)).join("");

    $$("[data-journal-filter]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.journalFilter === journalFilter);
      btn.addEventListener("click", () => { journalFilter = btn.dataset.journalFilter; renderJournal(); });
    });

    $$(".journal-note-area", feed).forEach(ta => {
      ta.addEventListener("blur", () => {
        const arr = ta.dataset.from === "closed" ? CLOSED_POSITIONS : HOLDINGS;
        const pos = arr.find(x => x.sym === ta.dataset.sym);
        if (pos) { pos.journalNote = ta.value; saveToStorage(); }
      });
    });
  }

  function journalCardHTML(h, from) {
    const isClosed = from === "closed";
    const pnlAmt = isClosed ? (h.pnlFinal ?? h.pnlDollar) : h.pnlDollar;
    const pnlSign = pnlAmt != null ? fmt.sign(pnlAmt) : "up";
    const bx = h.bx || {};

    let badgeColor, badgeTxt;
    if (isClosed) {
      const win = (pnlAmt ?? 0) > 0;
      badgeColor = win ? "var(--up)" : "var(--down)";
      badgeTxt   = win ? "盈利 · Win" : "亏损 · Loss";
    } else {
      const bs = BUCKET_STATUS[progressBucket(h)];
      badgeColor = bs.color; badgeTxt = bs.label;
    }

    const barsCls = bx.dailyBars === "0-5" ? "bxbar-early" : bx.dailyBars === "5-15" ? "bxbar-mid" : "bxbar-late";
    const barsLbl = bx.dailyBars === "0-5" ? "开始"        : bx.dailyBars === "5-15" ? "中间"      : "延续";
    const dateStr = isClosed
      ? `${fmt.date(h.entry)} → ${fmt.date(h.closedAt)}`
      : `${fmt.date(h.entry)} · ${h.days}d`;

    return `
      <div class="journal-card">
        <div class="journal-card-head">
          <div class="jc-ticker">
            <div class="avatar ${h.kind === "crypto" ? "crypto" : ""}">${logoImg(h)}${h.sym.slice(0, h.kind === "crypto" ? 3 : 4)}</div>
            <div>
              <div class="mono" style="font-size:14px;font-weight:600">${h.sym}</div>
              <div class="muted" style="font-size:11px">${h.name}</div>
            </div>
          </div>
          <div class="jc-meta">
            <span class="statlight" style="color:${badgeColor};background:color-mix(in oklch,${badgeColor} 14%,transparent)">
              <span class="dot" style="background:${badgeColor}"></span>${badgeTxt}
            </span>
            <span class="mono muted" style="font-size:10.5px">${dateStr}</span>
            ${pnlAmt != null ? `<span class="mono ${pnlSign}" style="font-size:12.5px;font-weight:600">${fmt.signed(pnlAmt)}</span>` : ""}
          </div>
        </div>

        <div class="jc-bx">
          <span class="bx-bar-chip ${barsCls}">${bx.dailyBars ?? "—"}<span class="bx-bar-sub">${barsLbl}</span></span>
          ${bx.weekly  != null ? `<span class="bx-chip-score" style="font-size:11px;padding:2px 8px">W ${bx.weekly  >= 0 ? "+" : ""}${bx.weekly}</span>`  : ""}
          ${bx.monthly != null ? `<span class="bx-chip-score" style="font-size:11px;padding:2px 8px">M ${bx.monthly >= 0 ? "+" : ""}${bx.monthly}</span>` : ""}
          ${bx.sector?.name ? `<span class="muted" style="font-size:10.5px;display:flex;align-items:center;gap:4px">
            <span style="width:8px;height:8px;border-radius:50%;background:${bx.sector.color};flex-shrink:0;display:inline-block"></span>${bx.sector.name}
          </span>` : ""}
        </div>

        ${h.thesis ? `<div class="jc-thesis">${h.thesis}</div>` : ""}

        <div class="jc-note-wrap">
          <div class="k" style="margin-bottom:5px;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;color:var(--fg-3)">笔记</div>
          <textarea class="journal-note-area" data-sym="${h.sym}" data-from="${from}"
                    placeholder="记录入场思路、心态、执行情况…" rows="3">${h.journalNote || ""}</textarea>
        </div>

        ${isClosed ? `
        <div class="jc-result">
          <span class="mono muted" style="font-size:10.5px">持有 ${h.days ?? "—"}d</span>
          <span class="mono ${fmt.sign(h.rMult ?? 0)}" style="font-size:10.5px">${fmt.rMult(h.rMult ?? 0)}</span>
          <span class="mono ${fmt.sign(h.pnlPct ?? 0)}" style="font-size:10.5px">${fmt.pct(h.pnlPct ?? 0)}</span>
        </div>` : ""}
      </div>`;
  }

  // ============ ANALYTICS ============
  // ============ SIMULATION PAGE ============

  function renderSim() {
    renderSimOverview();
    renderSimTable();
  }

  function renderSimOverview() {
    const el = $("#sim-overview");
    if (!el) return;
    const pnl = SIM_HOLDINGS.reduce((s, h) => s + (h.pnlDollar || 0), 0);
    const nav = simNotional + pnl;
    const open = SIM_HOLDINGS.length;
    const closedTotal = SIM_CLOSED.length;
    const wins = SIM_CLOSED.filter(h => (h.pnlFinal || 0) > 0).length;
    const realizedPnl = SIM_CLOSED.reduce((s, h) => s + (h.pnlFinal || 0), 0);
    const winRate = closedTotal > 0 ? (wins / closedTotal * 100).toFixed(0) + "%" : "—";
    const navSign = fmt.sign(pnl);
    el.innerHTML = `
      <div class="sim-card">
        <div class="sim-card-label">模拟 NAV</div>
        <div class="sim-card-value ${pnl >= 0 ? 'up' : 'down'}">${fmt.usd(Math.round(nav))}</div>
        <div class="sim-card-sub" id="sim-notional-edit" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px">
          本金 ${fmt.usd(simNotional)}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </div>
      </div>
      <div class="sim-card">
        <div class="sim-card-label">模拟浮盈亏</div>
        <div class="sim-card-value ${navSign}">${fmt.signed(Math.round(pnl))}</div>
        <div class="sim-card-sub">${open} 笔持仓中</div>
      </div>
      <div class="sim-card">
        <div class="sim-card-label">已实现盈亏</div>
        <div class="sim-card-value ${fmt.sign(realizedPnl)}">${closedTotal ? fmt.signed(Math.round(realizedPnl)) : "—"}</div>
        <div class="sim-card-sub">${closedTotal} 笔已平仓</div>
      </div>
      <div class="sim-card">
        <div class="sim-card-label">模拟胜率</div>
        <div class="sim-card-value ${wins > closedTotal / 2 ? 'up' : closedTotal ? 'down' : 'neu'}">${winRate}</div>
        <div class="sim-card-sub">${closedTotal ? `${wins}胜 / ${closedTotal - wins}负` : "暂无数据"}</div>
      </div>`;

    // Sim notional edit
    const editBtn = $("#sim-notional-edit");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        const v = parseFloat(prompt("设置模拟本金 ($)", simNotional));
        if (v > 0) { simNotional = v; saveToStorage(); renderSimOverview(); }
      });
    }

    // Update subtitle
    const sub = $("#sim-subtitle");
    if (sub) sub.textContent = `${open} 笔持仓 · ${closedTotal} 笔已平仓`;
  }

  function renderSimTable() {
    const thead = $("#sim-thead-row");
    const tbody = $("#sim-tbody");
    if (!thead || !tbody) return;

    const data = simActiveTab === "open" ? SIM_HOLDINGS : SIM_CLOSED;

    // Header
    thead.innerHTML = COLS.filter(c => c.on && !(simActiveTab === "closed" && c.closedHide)).map(c => {
      const sorted = simSortKey === c.id ? "sorted" : "";
      const label = (simActiveTab === "closed" && c.id === "last") ? "平仓价" : c.label;
      return `<th class="${c.r ? "right" : ""} ${sorted}" data-simcol="${c.id}">${label}</th>`;
    }).join("");
    $$("[data-simcol]", thead).forEach(th => th.addEventListener("click", () => {
      const col = th.dataset.simcol;
      if (simSortKey === col) simSortDir *= -1; else { simSortKey = col; simSortDir = -1; }
      renderSimTable();
    }));

    // Filter + sort
    let rows = data.filter(h => {
      if (simFilter === "equity" && !["equity", "etf"].includes(h.kind)) return false;
      if (simFilter === "crypto" && h.kind !== "crypto") return false;
      if (simFilter === "risk") { if (!["Early", "Near Stop"].includes(progressBucket(h))) return false; }
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

    // Body
    const cols = COLS.filter(c => c.on && !(simActiveTab === "closed" && c.closedHide));
    tbody.innerHTML = rows.map(h => {
      const isSel = simSelectedSym === h.sym ? "selected" : "";
      const cells = cols.map(c => renderCell(h, c.id)).join("");
      const actions = simActiveTab === "open"
        ? `<td style="width:60px;padding:6px 4px"><div class="row-actions">
             <button class="close-pos-btn" data-sym="${h.sym}" title="平仓">⊟</button>
             <button class="delete-btn" data-sym="${h.sym}" title="删除">✕</button>
           </div></td>`
        : `<td style="width:40px;padding:6px 4px"><div class="row-actions">
             <button class="delete-btn" data-sym="${h.sym}" data-from="closed" title="删除">✕</button>
           </div></td>`;
      return `<tr class="${isSel}" data-sym="${h.sym}">${cells}${actions}</tr>`;
    }).join("");

    $$("tr", tbody).forEach(tr => {
      tr.addEventListener("click", e => {
        if (e.target.closest(".close-pos-btn, .delete-btn")) return;
        openSimDrawer(tr.dataset.sym);
      });
    });
    $$(".close-pos-btn", tbody).forEach(btn => {
      btn.addEventListener("click", e => { e.stopPropagation(); openCloseModal(btn.dataset.sym); });
    });
    $$(".delete-btn", tbody).forEach(btn => {
      btn.addEventListener("click", e => { e.stopPropagation(); openDeleteModal(btn.dataset.sym, btn.dataset.from || "open"); });
    });

    // Counts
    const allData = simActiveTab === "open" ? SIM_HOLDINGS : SIM_CLOSED;
    const setCount = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setCount("sim-c-open",   SIM_HOLDINGS.length);
    setCount("sim-c-closed", SIM_CLOSED.length);
    setCount("sim-c-all",    allData.length);
    setCount("sim-c-eq",     allData.filter(h => ["equity","etf"].includes(h.kind)).length);
    setCount("sim-c-cr",     allData.filter(h => h.kind === "crypto").length);
    setCount("sim-c-rk",     allData.filter(h => ["Early","Near Stop"].includes(progressBucket(h))).length);
  }

  function openSimDrawer(sym) {
    const data = simActiveTab === "open" ? SIM_HOLDINGS : SIM_CLOSED;
    const h = data.find(x => x.sym === sym);
    if (!h) return;
    simSelectedSym = sym;
    renderSimTable();
    // Temporarily set activeTab to simActiveTab so drawerHTML reads the right tab
    const prevTab = activeTab;
    activeTab = simActiveTab;
    $("#drawer").innerHTML = drawerHTML(h);
    activeTab = prevTab;
    wireBX(h);
    if (simActiveTab === "open") {
      wireSimDrawerEdits(h);
      wireSimDrawerCloseButton();
      wireAddToPosition(h, SIM_HOLDINGS, simNotional, () => { renderSimTable(); renderSimOverview(); });
    }
    $("#drawer").classList.add("open");
    $("#backdrop").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
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
    const simNewBtn = $("#sim-new-pos-btn");
    if (simNewBtn) simNewBtn.addEventListener("click", () => {
      newPositionContext = "sim";
      const fd = $("#form-date"); if (fd) fd.value = new Date().toISOString().slice(0, 10);
      const fe = $("#form-earnings"); if (fe) fe.value = "";
      openModal("new-position-modal");
    });

    const tabOpen   = $("#sim-tab-open");
    const tabClosed = $("#sim-tab-closed");
    if (tabOpen) tabOpen.addEventListener("click", () => {
      simActiveTab = "open";
      tabOpen.classList.add("active"); if (tabClosed) tabClosed.classList.remove("active");
      renderSimTable();
    });
    if (tabClosed) tabClosed.addEventListener("click", () => {
      simActiveTab = "closed";
      tabClosed.classList.add("active"); if (tabOpen) tabOpen.classList.remove("active");
      renderSimTable();
    });

    const simSearch = $("#sim-search-input");
    if (simSearch) simSearch.addEventListener("input", e => { simQuery = e.target.value; renderSimTable(); });

    document.addEventListener("click", e => {
      const chip = e.target.closest("[data-simfilter]");
      if (!chip) return;
      simFilter = chip.dataset.simfilter;
      $$("[data-simfilter]").forEach(c => c.classList.toggle("active", c.dataset.simfilter === simFilter));
      renderSimTable();
    });

  }

  function generatePortfolioCurve(period) {
    const totalPnlDollar = HOLDINGS.reduce((s, h) => s + (h.pnlDollar || 0), 0);
    const currentValue = totalNotional + totalPnlDollar;
    // stable pseudo-random seeded on current state
    let seed = Math.round(totalNotional + Math.abs(totalPnlDollar * 7));
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

    if (period === "day") {
      const prevValue = totalNotional + HOLDINGS.reduce((s, h) => s + ((h.prevClose || h.cost) - h.cost) * (h.qty || 0), 0);
      const labels = ["9:30", "10:15", "11:00", "11:45", "12:30", "14:00", "15:00", "16:00"];
      const n = 8;
      const range = Math.abs(currentValue - prevValue) || currentValue * 0.003;
      const values = Array.from({length: n}, (_, i) => {
        const t = i / (n - 1);
        const noise = i > 0 && i < n - 1 ? (rand() - 0.5) * range * 0.5 : 0;
        return prevValue + (currentValue - prevValue) * t + noise;
      });
      values[0] = prevValue; values[n - 1] = currentValue;
      return { values, labels };
    }

    if (period === "week") {
      const labels = ["Mon", "Tue", "Wed", "Thu", "Fri"];
      const weekStart = currentValue - totalPnlDollar * 0.75;
      const range = Math.abs(totalPnlDollar) || currentValue * 0.01;
      const values = Array.from({length: 5}, (_, i) => {
        const t = i / 4;
        const noise = i > 0 && i < 4 ? (rand() - 0.5) * range * 0.3 : 0;
        return weekStart + totalPnlDollar * 0.75 * t + noise;
      });
      values[4] = currentValue;
      return { values, labels };
    }

    // month: 22 trading days
    const n = 22;
    const today = new Date();
    const labels = Array.from({length: n}, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() - (n - 1 - i));
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    const monthStart = currentValue - totalPnlDollar * 1.3;
    const range = Math.abs(totalPnlDollar) || currentValue * 0.015;
    const values = Array.from({length: n}, (_, i) => {
      const t = i / (n - 1);
      const noise = i > 0 && i < n - 1 ? (rand() - 0.5) * range * 0.35 : 0;
      return monthStart + totalPnlDollar * 1.3 * t + noise;
    });
    values[n - 1] = currentValue;
    return { values, labels };
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

    // Horizontal grid lines with $ labels
    const gridSVG = [0.25, 0.5, 0.75].map(t => {
      const v = minV + rng * t;
      const gy = sy(v).toFixed(1);
      const lbl = "$" + (v / 1000).toFixed(1) + "k";
      return `<line x1="8" y1="${gy}" x2="${W - 8}" y2="${gy}" stroke="var(--line)" stroke-width="0.5" stroke-dasharray="4,5" opacity="0.8"/>` +
             `<text x="${W - 10}" y="${gy}" text-anchor="end" dominant-baseline="middle" fill="var(--fg-3)" font-size="8" font-family="sans-serif">${lbl}</text>`;
    }).join("");

    // X-axis labels: first, mid, last
    const lIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1];
    const xLabels = labels ? lIdx.map((i, pos) =>
      `<text x="${sx(i).toFixed(1)}" y="${h + 12}" text-anchor="${pos === 0 ? 'start' : pos === 2 ? 'end' : 'middle'}" fill="var(--fg-3)" font-size="9.5" font-family="sans-serif">${labels[i] || ""}</text>`
    ).join("") : "";

    return `<div id="${chartId}-wrap" style="position:relative">
<svg id="${chartId}" viewBox="0 0 ${W} ${h + 16}" preserveAspectRatio="none" style="display:block;width:100%;height:${h + 16}px;cursor:crosshair">
  <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${col}" stop-opacity="0.22"/>
    <stop offset="1" stop-color="${col}" stop-opacity="0.02"/>
  </linearGradient></defs>
  ${gridSVG}
  <path d="${areaD}" fill="url(#${gid})"/>
  <path d="${pathD}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${sx(0).toFixed(1)}" cy="${sy(points[0]).toFixed(1)}" r="3" fill="${col}" stroke="var(--bg-1)" stroke-width="1.5" opacity="0.6"/>
  <circle cx="${sx(points.length - 1).toFixed(1)}" cy="${sy(points[points.length - 1]).toFixed(1)}" r="4.5" fill="${col}" stroke="var(--bg-1)" stroke-width="2"/>
  ${xLabels}
  <line id="${chartId}-cross" x1="0" y1="2" x2="0" y2="${h - 2}" stroke="var(--fg-2)" stroke-width="1" stroke-dasharray="3,2" opacity="0"/>
  <circle id="${chartId}-hdot" cx="0" cy="0" r="4.5" fill="${col}" stroke="var(--bg-1)" stroke-width="2" opacity="0"/>
</svg>
<div id="${chartId}-tip" class="ec-tooltip" style="display:none"></div>
</div>`;
  }

  function wireCurveTooltip(chartId, points, labels) {
    const svg  = document.getElementById(chartId);
    const tip  = document.getElementById(chartId + "-tip");
    const cross = document.getElementById(chartId + "-cross");
    const hdot = document.getElementById(chartId + "-hdot");
    if (!svg || !tip || !cross || !hdot) return;

    const W = 560;
    const minV = Math.min(...points), maxV = Math.max(...points);
    const rng = maxV - minV || 1;
    const lo = minV - rng * 0.05, hi = maxV + rng * 0.05;
    const range = hi - lo;
    const h = svg.viewBox.baseVal.height - 16;
    const sx = i => ((i / (points.length - 1)) * (W - 16) + 8);
    const sy = v => (h - 6) - ((v - lo) / range) * (h - 14);

    svg.addEventListener("mousemove", e => {
      const rect = svg.getBoundingClientRect();
      const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const pct  = relX / rect.width;
      const idx  = Math.min(points.length - 1, Math.max(0, Math.round(pct * (points.length - 1))));
      const val  = points[idx];
      const lbl  = labels ? (labels[idx] || "") : "";
      const chg  = val - points[0];
      const chgPct = ((val / points[0] - 1) * 100);

      // Crosshair + dot in viewBox coords
      const vx = sx(idx);
      cross.setAttribute("x1", vx); cross.setAttribute("x2", vx);
      cross.setAttribute("opacity", "0.55");
      hdot.setAttribute("cx", vx); hdot.setAttribute("cy", sy(val));
      hdot.setAttribute("opacity", "1");

      // Tooltip
      tip.innerHTML = `<div class="ec-tip-label">${lbl}</div>` +
        `<div class="ec-tip-val">${fmt.usd(Math.round(val))}</div>` +
        `<div class="ec-tip-chg ${chg >= 0 ? 'up' : 'down'}">${chg >= 0 ? '+' : '−'}$${Math.abs(Math.round(chg)).toLocaleString()} (${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%)</div>`;

      // Clamp left so tooltip stays inside container
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

    const closed = CLOSED_POSITIONS;
    const open   = HOLDINGS;
    const total  = closed.length;
    const wins   = closed.filter(h => (h.pnlFinal ?? 0) > 0);
    const losses = closed.filter(h => (h.pnlFinal ?? 0) <= 0);
    const totalPnl  = closed.reduce((s, h) => s + (h.pnlFinal ?? 0), 0);
    const grossWin  = wins.reduce((s, h) => s + (h.pnlFinal ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, h) => s + (h.pnlFinal ?? 0), 0));
    const winRate   = total > 0 ? (wins.length / total * 100).toFixed(1) : null;
    const pfStr     = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : (wins.length > 0 ? "∞" : null);
    const avgWin    = wins.length > 0 ? Math.round(grossWin / wins.length) : null;
    const avgLoss   = losses.length > 0 ? Math.round(grossLoss / losses.length) : null;
    const avgHold   = total > 0 ? (closed.reduce((s, h) => s + (h.days || 0), 0) / total).toFixed(1) : null;

    const sortedC = [...closed].sort((a, b) => a.closedAt.localeCompare(b.closedAt));
    const totalPnlDollar = open.reduce((s, h) => s + (h.pnlDollar || 0), 0);
    const currentPortfolioValue = totalNotional + totalPnlDollar;
    const curveData = generatePortfolioCurve(equityPeriod);

    // BX buckets
    const bxBuckets = { "0-5": [], "5-15": [], "15+": [] };
    closed.forEach(h => { const b = h.bx?.dailyBars || "15+"; if (bxBuckets[b]) bxBuckets[b].push(h); });

    // Open portfolio sorted by size
    const openSorted = [...open].sort((a, b) => b.size - a.size);

    aContent.innerHTML = `
      <div class="analytics-topbar">
        <div class="journal-title">Analytics</div>
        <div class="muted" style="font-size:12px;font-family:var(--f-mono)">${total} 笔已平仓 · ${open.length} 笔持仓中</div>
      </div>

      <div class="analytics-metrics">
        ${ametric("已实现盈亏",  total ? fmt.signed(Math.round(totalPnl)) : "—", fmt.sign(totalPnl), total ? `${total} 笔交易` : "暂无数据")}
        ${ametric("胜率",        winRate !== null ? winRate + "%" : "—", parseFloat(winRate) >= 50 ? "up" : "down", winRate !== null ? `${wins.length}胜/${losses.length}负` : "")}
        ${ametric("盈亏因子",    pfStr || "—", parseFloat(pfStr) >= 1.5 ? "up" : "down", "总盈 ÷ 总亏")}
        ${ametric("平均盈利",    avgWin !== null ? fmt.signed(avgWin) : "—", "up", avgWin !== null ? `${wins.length} 笔赢` : "")}
        ${ametric("平均亏损",    avgLoss !== null ? "−$" + avgLoss.toLocaleString() : "—", "down", avgLoss !== null ? `${losses.length} 笔亏` : "")}
        ${ametric("平均持仓",    avgHold !== null ? avgHold + " 天" : "—", "neu", avgHold !== null ? `最长 ${Math.max(...closed.map(h => h.days || 0))}d` : "")}
      </div>

      <div class="analytics-chart-row">
        <div class="analytics-card" style="flex:2">
          <div class="ec-header">
            <div>
              <div class="analytics-card-title">总资产曲线 · Portfolio Value</div>
              <div class="analytics-card-sub">
                <span class="mono" style="font-size:15px;font-weight:700;color:var(--fg-0)">${fmt.usd(Math.round(currentPortfolioValue))}</span>
                <span class="mono ${fmt.sign(totalPnlDollar)}" style="font-size:11px;margin-left:6px">${fmt.signed(Math.round(totalPnlDollar))}</span>
              </div>
            </div>
            <div class="ec-period-seg">
              <button class="ec-period-btn${equityPeriod === 'day' ? ' active' : ''}" data-period="day">日</button>
              <button class="ec-period-btn${equityPeriod === 'week' ? ' active' : ''}" data-period="week">周</button>
              <button class="ec-period-btn${equityPeriod === 'month' ? ' active' : ''}" data-period="month">月</button>
            </div>
          </div>
          <div style="margin-top:14px">${portfolioCurveSVG(curveData.values, curveData.labels, 136, "ec-main")}</div>
        </div>
        <div class="analytics-card" style="flex:1">
          <div class="analytics-card-title">BX Bars 效能</div>
          <div class="analytics-card-sub">胜率 · 平均盈亏</div>
          <div style="margin-top:16px;display:flex;flex-direction:column;gap:14px">
            ${Object.entries(bxBuckets).map(([b, pos]) => {
              const cnt = pos.length;
              const wn  = pos.filter(p => (p.pnlFinal ?? 0) > 0).length;
              const avg = cnt > 0 ? Math.round(pos.reduce((s, p) => s + (p.pnlFinal ?? 0), 0) / cnt) : 0;
              const cls = b === "0-5" ? "bxbar-early" : b === "5-15" ? "bxbar-mid" : "bxbar-late";
              const lbl = b === "0-5" ? "开始" : b === "5-15" ? "中间" : "延续";
              const dc  = avg >= 0 ? "var(--up)" : "var(--down)";
              return `<div style="display:flex;align-items:center;gap:10px">
                <span class="bx-bar-chip ${cls}" style="flex-shrink:0">${b}<span class="bx-bar-sub">${lbl}</span></span>
                <div style="flex:1">
                  <div class="muted" style="font-size:10px;margin-bottom:2px">${cnt > 0 ? `${cnt}笔 · ${Math.round(wn/cnt*100)}% 胜` : "暂无数据"}</div>
                  <div class="mono" style="font-size:13px;font-weight:700;color:${dc}">${cnt > 0 ? fmt.signed(avg) : "—"}</div>
                </div>
              </div>`;
            }).join("")}
          </div>
        </div>
      </div>

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
    `;

    $$(".ec-period-btn", aContent).forEach(btn => {
      btn.addEventListener("click", () => {
        equityPeriod = btn.dataset.period;
        renderAnalytics();
      });
    });

    wireCurveTooltip("ec-main", curveData.values, curveData.labels);
  }

  function ametric(label, value, colorCls, sub) {
    return `<div class="analytics-metric">
      <div class="analytics-metric-label">${label}</div>
      <div class="analytics-metric-value ${colorCls || "neu"}">${value}</div>
      ${sub ? `<div class="analytics-metric-sub">${sub}</div>` : ""}
    </div>`;
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

  // ============ WATCHLIST ============
  function renderWatchlist() {
    const content = $("#watchlist-content");
    if (!content) return;

    content.innerHTML = WATCHLIST.length === 0
      ? `<div style="text-align:center;padding:48px;color:var(--fg-3);font-size:13px">暂无观察标的</div>`
      : WATCHLIST.map((item, idx) => watchlistCardHTML(item, idx)).join("");

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
  }

  function watchlistCardHTML(item, idx) {
    const bxScoreNum = parseFloat(item.bxScore) || 0;
    const scoreColor = bxScoreNum >= 70 ? "var(--up)" : bxScoreNum >= 50 ? "var(--warn)" : "var(--down)";
    const bxCls = slopeNumClass(item.bxSlope ?? 0);
    return `<div class="wl-card">
      <div class="wl-card-main">
        <div class="jc-ticker" style="min-width:140px">
          <div class="avatar">${logoImg(item)}${item.sym.slice(0, 4)}</div>
          <div>
            <div class="mono" style="font-size:13px;font-weight:600">${item.sym}</div>
            <div class="muted" style="font-size:10.5px">${item.name}</div>
          </div>
        </div>
        <div class="wl-meta">
          <span style="display:flex;align-items:center;gap:4px;font-size:10.5px;color:var(--fg-2)">
            <span style="width:8px;height:8px;border-radius:50%;background:${item.color};display:inline-block;flex-shrink:0"></span>${item.sector}
          </span>
          ${item.setup ? `<span class="setup-chip" style="font-size:10px;padding:2px 6px">${item.setup}</span>` : ""}
        </div>
        <div class="wl-bx-score" style="color:${scoreColor}">
          <span class="mono" style="font-size:20px;font-weight:700">${item.bxScore}</span>
          <span class="muted" style="font-size:9.5px">/ 100</span>
        </div>
        <div class="wl-slope">
          <span class="bx-chip-slope ${bxCls}" style="min-width:36px;text-align:center;font-size:12px">${slopeNumDisplay(item.bxSlope ?? 0)}</span>
          <span class="muted" style="font-size:9.5px">Slope</span>
        </div>
        ${item.price ? `<div class="wl-price">
          <span class="mono" style="font-size:13px;font-weight:600">$${price(item.price)}</span>
          <span class="muted" style="font-size:9.5px">参考价</span>
        </div>` : ""}
        <div class="wl-actions">
          <button class="btn primary wl-add-pos" data-idx="${idx}" style="font-size:11.5px;padding:6px 12px">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>入仓
          </button>
          <button class="btn wl-delete" data-idx="${idx}" style="color:var(--down);border-color:var(--down-dim);padding:6px 10px">✕</button>
        </div>
      </div>
      <textarea class="wl-note journal-note-area" data-idx="${idx}" rows="2"
                placeholder="观察笔记、入场条件、关键价位…">${item.note || ""}</textarea>
    </div>`;
  }

  function wireWatchlistForm() {
    const form       = $("#wl-add-form");
    const toggleBtn  = $("#wl-toggle-form");
    const formBody   = $("#wl-form-body");
    if (!form) return;

    if (toggleBtn && formBody) {
      toggleBtn.addEventListener("click", () => {
        const hidden = formBody.style.display === "none";
        formBody.style.display = hidden ? "" : "none";
        toggleBtn.textContent = hidden ? "取消" : "+ 添加标的";
      });
    }

    form.addEventListener("submit", e => {
      e.preventDefault();
      const sym = ($("#wl-sym").value || "").toUpperCase().trim();
      if (!sym) return;
      if (WATCHLIST.find(w => w.sym === sym)) { alert("已在观察列表中"); return; }
      WATCHLIST.push({
        sym, name: $("#wl-name").value.trim() || sym,
        sector: $("#wl-sector").value.trim() || "—",
        color: "oklch(0.35 0.01 250)",
        price: parseFloat($("#wl-price").value) || null,
        setup: $("#wl-setup").value.trim() || "",
        bxScore: parseInt($("#wl-bx-score").value) || 50,
        bxSlope: parseInt($("#wl-bx-slope").value) || 0,
        note: "", addedAt: new Date().toISOString().slice(0, 10),
      });
      saveToStorage();
      form.reset();
      if (formBody) formBody.style.display = "none";
      if (toggleBtn) toggleBtn.textContent = "+ 添加标的";
      renderWatchlist();
    });
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
      // daily change vs prevClose; fall back to position P&L if prevClose unavailable
      const base = h.prevClose > 0 ? h.prevClose : h.cost;
      const c = +((h.last - base) / base * 100).toFixed(2);
      return { s: h.sym, p, c };
    });
    const html = items.map(i => {
      const cls = i.c >= 0 ? "up" : "down";
      const sign = i.c >= 0 ? "+" : "−";
      return `<span class="ti"><span class="s">${i.s}</span><span class="p">${i.p}</span><span class="c ${cls}">${sign}${Math.abs(i.c).toFixed(2)}%</span></span>`;
    }).join("");
    track.innerHTML = html + html;
  }
  loadFromStorage();

  // Retroactively stamp existing data saved before savedAt tracking was added.
  // Without this, localTime = null and any cloud data (even empty) would win.
  if (!localStorage.getItem("trendo_v4_savedAt")) {
    const localTotal = HOLDINGS.length + SIM_HOLDINGS.length + CLOSED_POSITIONS.length;
    if (localTotal > 0) localStorage.setItem("trendo_v4_savedAt", new Date().toISOString());
  }
  renderTape();
  wireHost();
  renderOverview();
  renderTable();
  renderBottom();
  wireControls();
  wireTweaks();
  wireTableTabs();
  wireNewPositionModal();
  $("#add-to-close")?.addEventListener("click",  () => closeModal("add-to-modal"));
  $("#add-to-cancel")?.addEventListener("click", () => closeModal("add-to-modal"));
  wireEquityModal();
  wireClosePositionModal();
  wireDeleteModal();
  wireWatchlistForm();
  wireSimControls();
  wireSyncPanel();
  renderSyncStatus();
  // Sync strategy: local localStorage is ALWAYS the source of truth.
  // On startup we only PUSH local data to cloud — never pull.
  // Cross-device sync only happens when the user explicitly enters a key in the sync panel.
  if (syncKey) syncPush();
  tick(); setInterval(tick, 1000);

})();
