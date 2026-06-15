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

    const hasData = rows.some(r => r.today !== 0 || r.todayPct !== 0);
    if (label) label.style.display = HOLDINGS.length ? "" : "none";
    if (!HOLDINGS.length) { el.innerHTML = ""; return; }

    const total = rows.reduce((s, r) => s + r.today, 0);
    const wins  = rows.filter(r => r.today > 0).length;
    const loses = rows.filter(r => r.today < 0).length;
    const tSign = total > 0 ? "up" : total < 0 ? "down" : "";
    const tStr  = !hasData ? "行情加载中…" : total === 0 ? "±$0" : (total > 0 ? "+" : "−") + "$" + Math.abs(total).toLocaleString("en-US");
    const metaEl = $("#daily-sources-meta");
    if (metaEl) metaEl.innerHTML = `<span class="ssl-total ${tSign}">${tStr}</span>${hasData ? ` · ${wins}↑ ${loses}↓` : ""}`;

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

  function bxSectionHTML(h) {
    const bx = h.bx;
    const scoreButtons = field => BX_SCORE_OPTS.map(o => `
      <button class="bx-score-btn ${o.cls} ${bx[field] === o.val ? "active" : ""}"
              data-bx-field="${field}" data-bx-val="${o.val}">
        <span class="bx-val">${o.label}</span>
        <span class="bx-sub">${o.sub}</span>
      </button>`).join("");
    const getSlopeDir = obj => Math.sign(parseFloat(obj.slope) || 0);
    const slopeCell = (field, val) => {
      const n = parseFloat(val) || 0;
      const tint = n > 0 ? "tint-up" : n < 0 ? "tint-down" : "tint-flat";
      return `<input type="number" class="bx-slope-input ${tint}" data-slope-field="${field}" value="${n}" step="0.1">`;
    };
    const colorDivider = () => `
      <div class="bx-color-divider">
        <span class="bx-meta-lbl" style="white-space:nowrap;margin-right:4px">板块色</span>
        ${SWATCH_COLORS.map(c => `<button class="bx-color-opt${bx.sector.color===c?' active':''}"
          style="background:${c}" data-color-val="${c}" title="${c}"></button>`).join('')}
      </div>`;
    return `
      <div class="drawer-section">
        <h4><span class="idx">02</span>BX Trend &amp; 市场背景</h4>

        <div class="bx-row">
          <div class="bx-row-label">Daily BX Trend <span class="bx-hint">入场后第 ${calcTradingDays(h.entry)} 交易日</span></div>
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
            ${slopeCell("sectorSlope", bx.sector.slope)}
          </div>
          <div class="bx-quad-row" id="bq-sector">${bqBadgeHTML(bx.sector.score, getSlopeDir(bx.sector))}</div>
          ${colorDivider()}
          <div class="bx-align-row">
            <div class="bx-align-label">
              <span class="bx-meta-lbl" style="font-size:11px;text-transform:none;letter-spacing:0;color:var(--fg-1)">VS VOO</span>
            </div>
            <span class="bx-chip-score" contenteditable="true"
                  data-bx-field="overallScore">${bx.overall.score}</span>
            ${slopeCell("overallSlope", bx.overall.slope)}
          </div>
          <div class="bx-quad-row" id="bq-overall">${bqBadgeHTML(bx.overall.score, getSlopeDir(bx.overall))}</div>
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

    const refreshBadge = which => {
      const el = $(`#bq-${which}`, dr);
      if (!el) return;
      const score = which === "sector" ? h.bx.sector.score : h.bx.overall.score;
      const slope = which === "sector" ? (h.bx.sector.slope || 0) : (h.bx.overall.slope || 0);
      el.innerHTML = bqBadgeHTML(score, Math.sign(slope));
    };

    // Slope number input — tints by sign, refreshes badge
    $$(".bx-slope-input", dr).forEach(input => {
      const commit = () => {
        const n = parseFloat(input.value) || 0;
        const which = input.dataset.slopeField === "sectorSlope" ? "sector" : "overall";
        if (which === "sector") h.bx.sector.slope = n; else h.bx.overall.slope = n;
        input.classList.remove("tint-up", "tint-flat", "tint-down");
        input.classList.add(n > 0 ? "tint-up" : n < 0 ? "tint-down" : "tint-flat");
        refreshBadge(which);
        saveToStorage();
      };
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
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
        if (f === "sectorScore")  { h.bx.sector.score  = v; refreshBadge("sector");  }
        if (f === "overallScore") { h.bx.overall.score = v; refreshBadge("overall"); }
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
  let equityPeriod = "week";
  let calYear  = new Date().getFullYear();
  let calMonth = new Date().getMonth();
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
    const histForSync = [...analysisHistory]
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
      .map((e, i) => {
        if (i < 60 || !e._fullData) return e;
        const c = { ...e }; delete c._fullData; return c;
      });
    const payload = {
      holdings: noMarket(HOLDINGS), closed: CLOSED_POSITIONS, notional: totalNotional,
      watchlist: WATCHLIST, simHoldings: noMarket(SIM_HOLDINGS), simClosed: SIM_CLOSED,
      simNotional, simPending: SIM_PENDING, simClosePending: SIM_CLOSE_PENDING, dailyPnlLog,
      analysisHistory: histForSync,
      savedAt: localStorage.getItem("trendo_v4_savedAt") || new Date().toISOString()
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
    const localTotal   = HOLDINGS.length + SIM_HOLDINGS.length + CLOSED_POSITIONS.length;
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
      // Local is newer — push to keep cloud in sync
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
    if (currentPage === "journal")   renderJournal();
    renderSim();
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
  function saveLocalOnly() {
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
      localStorage.setItem("trendo_v4_daily_pnl",    JSON.stringify(dailyPnlLog));
      localStorage.setItem("trendo_v4_analysis_hist", JSON.stringify(analysisHistory));
      localStorage.setItem("trendo_v4_savedAt",      new Date().toISOString());
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
        if (closedFilter === "loss"   && pnl >  0) return false;
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
          : `<td style="width:40px;padding:6px 4px"><div class="row-actions">
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
          if (e.target.closest(".close-pos-btn, .delete-btn")) return;
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
    }

    // counts
    const rc = $("#row-count"); if (rc) rc.textContent = rows.length;
    $("#c-open").textContent   = HOLDINGS.length;
    $("#c-closed").textContent = CLOSED_POSITIONS.length;
    if (activeTab === "closed") {
      const safe = el => { const e = $(el); if (e) e.textContent = v; };
      const cp = CLOSED_POSITIONS;
      const profit = cp.filter(h => (h.pnlFinal ?? h.pnlDollar ?? 0) > 0).length;
      const loss   = cp.filter(h => (h.pnlFinal ?? h.pnlDollar ?? 0) <= 0).length;
      const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
      set("#c-cl-all",    cp.length);
      set("#c-cl-profit", profit);
      set("#c-cl-loss",   loss);
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

    const statusLabel = isClosed ? (pnl > 0 ? "盈利" : "亏损") : bs.label.split(" · ")[0];
    const statusCls   = isClosed ? (pnl > 0 ? "ok" : "danger") : bs.cls;

    const flagBtn = opts.sim && !isClosed
      ? `<button class="hc-action sim-flag-btn ${h.flagged ? 'flagged' : ''}" data-sym="${h.sym}" title="候选标记"><svg width="11" height="11" viewBox="0 0 24 24" fill="${h.flagged ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>`
      : "";

    const actions = !isClosed
      ? `${flagBtn}<button class="hc-action close-pos-btn" data-sym="${h.sym}" title="平仓"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg></button>
         <button class="hc-action delete-btn" data-sym="${h.sym}" title="删除"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`
      : `<button class="hc-action delete-btn" data-sym="${h.sym}" data-from="closed" title="删除"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;

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
          <span class="status ${statusCls}"><span class="dot"></span>${statusLabel}</span>
          <div class="hc-actions">${actions}</div>
        </div>
      </div>
      <div class="hc-body">
        <div class="hc-pnl-row">
          <span class="hc-pnl ${pnlSign}">${fmt.signed(pnl)}</span>
          <span class="hc-pct ${pnlSign}">${fmt.pct(pct)}</span>
          <span class="hc-sep muted">·</span>
          <span class="hc-days muted">${h.days ?? 0}天</span>
          ${!isClosed && h.bx?.dailyBars ? (() => { const v = h.bx.dailyBars; const cls = v === "0-5" ? "bxbar-early" : v === "5-15" ? "bxbar-mid" : "bxbar-late"; const lbl = v === "0-5" ? "开始" : v === "5-15" ? "中间" : "延续"; return `<span class="hc-sep muted">·</span><span class="bx-bar-chip ${cls}" style="font-size:9.5px;padding:2px 6px;gap:0">${v}<span class="bx-bar-sub">${lbl}</span></span>`; })() : ""}
        </div>
        ${!isClosed ? `<div class="hc-prog-wrap">
          <div class="hc-prog-fill" style="width:${(Math.abs(progPct)*100).toFixed(1)}%;background:${progColor};${progPct<0?"margin-left:auto":""}"></div>
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
          const win = pnl > 0;
          return `<td><span class="status ${win ? "ok" : "danger"}"><span class="dot"></span>${win ? "盈利 · Win" : "亏损 · Loss"}</span></td>`;
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
    }
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
    const partialCloses = isClosed ? [] : closedArr
      .filter(c => c.sym === h.sym && c.exitReason === "partial")
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
        </div>` : ""}
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
            ${partialCloses.map(c => `
              <div class="exec-item">
                <span class="exec-type" style="background:color-mix(in oklch,var(--warn) 18%,transparent);color:var(--warn)">减仓</span>
                <span class="exec-date">${fmt.date(c.closedAt)}</span>
                <span class="exec-price mono">$${price(c.closePrice)}</span>
                <span class="exec-qty muted">${c.qty} 股</span>
                <span class="exec-qty muted ${fmt.sign(c.pnlFinal)}" style="margin-left:auto">${fmt.signed(c.pnlFinal)}</span>
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
    const losses = total - wins;
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

    // Auto-fetch company name when ticker is entered
    $("#form-ticker").addEventListener("blur", async () => {
      const sym = $("#form-ticker").value.toUpperCase().trim();
      const nameEl = $("#form-name");
      if (!sym || !nameEl || nameEl.value.trim()) return;
      nameEl.placeholder = "获取中…";
      try {
        const res = await fetch(`/api/quote?stocks=${encodeURIComponent(sym)}`);
        const { results } = await res.json();
        const fetched = results?.[sym]?.name;
        if (fetched) { nameEl.value = fetched; nameEl.placeholder = fetched; }
        else nameEl.placeholder = "公司名称（可留空）";
      } catch (_) { nameEl.placeholder = "公司名称（可留空）"; }
    });

    const readFormBX = () => {
      const body = $("#form-bx-body");
      const dailyBars = body?.querySelector("[data-fbx='dailyBars'].active")?.dataset.val || "0-5";
      const weekly    = parseFloat(body?.querySelector("[data-fbx='weekly'].active")?.dataset.val) || 0;
      const monthly   = parseFloat(body?.querySelector("[data-fbx='monthly'].active")?.dataset.val) || 0;
      const snameEl   = $("#fbx-sname");
      const sname     = snameEl?.textContent.trim() || "—";
      const scolor    = snameEl?.style.background || "oklch(0.35 0.01 250)";
      const sscore    = parseFloat($("#fbx-sscore")?.value) || 0;
      const sslope    = parseFloat($("#fbx-sslope")?.value) || 0;
      const oscore    = parseFloat($("#fbx-oscore")?.value) || 0;
      const oslope    = parseFloat($("#fbx-oslope")?.value) || 0;
      return {
        dailyBars, weekly, monthly,
        sector:  { name: sname, color: scolor, score: String(sscore), slope: sslope, slopeDir: Math.sign(sslope) },
        overall: { score: String(oscore), slope: oslope, slopeDir: Math.sign(oslope) }
      };
    };

    const resetFormBX = () => {
      const toggle = $("#form-bx-toggle"), body = $("#form-bx-body");
      if (toggle) toggle.classList.remove("open");
      if (!body) return;
      body.style.display = "none";
      [["dailyBars","0-5"],["weekly","0"],["monthly","0"]].forEach(([field, def]) => {
        $$(`[data-fbx="${field}"]`, body).forEach(b => b.classList.toggle("active", b.dataset.val === def));
      });
      ["fbx-sscore","fbx-sslope","fbx-oscore","fbx-oslope"].forEach(id => {
        const el = $(`#${id}`);
        if (el) { el.value = "0"; el.className = "bx-slope-input tint-flat"; }
      });
      const fbqS = $("#fbq-sector"), fbqO = $("#fbq-overall");
      if (fbqS) fbqS.innerHTML = bqBadgeHTML(0, 0);
      if (fbqO) fbqO.innerHTML = bqBadgeHTML(0, 0);
      const snameEl = $("#fbx-sname");
      if (snameEl) { snameEl.textContent = "—"; snameEl.style.background = "oklch(0.35 0.01 250)"; }
      $$(".bx-color-opt", body).forEach(b => b.classList.toggle("active", b.dataset.colorVal === "oklch(0.35 0.01 250)"));
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

      // Slope/score inputs: tint + badge refresh
      const refreshFormBadge = which => {
        const score = parseFloat((which === "sector" ? $("#fbx-sscore") : $("#fbx-oscore"))?.value) || 0;
        const slope = parseFloat((which === "sector" ? $("#fbx-sslope") : $("#fbx-oslope"))?.value) || 0;
        const badgeEl = which === "sector" ? $("#fbq-sector") : $("#fbq-overall");
        if (badgeEl) badgeEl.innerHTML = bqBadgeHTML(score, Math.sign(slope));
      };
      [["fbx-sscore","sector",false],["fbx-sslope","sector",true],
       ["fbx-oscore","overall",false],["fbx-oslope","overall",true]].forEach(([id, which, isSlope]) => {
        const el = $(`#${id}`);
        if (!el) return;
        const commit = () => {
          if (isSlope) {
            const n = parseFloat(el.value) || 0;
            el.className = "bx-slope-input " + (n > 0 ? "tint-up" : n < 0 ? "tint-down" : "tint-flat");
          }
          refreshFormBadge(which);
        };
        el.addEventListener("input", commit);
        el.addEventListener("blur", commit);
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
          bx: readFormBX()
        });
        saveToStorage();
        form.reset();
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
        bx: readFormBX()
      };

      targetHoldings.push(newPos);
      saveToStorage();
      form.reset();
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

  // ============ SEARCH / FILTERS / KEYBOARD ============
  function wireControls() {
    // Nav page switching
    $$(".navlink[data-page]").forEach(a => {
      a.addEventListener("click", e => { e.preventDefault(); switchPage(a.dataset.page); });
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
    if (now - lastPriceFetch >= priceIntervalMs) {
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
    if (!allPos.length) return;

    const fromDate = allPos
      .map(h => h.entry?.slice(0, 10))
      .filter(Boolean)
      .sort()[0];
    if (!fromDate) return;

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

    // Pending symbols go first so they are never truncated by the API limit
    const allSyms = [...pendingSyms, ...all.map(h => h.sym)];
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
        if (SIM_HOLDINGS.find(h => h.sym === order.sym)) return; // already open

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

      if (changed) {
        recordDailyPnl();
        saveToStorage();
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

    // Max 5 per sym, 25 total — keeps feed balanced
    const perSym = {};
    const shown  = [];
    for (const a of articles) {
      const n = perSym[a.sym] || 0;
      if (n >= 5) continue;
      perSym[a.sym] = n + 1;
      shown.push(a);
      if (shown.length >= 25) break;
    }

    if (!shown.length) {
      if (panel) panel.style.display = "none";
      if (label) label.style.display = "none";
      return;
    }

    if (panel) panel.style.display = "";
    if (label) label.style.display = "";
    if (count) count.textContent = `${shown.length} 条`;

    const sentLabel = s => s === "positive" ? "利好" : s === "negative" ? "利空" : "中性";
    const sentClass = s => s === "positive" ? "pos"  : s === "negative" ? "neg"  : "neu";

    feed.innerHTML = shown.map(a => {
      const logoUrl    = logos[a.sym] || "";
      const safeTitle  = a.title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const safeSource = (a.source || "").replace(/</g, "&lt;");
      const sent       = a.sentiment || "neutral";
      const initials   = a.sym.slice(0, 3);

      // Initials always render (pure CSS, same as holdings .avatar).
      // Real logo loads on top — onerror hides it so initials show through.
      const imgTag = logoUrl
        ? `<img src="${logoUrl}" alt="" loading="lazy" onerror="this.style.display='none'">`
        : "";

      return `<a class="news-item" href="${a.url}" target="_blank" rel="noopener noreferrer">
        <div class="news-avatar">${initials}${imgTag}</div>
        <div class="news-body">
          <div class="news-title">${safeTitle}</div>
          <div class="news-meta">
            <span class="news-meta-txt">${safeSource}${safeSource ? " · " : ""}${timeAgo(a.publishedAt)}</span>
            <span class="news-sent ${sentClass(sent)}">${sentLabel(sent)}</span>
          </div>
        </div>
      </a>`;
    }).join("");
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
    const VIEWS = { desk: "desk-view", journal: "journal-view", sim: "sim-view", analytics: "analytics-view", watchlist: "watchlist-view", market: "market-view" };
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
    if (page === "journal")   renderJournal();
    if (page === "sim")       renderSim();
    if (page === "analytics") { renderAnalytics(); fetchAndBuildHistory(); }
    if (page === "watchlist") renderWatchlist();
    if (page === "market")    fetchMarketData();
    if (page === "desk" && HOLDINGS.length > 0) {
      fetchNews(HOLDINGS.filter(h => h.kind !== "crypto").map(h => h.sym));
      initHoldingsBriefCard();
    }
  }

  // ============ JOURNAL ============
  function renderJournal() {
    const feed = $("#journal-feed");
    if (!feed) return;

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

    // Top stats bar (all-time closed, grouped by trade)
    const allClosedTrades = groupTrades(CLOSED_POSITIONS);
    const wins = allClosedTrades.filter(t => t.pnlFinal > 0);
    const totalPnl = allClosedTrades.reduce((s, t) => s + t.pnlFinal, 0);
    const winRate = allClosedTrades.length ? Math.round(wins.length / allClosedTrades.length * 100) : null;
    const statsBar = allClosedTrades.length > 0 ? `
      <div class="j-statsbar">
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
        <div class="j-statsbar-sep"></div>
        <div class="j-statsbar-item">
          <span class="j-statsbar-label">持仓中</span>
          <span class="j-statsbar-value">${HOLDINGS.length} 笔</span>
        </div>
      </div>` : "";

    // Group by year-month
    const groups = {};
    combined.forEach(({ h, from }) => {
      const date = from === "closed" ? (h.closedAt || h.entry) : h.entry;
      const key = date?.slice(0, 7) || "0000-00";
      (groups[key] = groups[key] || []).push({ h, from });
    });

    const MO_ZH = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
    const groupsHTML = Object.keys(groups).sort((a, b) => b.localeCompare(a)).map(key => {
      const items = groups[key];
      const [yr, mo] = key.split("-");
      const label = key === "0000-00" ? "未知日期" : `${yr}年 ${MO_ZH[parseInt(mo) - 1]}`;
      const mClosed = items.filter(x => x.from === "closed");
      const mTrades = groupTrades(mClosed.map(x => x.h));
      const mWins   = mTrades.filter(t => t.pnlFinal > 0);
      const mPnl    = mTrades.reduce((s, t) => s + t.pnlFinal, 0);
      const mOpen   = items.filter(x => x.from === "open").length;
      let mStats = "";
      if (mTrades.length > 0) {
        mStats = `${mTrades.length}笔 · ${mWins.length}胜${mTrades.length - mWins.length}负 · ${fmt.signed(Math.round(mPnl))}`;
      } else if (mOpen > 0) {
        mStats = `${mOpen}笔持仓中`;
      }
      // Open positions first (entry-date desc), closed at bottom (closedAt desc)
      const orderedItems = [
        ...items.filter(x => x.from === "open"),
        ...items.filter(x => x.from === "closed"),
      ];
      return `<div class="jm-group">
        <div class="jm-header">
          <span class="jm-title">${label}</span>
          <span class="jm-rule"></span>
          ${mStats ? `<span class="jm-stats">${mStats}</span>` : ""}
        </div>
        ${orderedItems.map(({ h, from }) => journalCardHTML(h, from)).join("")}
      </div>`;
    }).join("");

    feed.innerHTML = statsBar + groupsHTML;

    $$("[data-journal-filter]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.journalFilter === journalFilter);
      btn.addEventListener("click", () => { journalFilter = btn.dataset.journalFilter; renderJournal(); });
    });

    $$(".jc-note-toggle", feed).forEach(toggle => {
      toggle.addEventListener("click", () => {
        toggle.classList.toggle("open");
        const body = toggle.nextElementSibling;
        body.classList.toggle("open");
        if (body.classList.contains("open")) {
          const ta = body.querySelector("textarea");
          if (ta) autoResizeTA(ta);
        }
      });
    });

    $$(".journal-note-area", feed).forEach(ta => {
      autoResizeTA(ta);
      ta.addEventListener("input", () => autoResizeTA(ta));
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
    const pnlSign = pnlAmt != null ? fmt.sign(pnlAmt) : "neu";
    const bx = h.bx || {};

    let badgeColor, badgeTxt;
    if (isClosed) {
      const win = (pnlAmt ?? 0) > 0;
      badgeColor = win ? "var(--up)" : "var(--down)";
      badgeTxt = win ? "盈利" : "亏损";
    } else {
      const bs = BUCKET_STATUS[progressBucket(h)];
      badgeColor = bs.color; badgeTxt = bs.label.split("·")[0].trim();
    }

    const barsCls = bx.dailyBars === "0-5" ? "bxbar-early" : bx.dailyBars === "5-15" ? "bxbar-mid" : "bxbar-late";
    const barsLbl = bx.dailyBars === "0-5" ? "开始" : bx.dailyBars === "5-15" ? "中间" : "延续";
    const dateStr = isClosed
      ? `${fmt.date(h.entry)} → ${fmt.date(h.closedAt)} · ${h.days ?? "—"}d`
      : `${fmt.date(h.entry)} · ${h.days}d`;
    const hasNote = !!(h.journalNote?.trim());

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
          <span class="jc-date">${dateStr}</span>
          ${pnlAmt != null ? `<span class="jc-pnl ${pnlSign}">${fmt.signed(pnlAmt)}</span>` : ""}
          ${isClosed && h.rMult != null ? `<span class="jc-rmult ${fmt.sign(h.rMult)}">${fmt.rMult(h.rMult)}</span>` : ""}
        </div>
      </div>

      <div class="jc-bx">
        <span class="bx-bar-chip ${barsCls}">${bx.dailyBars ?? "—"}<span class="bx-bar-sub">${barsLbl}</span></span>
        ${bx.weekly  != null ? `<span class="bx-chip-score" style="font-size:11px;padding:2px 8px">W ${bx.weekly  >= 0 ? "+" : ""}${bx.weekly}</span>` : ""}
        ${bx.monthly != null ? `<span class="bx-chip-score" style="font-size:11px;padding:2px 8px">M ${bx.monthly >= 0 ? "+" : ""}${bx.monthly}</span>` : ""}
        ${bx.sector?.name ? `<span class="muted" style="font-size:10.5px;display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:50%;background:${bx.sector.color};flex-shrink:0;display:inline-block"></span>${bx.sector.name}</span>` : ""}
      </div>

      ${h.thesis ? `<div class="jc-thesis">${h.thesis}</div>` : ""}

      <div class="jc-note-toggle" data-sym="${h.sym}" data-from="${from}">
        <span class="nt-chevron"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg></span>
        笔记${hasNote ? " · 已有内容" : " · 点击展开"}
      </div>
      <div class="jc-note-body">
        <textarea class="journal-note-area" data-sym="${h.sym}" data-from="${from}" placeholder="记录入场思路、心态、执行情况…" rows="3">${h.journalNote || ""}</textarea>
      </div>
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

    const hasSimData = rows.some(r => r.today !== 0 || r.todayPct !== 0);
    const total = rows.reduce((s, r) => s + r.today, 0);
    const wins  = rows.filter(r => r.today > 0).length;
    const loses = rows.filter(r => r.today < 0).length;
    const tSign = total > 0 ? "up" : total < 0 ? "down" : "";
    const tStr  = !hasSimData ? "行情加载中…" : total === 0 ? "±$0" : (total > 0 ? "+" : "−") + "$" + Math.abs(total).toLocaleString("en-US");
    const metaEl = $("#sim-daily-sources-meta");
    if (metaEl) metaEl.innerHTML = `<span class="ssl-total ${tSign}">${tStr}</span>${hasSimData ? ` · ${wins}↑ ${loses}↓` : ""}`;

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
        <div class="sim-card-sub">${open} 笔持仓中</div>
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
        if (simClosedFilter === "loss"   && pnl >  0) return false;
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
        const sym = btn.dataset.sym;
        const idx = SIM_CLOSED.findIndex(h => h.sym === sym);
        if (idx === -1) return;
        const h = SIM_CLOSED[idx];
        if (SIM_HOLDINGS.find(x => x.sym === sym)) { alert("模拟仓中已有该持仓"); return; }
        const { closedAt, closePrice, pnlFinal, exitReason, ...restored } = h;
        restored.last = restored.cost;
        recomputeHolding(restored, simNotional);
        SIM_HOLDINGS.push(restored);
        SIM_CLOSED.splice(idx, 1);
        saveToStorage();
        renderSimOverview(); renderSimTable(); renderSimAnalytics();
      });
    });

    // Counts
    const setCount = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setCount("sim-c-open",   SIM_HOLDINGS.length);
    setCount("sim-c-closed", SIM_CLOSED.length);
    if (simActiveTab === "closed") {
      setCount("sim-c-cl-all",    SIM_CLOSED.length);
      setCount("sim-c-cl-profit", SIM_CLOSED.filter(h => (h.pnlFinal ?? h.pnlDollar ?? 0) > 0).length);
      setCount("sim-c-cl-loss",   SIM_CLOSED.filter(h => (h.pnlFinal ?? h.pnlDollar ?? 0) <= 0).length);
    } else {
      setCount("sim-c-all",   SIM_HOLDINGS.length);
      setCount("sim-c-eq",    SIM_HOLDINGS.filter(h => h.kind === "equity").length);
      setCount("sim-c-etf",   SIM_HOLDINGS.filter(h => h.kind === "etf").length);
      setCount("sim-c-cr",    SIM_HOLDINGS.filter(h => h.kind === "crypto").length);
      setCount("sim-c-rk",    SIM_HOLDINGS.filter(h => ["Pullback","Near Stop"].includes(progressBucket(h))).length);
      setCount("sim-c-tg",    SIM_HOLDINGS.filter(h => progressBucket(h) === "Near Target").length);
      setCount("sim-c-watch", SIM_HOLDINGS.filter(h => h.flagged).length);
    }

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
    const openEntries   = SIM_HOLDINGS.map(h => ({ h, isOpen: true,  date: h.entry || "" }));
    const closedEntries = SIM_CLOSED.map(h   => ({ h, isOpen: false, date: h.closedAt || h.entry || "" }));
    const sorted = [...openEntries, ...closedEntries].sort((a, b) => b.date.localeCompare(a.date));

    el.innerHTML = `<div class="panel" style="padding:0;overflow:hidden">` +
      sorted.map(({ h, isOpen }) => {
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
          </div>`;
        }
      }).join("") + `</div>`;
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
    }
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
    const losses = closed.filter(t => t.pnlFinal <= 0);
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

    const sortedC = [...closedRaw].sort((a, b) => (a.closedAt||"").localeCompare(b.closedAt||""));
    const totalPnlDollar = open.reduce((s, h) => s + (h.pnlDollar || 0), 0);
    const currentPortfolioValue = totalNotional + totalPnlDollar;
    const curveData = generatePortfolioCurve(equityPeriod);

    // BX buckets
    const bxBuckets = { "0-5": [], "5-15": [], "15+": [] };
    closed.forEach(h => { const b = h.bx?.dailyBars || "15+"; if (bxBuckets[b]) bxBuckets[b].push(h); });

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
        ${ametric("胜率",        winRate !== null ? winRate + "%" : "—", parseFloat(winRate) >= 50 ? "up" : "down", winRate !== null ? `${wins.length}胜/${losses.length}负` : "")}
        ${ametric("盈亏因子",    pfStr || "—", parseFloat(pfStr) >= 1.5 ? "up" : "down", "总盈 ÷ 总亏")}
        ${ametric("平均盈利",    avgWin !== null ? fmt.signed(avgWin) : "—", "up", avgWin !== null ? `${wins.length} 笔赢` : "")}
        ${ametric("平均亏损",    avgLoss !== null ? "−$" + avgLoss.toLocaleString() : "—", "down", avgLoss !== null ? `${losses.length} 笔亏` : "")}
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
              <span class="mono ${fmt.sign(totalPnlDollar)}" style="font-size:11px;margin-left:6px">${fmt.signed(Math.round(totalPnlDollar))}</span>
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

      <div class="analytics-chart-row">
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
      if (peakPrice <= h0.cost) continue;

      const totalQty  = records.reduce((s, r) => s + (r.qty ?? 0), 0);
      const peakPnl   = (peakPrice - h0.cost) * totalQty;
      const actualPnl = records.reduce((s, r) => s + (r.pnlFinal ?? 0), 0);
      const leftOnTable = peakPnl - actualPnl;
      const efficiency  = Math.round(Math.min(actualPnl, peakPnl) / peakPnl * 100);
      const isPartial   = records.length > 1;

      rows.push({ h: { ...h0, closedAt: closeDate }, peakPnl, actualPnl, leftOnTable, efficiency, isPartial, trancheCnt: records.length });
    }

    if (!rows.length) {
      return histLoading
        ? `<div class="eq-empty">加载历史价格中…</div>`
        : `<div class="eq-empty">暂无数据 · 需要已平仓记录和历史价格</div>`;
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

    return summaryHTML + listHTML;
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

  // ============ WATCHLIST ============
  function renderWatchlist() {
    const content = $("#watchlist-content");
    if (!content) return;

    content.innerHTML = WATCHLIST.length === 0
      ? `<div style="text-align:center;padding:48px;color:var(--fg-3);font-size:13px">暂无列表记录</div>`
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
    const mins = Math.round((Date.now() - ms) / 60000);
    if (mins < 1)  return "刚刚";
    if (mins < 60) return `${mins}分钟前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}小时前`;
    return new Date(ms).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
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
    const date = new Date().toLocaleDateString("en-CA");
    // Preserve the original analysis timestamp (data._savedAt) so re-viewing
    // a history card doesn't reset the "X分钟前" counter. Only force=true
    // re-analysis gets a fresh Date.now().
    const existing = analysisHistory.find(e => e.sym === sym && e.date === date);
    const savedAt  = forceNow ? Date.now() : (data._savedAt ?? existing?.savedAt ?? Date.now());
    const entry = {
      sym,
      grade:     data.scores?.grade ?? "",
      overall:   data.scores?.overall ?? 50,
      name:      data.name ?? "",
      price:     typeof data.price === "number" ? data.price : null,
      savedAt,
      date,
      _fullData: data,  // full analysis object for cross-device cache restore
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
    const gc = saGradeColor(h.overall);
    const meta = [h.price != null ? `$${h.price.toFixed(2)}` : null, saHistTimeStr(h.savedAt)].filter(Boolean).join(" · ");
    return `<div class="sa-hist-card" data-sym="${h.sym}" data-date="${h.date || ""}">
      <div class="sa-hist-sym">${h.sym}</div>
      ${h.grade ? `<div class="sa-hist-grade" style="color:${gc}">${h.grade}</div>` : ""}
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

    let sections;
    if (_histSort === "score") {
      // Flat list sorted by overall score (desc), then time as tiebreak — no date grouping
      const ranked = [...hist].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0) || (b.savedAt ?? 0) - (a.savedAt ?? 0));
      sections = `<div class="wl-hist-group">
        <div class="wl-hist-cards">${ranked.map(saHistCardHTML).join("")}</div>
      </div>`;
    } else {
      // Group by date, most recent first
      const groups = new Map();
      hist.forEach(h => {
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
        <button data-sort="score" class="${_histSort === "score" ? "active" : ""}">评分</button>
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
        const sym = btn.dataset.sym, date = btn.dataset.date;
        const idx = analysisHistory.findIndex(e => e.sym === sym && (e.date === date || !date));
        if (idx >= 0) analysisHistory.splice(idx, 1);
        try { localStorage.removeItem(`wl_analysis_${sym}`); } catch (_) {}
        saveLocalOnly();
        clearTimeout(syncTimer); syncTimer = setTimeout(syncPush, 2000);
        renderAnalysisHistory();
      });
    });
  }

  // ── Stock analysis: localStorage cache + API call ─────────────────────────
  async function fetchStockAnalysis(sym, force = false) {
    const key = `wl_analysis_${sym}`;
    if (!force) {
      // 1. Check localStorage (same device)
      try {
        const c = JSON.parse(localStorage.getItem(key) || "null");
        if (c?._date) return c;
      } catch (_) {}
      // 2. Check history _fullData (cross-device: another device synced this)
      const histEntry = analysisHistory.find(e => e.sym === sym && e._fullData?._date);
      if (histEntry?._fullData) {
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
    const gradeColor = saGradeColor;
    const barColor   = s => s >= 75 ? "var(--up)" : s >= 60 ? "var(--accent)" : s >= 45 ? "var(--warn)" : "var(--down)";

    // Recommendation badge style
    const recStyle = {
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

    // Score bars
    const scoreBars = [
      { lbl: "技术面",   val: scores.trend },
      { lbl: "估值",     val: scores.valuation },
      { lbl: "成长性",   val: scores.growth },
      { lbl: "财务健康", val: scores.health },
      { lbl: "分析师",   val: scores.analyst },
    ].map(({ lbl, val }) => val != null ? `
      <div class="sa-score-row">
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
        label: "财务健康",
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

    // Age tag
    const ageStr = updatedAt ? (() => {
      const diff = Math.round((Date.now() - new Date(updatedAt)) / 60000);
      return diff < 1 ? "刚刚" : diff < 60 ? `${diff}分钟前` : `${Math.floor(diff / 60)}小时前`;
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
          <div class="sa-grade" style="color:${gradeColor(scores.overall)}">${scores.grade}</div>
          <div>
            <div class="sa-overall-num" style="color:${gradeColor(scores.overall)}">${scores.overall}<span style="font-size:13px;font-weight:400;color:var(--fg-3)">/100</span></div>
            <div class="sa-overall-sub">综合评分</div>
          </div>
          <div class="sa-radar-inline">${buildRadarSVG(scores)}</div>
        </div>
        <div class="sa-score-grid">${scoreBars}</div>
      </div>

      ${recommendation ? `<div class="sa-rec">
        <span class="sa-rec-badge" style="background:${recStyle.bg};border-color:${recStyle.border};color:${recStyle.text}">${recommendation.label ?? ""}</span>
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
        popup.querySelector(".sa-tip-desc").textContent = tip[1];
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
      label: "VXN (Nasdaq)", cap: 70,
      zones: [
        { max: 18,  color: "#22c55e", label: "充裕",   badge: "充裕" },
        { max: 25,  color: "#3b82f6", label: "正常",   badge: "正常" },
        { max: 35,  color: "#f97316", label: "收缩",   badge: "收缩" },
        { max: 55,  color: "#ef4444", label: "极小",   badge: "极小" },
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
  function combineAxes(dir, risk, sent) {
    if (!dir.eligible)
      return { headline: "❌ 禁止新多仓", color: "#ef4444",
        detail: `方向轴逆风（${dir.desc}）。无论 VIX 多低都不新开多仓，优先保护现有仓位、严格执行止损。` };
    if (sent.tilt === "trim")
      return { headline: "⚠️ 止盈 / 禁新仓", color: "#f97316",
        detail: `情绪极端过热（${sent.desc}）。即使仓位容量到 ${risk.posMax}%，此时也应止盈而非加仓。` };
    if (sent.tilt === "accumulate")
      return { headline: "🔄 分批建仓", color: "#22c55e",
        detail: `${sent.desc}。仓位上限 ${risk.posMax}%，只买最强个股，分批进、不一次满仓。` };
    if (sent.tilt === "scale")
      return { headline: "⏫ 小幅加仓", color: "#3b82f6",
        detail: `${sent.desc}。仓位上限 ${risk.posMax}%，止损 ${risk.stop}。` };
    if (sent.tilt === "hold")
      return { headline: "⏸️ 持仓观望", color: "#eab308",
        detail: `情绪偏热，持有现有仓位不加码。仓位上限 ${risk.posMax}%，止损 ${risk.stop}。` };
    return { headline: "✅ 正常进攻", color: "#22c55e",
      detail: `三轴健康，可正常布局。仓位上限 ${risk.posMax}%，止损 ${risk.stop}。` };
  }

  function buildAxes({ price, ma50, ma200, vix, fg, rsi, vixTrend }) {
    const dir  = getDirectionAxis(price, ma50, ma200);
    const risk = getRiskAxis(vix);
    const sent = getSentimentAxis(fg, rsi, vixTrend);
    const combined = combineAxes(dir, risk, sent);
    return { dir, risk, sent, combined, vix, fg, rsi, price, ma50, ma200 };
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
        fetch("/api/feargreed").then(r => r.json()),
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

      const axes = buildAxes({ price: benchPrice, ma50: benchMA50, ma200: benchMA200, vix, fg, rsi, vixTrend });
      renderMarket({ vix, vxn, fg, rsi, vixChg, vxnChg, vixAbs, vxnAbs, fgAbs, fgChg, rsiAbs, rsiChg, vixEMA10, vixTrend, vxnEMA10, vxnTrend, axes });
      // AI brief context: pass the three-axis combined recommendation + direction/sentiment/posMax.
      const mktCtx = {
        vix, fg, rsi, regime: axes.combined.headline, vixTrend, indices,
        direction: axes.dir.label, posMax: axes.risk.posMax, sentiment: axes.sent.label,
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

  function _renderDrawdown(el, data) {
    const { todayDrop, matched, stats, summary, updatedAt } = data;
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
    if (!closes || closes.length < 62 || !vooCloses || vooCloses.length < 62) return null;
    const last = closes.at(-1), c20 = closes.at(-21), c60 = closes.at(-61);
    const retF = last / c20 - 1, retS = last / c60 - 1;
    const score = (retF * 1.0 + retS * 1.5) * 100;
    const vLast = vooCloses.at(-1), v20 = vooCloses.at(-21), v60 = vooCloses.at(-61);
    const a20 = retF - (vLast / v20 - 1);
    const a60 = retS - (vLast / v60 - 1);
    // 5-day score slope
    const recent = [];
    for (let i = 4; i >= 0; i--) {
      const idx = closes.length - 1 - i;
      const c = closes[idx], c2 = closes[idx - 20], c6 = closes[idx - 60];
      recent.push(c && c2 && c6 ? ((c / c2 - 1) * 1.0 + (c / c6 - 1) * 1.5) * 100 : score);
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
      const from = (() => { const d = new Date(); d.setDate(d.getDate() - 95); return d.toISOString().slice(0, 10); })();
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
  function backfillAnalysisFullData() {
    const changed = _fillHistFullData(analysisHistory);
    _restoreHistCache(analysisHistory);
    if (changed) {
      saveToStorage(); // bumps savedAt + schedules syncPush → other devices pull the full content
      if (currentPage === "watchlist") renderAnalysisHistory();
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
  tick(); setInterval(tick, 1000);

})();
