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

    const ov = $("#overview");
    ov.innerHTML = `
      <div class="ov-card" id="nav-card">
        <div class="label">总资产 (Equity)<span class="info">i</span><button class="nav-edit-btn" title="Edit equity">✎</button></div>
        <div class="value">$${totalNotional.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
        <div class="sub"><span class="muted">Portfolio NAV · 点击 ✎ 修改</span></div>
        <div class="spark">${sparkSVG([totalNotional*.97, totalNotional*.98, totalNotional*.975, totalNotional*.99, totalNotional*.995, totalNotional], 110, 36, "var(--accent)")}</div>
      </div>
      ${card({
        label: "总浮盈 / 浮亏", info: false,
        value: `<span class="${pnlSign}">${fmt.signed(totalPnlDollar)}</span>`,
        sub: `<span class="chip ${pnlSign}">${fmt.pct(totalPnlPct)}</span><span class="muted">${winners}W · ${losers}L</span>`,
        spark: barBalanceSVG(Math.max(winners, 1), Math.max(losers, 0), 90, 36)
      })}
      ${card({
        label: "今日盈亏", info: false,
        value: `<span class="up">+$3,840</span>`,
        sub: `<span class="chip up">+1.37%</span><span class="muted">vs 昨收</span>`,
        spark: sparkSVG([0, 400, 1200, 800, 2100, 3400, 3840], 90, 36, "var(--up)", true)
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
    const invested = SECTOR_SPLIT.filter(s => s.name !== "现金").reduce((a, s) => a + s.pct, 0);
    const maxPct = Math.max(...SECTOR_SPLIT.map(s => s.pct));
    return `
      <div class="ov-pie ov-alloc">
        <div class="alloc-head">
          <span class="tiny">仓位分布</span>
          <span class="big">${invested.toFixed(0)}% <span class="tiny">已投</span></span>
        </div>
        <div class="alloc-bars">
          ${SECTOR_SPLIT.map(s => `
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
    "oklch(0.70 0.16 200)", "oklch(0.72 0.16 40)",  "oklch(0.72 0.14 280)",
    "oklch(0.75 0.14 140)", "oklch(0.78 0.13 90)",  "oklch(0.70 0.18 25)",
    "oklch(0.72 0.14 320)", "oklch(0.35 0.01 250)",
  ];
  const slopeNumClass   = v => { const n = parseFloat(v); return n > 0 ? "up" : n < 0 ? "down" : "flat"; };
  const slopeNumDisplay = v => { const n = parseFloat(v) || 0; return n > 0 ? `+${n}` : `${n}`; };

  function bxSectionHTML(h) {
    const bx = h.bx;
    const scoreButtons = field => BX_SCORE_OPTS.map(o => `
      <button class="bx-score-btn ${o.cls} ${bx[field] === o.val ? "active" : ""}"
              data-bx-field="${field}" data-bx-val="${o.val}">
        <span class="bx-val">${o.label}</span>
        <span class="bx-sub">${o.sub}</span>
      </button>`).join("");
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

        <div class="bx-align-grid">
          <div class="bx-align-hdr">
            <span></span><span class="bx-meta-lbl">Score</span><span class="bx-meta-lbl">Slope</span>
          </div>
          <div class="bx-align-row">
            <div class="bx-align-label">
              <button class="bx-swatch" style="background:${bx.sector.color}"
                      data-bx-field="sectorColor" title="点击切换颜色"></button>
              <span class="bx-name" contenteditable="true"
                    data-bx-field="sectorName" spellcheck="false">${bx.sector.name}</span>
            </div>
            <span class="bx-chip-score" contenteditable="true"
                  data-bx-field="sectorScore">${bx.sector.score}</span>
            <span class="bx-chip-slope ${slopeNumClass(bx.sector.slope)}"
                  contenteditable="true" data-bx-field="sectorSlope"
                  spellcheck="false">${slopeNumDisplay(bx.sector.slope)}</span>
          </div>
          <div class="bx-align-row">
            <div class="bx-align-label">
              <span class="bx-meta-lbl" style="font-size:11px;text-transform:none;letter-spacing:0;color:var(--fg-1)">Overall vs VOO</span>
            </div>
            <span class="bx-chip-score" contenteditable="true"
                  data-bx-field="overallScore">${bx.overall.score}</span>
            <span class="bx-chip-slope ${slopeNumClass(bx.overall.slope)}"
                  contenteditable="true" data-bx-field="overallSlope"
                  spellcheck="false">${slopeNumDisplay(bx.overall.slope)}</span>
          </div>
        </div>
      </div>`;
  }

  function wireBX(h) {
    const dr = $("#drawer");
    $$("[data-bx-field][data-bx-val]", dr).forEach(btn => {
      if (btn.tagName !== "BUTTON") return;
      btn.addEventListener("click", () => {
        const field = btn.dataset.bxField, val = btn.dataset.bxVal;
        if (field === "dailyBars") {
          h.bx.dailyBars = val;
          $$(`[data-bx-field="dailyBars"]`, dr).forEach(b => b.classList.toggle("active", b.dataset.bxVal === val));
        } else if (field === "weekly" || field === "monthly") {
          h.bx[field] = +val;
          $$(`[data-bx-field="${field}"]`, dr).forEach(b => b.classList.toggle("active", b.dataset.bxVal === val));
        } else if (field === "sectorColor") {
          const cur = SWATCH_COLORS.indexOf(h.bx.sector.color);
          h.bx.sector.color = SWATCH_COLORS[(cur + 1) % SWATCH_COLORS.length];
          btn.style.background = h.bx.sector.color;
        }
      });
    });
    $$("[contenteditable][data-bx-field]", dr).forEach(el => {
      el.addEventListener("blur", () => {
        const v = el.textContent.trim(), f = el.dataset.bxField;
        if (f === "sectorName")  { h.bx.sector.name  = v; }
        if (f === "sectorScore") { h.bx.sector.score = v; }
        if (f === "overallScore") { h.bx.overall.score = v; }
        if (f === "sectorSlope") {
          h.bx.sector.slope = parseFloat(v) || 0;
          el.className = `bx-chip-slope ${slopeNumClass(h.bx.sector.slope)}`;
          el.textContent = slopeNumDisplay(h.bx.sector.slope);
        }
        if (f === "overallSlope") {
          h.bx.overall.slope = parseFloat(v) || 0;
          el.className = `bx-chip-slope ${slopeNumClass(h.bx.overall.slope)}`;
          el.textContent = slopeNumDisplay(h.bx.overall.slope);
        }
      });
      el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
    });
  }

  // ============ GLOBAL STATE ============
  let sortKey = "pnl", sortDir = -1, filter = "all", query = "", selectedSym = null;
  let activeTab = "open";
  let totalNotional = 284620;
  let reviewPeriod = "week";
  let pendingCloseSym = null;
  let pendingDeleteSym = null, pendingDeleteFrom = null;

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
    thead.innerHTML = COLS.filter(c => c.on).map(c => {
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
    const cols = COLS.filter(c => c.on);
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
      case "tk": return `<td class="ticker"><div class="tk">
          <div class="avatar ${h.kind === "crypto" ? "crypto" : ""}">${h.sym.slice(0, h.kind === "crypto" ? 3 : 4)}</div>
          <div class="meta"><div class="sym">${h.sym}</div><div class="nm">${h.name}</div></div>
        </div></td>`;
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
      wireDrawerCloseButton();
    }
    $("#drawer").classList.add("open");
    $("#backdrop").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
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
            <div class="avatar ${h.kind === "crypto" ? "crypto" : ""}">${h.sym.slice(0, h.kind === "crypto" ? 3 : 4)}</div>
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
          <button class="btn" id="drawer-close-position" style="display:flex;align-items:center;gap:7px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            平仓
          </button>
        </div>` : ""}
      </div>

      <div class="drawer-body">
        <!-- 1. 概况 -->
        <div class="drawer-section">
          <h4><span class="idx">01</span>持仓概况</h4>
          <div class="kv-grid">
            <div><div class="k">成本 / 现价</div><div class="v">$${price(h.cost)} <span class="sub">→</span> $${price(h.last)}</div></div>
            <div><div class="k">仓位占比</div><div class="v">${h.size.toFixed(1)}<span class="sub">% 净资产</span></div></div>
            <div><div class="k">止损 / 目标</div><div class="v">$${price(h.stop)} <span class="sub">·</span> $${price(h.target)}</div></div>
            <div><div class="k">当前 R 倍数</div><div class="v big ${fmt.sign(h.rMult)}">${fmt.rMult(h.rMult)}</div></div>
          </div>
        </div>

        <!-- 2. BX Trend -->
        ${bxSectionHTML(h)}

        <!-- 3. 交易计划 -->
        <div class="drawer-section">
          <h4><span class="idx">03</span>交易计划</h4>
          <div class="kv-grid" style="margin-bottom:12px">
            <div><div class="k">原始止损</div><div class="v">$${price(h.stop)} <span class="sub">(-${((h.cost - h.stop) / h.cost * 100).toFixed(1)}%)</span></div></div>
            <div><div class="k">目标位</div><div class="v">$${price(h.target)} <span class="sub">(${((h.target - h.cost) / (h.cost - h.stop)).toFixed(1)}R)</span></div></div>
            <div><div class="k">风险比</div><div class="v">${((h.target - h.cost) / (h.cost - h.stop)).toFixed(2)}<span class="sub">R reward/risk</span></div></div>
            <div><div class="k">过财报</div><div class="v" style="font-family:var(--f-sans);font-size:13px">${h.earnings ? (h.holdEarn ? "✓ 允许" : "✗ 财报前清仓") : "—"}</div></div>
          </div>
          <div class="k" style="margin-bottom:6px">入场逻辑 / Thesis</div>
          <div class="thesis">${h.thesis}</div>
        </div>

        <!-- 4. 时间轴 -->
        <div class="drawer-section">
          <h4><span class="idx">04</span>执行记录</h4>
          ${timeline(h)}
        </div>

        <!-- 5. 复盘笔记 -->
        <div class="drawer-section">
          <h4><span class="idx">05</span>复盘笔记<span class="mono muted" style="margin-left:auto;font-size:10px;letter-spacing:0">平仓后自动填充</span></h4>
          ${reviewHTML(h)}
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

  function timeline(h) {
    // generate plausible events based on position
    const events = [
      { type: "open", dt: fmt.date(h.entry), act: "建仓", detail: `${h.size.toFixed(1)}% @ $${price(h.cost)}`, note: `${h.setup} · 符合 checklist 4/5` },
    ];
    if (h.rMult > 1.5) events.push({ type: "add", dt: fmt.date(addDays(h.entry, 3)), act: "加仓", detail: `+1.5% @ $${price(h.cost * 1.04)}`, note: "follow-through 日确认" });
    if (h.rMult > 1.2) events.push({ type: "stop", dt: fmt.date(addDays(h.entry, 5)), act: "止损上移", detail: `$${price(h.stop * 0.94)} → $${price(h.stop)}`, note: "盈利 1R 后 trail 到 21EMA" });
    if (h.status === "target") events.push({ type: "trim", dt: fmt.date(addDays(h.entry, 8)), act: "减仓", detail: `-30% @ $${price(h.last * 0.98)}`, note: "接近目标，锁定部分利润" });
    if (h.status === "warn") events.push({ type: "stop", dt: "Today", act: "接近止损", detail: `现价距离止损 ${((h.last - h.stop) / h.last * 100).toFixed(1)}%`, note: "若日线跌破即清仓" });
    if (h.status === "danger") events.push({ type: "stop", dt: "Today", act: "计划失效", detail: `现价 $${price(h.last)} 贴近/跌破止损`, note: "待盘口确认后执行清仓" });

    return `<div class="timeline">
      ${events.map(e => `
        <div class="tl-item ${e.type}">
          <div class="row"><span class="act">${e.act}</span><span class="dt">${e.dt}</span><span class="detail">${e.detail}</span></div>
          <div class="note">${e.note}</div>
        </div>
      `).join("")}
    </div>`;
  }

  function addDays(iso, n) { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

  function reviewHTML(h) {
    const closed = false; // open positions — pre-fill prompts
    if (!closed) {
      return `
        <div class="review-flags">
          <span class="flag yes">✓ 按 setup 入场</span>
          <span class="flag yes">✓ 尺寸符合 1R 风控</span>
          <span class="flag ${h.status === "danger" ? "no" : ""}">${h.status === "danger" ? "✗" : "·"} 止损纪律</span>
          <span class="flag ${h.rMult > 1 ? "yes" : ""}">${h.rMult > 1 ? "✓" : "·"} 达到 1R 后调整</span>
        </div>
        <div class="review-grid" style="margin-top:12px">
          <div class="review-card win">
            <h5>▲ 做对了</h5>
            <p>${h.rMult > 1 ? "在 breakout 当天确认后按计划进场，follow-through 日及时加仓。" : "尺寸控制在 1R 预算内，避免情绪性加仓。"}</p>
          </div>
          <div class="review-card loss">
            <h5>▼ 待优化</h5>
            <p>${h.status === "danger" ? "入场前未等待成交量确认，过早进入。" : (h.status === "warn" ? "止损设置偏紧；建议放宽到结构性 low 下方。" : "若能在 +2R 时锁定一半仓位，R 曲线会更平滑。")}</p>
          </div>
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--fg-2);display:flex;align-items:center;gap:8px">
          <span>下次继续做同类 setup？</span>
          <span class="flag yes">✓ 是</span>
          <span class="flag">条件性</span>
          <span class="flag">否</span>
        </div>
      `;
    }
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
      const totalR = positions.reduce((s, p) => s + (p.rMult || 0), 0);
      const aR     = cnt > 0 ? (totalR / cnt) : 0;
      const barW   = Math.round(cnt / maxCount * 100);
      const rColor = aR >= 0 ? "var(--up)" : "var(--down)";
      const cls = bucket === "0-5" ? "bxbar-early" : bucket === "5-15" ? "bxbar-mid" : "bxbar-late";
      const lbl = bucket === "0-5" ? "开始" : bucket === "5-15" ? "中间" : "延续";
      return `
        <div class="bx-review-row">
          <div class="bx-review-chip">
            <span class="bx-bar-chip ${cls}">${bucket}<span class="bx-bar-sub">${lbl}</span></span>
          </div>
          <div class="bx-review-body">
            <div class="bx-review-track">
              <div class="bx-review-fill" style="width:${barW}%;background:${cnt > 0 ? rColor : "var(--bg-3)"}"></div>
            </div>
            <div class="bx-review-meta">
              ${cnt > 0
                ? `<span class="mono" style="font-size:10px;color:var(--fg-2)">${cnt} 笔 · ${Math.round(w / cnt * 100)}% 胜</span>
                   <span class="mono" style="font-size:10px;color:${rColor}">${aR >= 0 ? "+" : ""}${aR.toFixed(1)}R avg</span>`
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

    // Error tags (unchanged)
    $("#err-cloud").innerHTML = ERROR_TAGS.map(t =>
      `<span class="tag ${t.hot ? "hot" : ""}">${t.name}<span class="c">${t.c}</span></span>`
    ).join("");

    // Events (unchanged)
    $("#events").innerHTML = EVENTS.map(e => {
      const txt   = e.severity === "danger" ? "财报前清仓" : (e.severity === "warn" ? "减仓" : "计划持有");
      const color = e.severity === "danger" ? "var(--down)" : (e.severity === "warn" ? "var(--warn)" : "var(--up)");
      return `<div class="event">
        <div class="when"><span class="d">${e.date.split(" ")[1]}</span>${e.date.split(" ")[0]} · ${e.weekday}</div>
        <div class="sym">${e.sym}</div>
        <div class="kind">${e.kind}</div>
        ${e.inPos ? `<span class="alert" style="color:${color};background:color-mix(in oklch, ${color} 15%, transparent)">${txt}</span>` : `<span class="alert muted" style="background:var(--bg-3)">宏观</span>`}
      </div>`;
    }).join("");
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

    openBtn.addEventListener("click", () => openModal("new-position-modal"));
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

    form.addEventListener("submit", e => {
      e.preventDefault();
      const sym = $("#form-ticker").value.toUpperCase().trim();
      const entry = parseFloat($("#form-entry").value);
      const stop = parseFloat($("#form-stop").value);
      const target = parseFloat($("#form-target").value);
      const qty = parseInt($("#form-qty").value);

      if (!sym || !entry || !stop || !target || !qty) {
        alert("All fields required");
        return;
      }
      if (HOLDINGS.find(h => h.sym === sym) || CLOSED_POSITIONS.find(h => h.sym === sym)) {
        alert("Position already exists");
        return;
      }
      if (stop >= entry || entry >= target) {
        alert("Invalid price levels: stop < entry < target");
        return;
      }

      const kindBtn = $("#form-kind-seg .active");
      const kind = kindBtn ? kindBtn.dataset.kind : "equity";

      const newPos = {
        sym, qty, name: sym,
        kind,
        entry: new Date().toISOString().slice(0, 10),
        cost: entry, last: entry,
        size: 2.5,
        stop, target,
        setup: "Manual Entry",
        thesis: "Manually entered position",
        earnings: null, holdEarn: false,
        status: "ok",
        pnlPct: 0, pnlDollar: 0,
        risk1R: entry - stop,
        rMult: 0,
        days: 1,
        spark: [entry],
        bx: { dailyBars: "0-5", weekly: 0, monthly: 0, sector: { name: "—", color: "oklch(0.35 0.01 250)", score: "50", slope: "flat" }, overall: { score: "50", slope: "flat" } }
      };

      HOLDINGS.push(newPos);
      form.reset();
      closeModal("new-position-modal");
      renderTable();
      renderOverview();
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
        renderOverview();
        closeModal("equity-modal");
      }
    });
  }

  // ============ POSITION CLOSING ============

  function openCloseModal(sym) {
    const pos = HOLDINGS.find(h => h.sym === sym);
    if (!pos) return;
    pendingCloseSym = sym;
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
      const pos = HOLDINGS.find(h => h.sym === pendingCloseSym);
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

  // closePosition → archives to CLOSED_POSITIONS (accessible in Closed tab)
  function closePosition(sym, closePrice) {
    const pos = HOLDINGS.find(h => h.sym === sym);
    if (!pos) return;

    const cp = (closePrice != null && closePrice > 0) ? closePrice : pos.last;
    pos.closedAt = new Date().toISOString().slice(0, 10);
    pos.closePrice = cp;
    pos.pnlDollar = (cp - pos.cost) * pos.qty;
    pos.pnlPct = pos.cost > 0 ? pos.pnlDollar / (pos.cost * pos.qty) : 0;
    pos.rMult = pos.risk1R > 0 ? (cp - pos.cost) / pos.risk1R : 0;
    pos.pnlFinal = pos.pnlDollar;
    pos.exitReason = "manual";

    HOLDINGS.splice(HOLDINGS.indexOf(pos), 1);
    CLOSED_POSITIONS.push(pos);

    if (selectedSym === sym) closeDrawer();
    renderTable();
    renderOverview();
  }

  function openDeleteModal(sym, from) {
    pendingDeleteSym = sym;
    pendingDeleteFrom = from || "open";
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
      if (pendingDeleteFrom === "closed") {
        deleteClosedPosition(pendingDeleteSym);
      } else {
        deletePosition(pendingDeleteSym);
      }
      pendingDeleteSym = null; pendingDeleteFrom = null;
      closeModal("delete-confirm-modal");
    });
  }

  // deletePosition → permanently removes from HOLDINGS (not archived)
  function deletePosition(sym) {
    const idx = HOLDINGS.findIndex(h => h.sym === sym);
    if (idx === -1) return;
    HOLDINGS.splice(idx, 1);
    if (selectedSym === sym) closeDrawer();
    renderTable();
    renderOverview();
  }

  // deleteClosedPosition → permanently removes from CLOSED_POSITIONS
  function deleteClosedPosition(sym) {
    const idx = CLOSED_POSITIONS.findIndex(h => h.sym === sym);
    if (idx === -1) return;
    CLOSED_POSITIONS.splice(idx, 1);
    if (selectedSym === sym) closeDrawer();
    renderTable();
  }

  // ============ SEARCH / FILTERS / KEYBOARD ============
  function wireControls() {
    $("#search-input").addEventListener("input", e => { query = e.target.value; renderTable(); });
    $$(".filter-chip[data-filter]").forEach(b => b.addEventListener("click", () => {
      $$(".filter-chip[data-filter]").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      filter = b.dataset.filter;
      renderTable();
    }));
    $("#backdrop").addEventListener("click", closeDrawer);
    document.addEventListener("click", e => {
      if (e.target && e.target.id === "drawer-close") closeDrawer();
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape") { closeDrawer(); $("#tweaks").classList.remove("open"); }
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
  }

  // ============ TICKER TAPE ============
  function renderTape() {
    const track = document.getElementById("tape-track");
    if (!track) return;
    const holdings = HOLDINGS.slice(0, 15).map(h => ({
      s: h.sym, p: h.last >= 1000 ? h.last.toLocaleString("en-US",{maximumFractionDigits:0}) : h.last.toFixed(2),
      c: +(h.pnlPct * 100).toFixed(2)
    }));
    const html = holdings.map(i => {
      const cls = i.c >= 0 ? "up" : "down";
      const sign = i.c >= 0 ? "+" : "−";
      return `<span class="ti"><span class="s">${i.s}</span><span class="p">${i.p}</span><span class="c ${cls}">${sign}${Math.abs(i.c).toFixed(2)}%</span></span>`;
    }).join("");
    // duplicate for seamless loop
    track.innerHTML = html + html;
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
  wireEquityModal();
  wireClosePositionModal();
  wireDeleteModal();
  tick(); setInterval(tick, 1000);

})();
