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
    const totalNotional = 284_620;
    const todayPnl = 3_840;
    const todayPnlPct = 0.0137;
    const openPnl = 18_420;
    const openPnlPct = 0.0696;
    const openCount = HOLDINGS.length;
    const maxRisk = 4_820; // sum of 1R dollar risk
    const maxRiskPct = 0.0169;
    const discipline = 86; // score 0-100

    const ov = $("#overview");
    ov.innerHTML = `
      ${card({
        label: "总资产 (Equity)", info: true,
        value: "$284,620", sub: `<span class="chip up">+1.37%</span><span class="muted">今日</span>`,
        spark: sparkSVG([280100, 279200, 281400, 280800, 283100, 282400, 284620], 110, 36, "var(--up)")
      })}
      ${card({
        label: "今日盈亏", info: true,
        value: `<span class="up">+$3,840</span>`,
        sub: `<span class="chip up">+1.37%</span><span class="muted">vs 昨日收盘</span>`,
        spark: sparkSVG([0, 400, 1200, 800, 2100, 3400, 3840], 110, 36, "var(--up)", true)
      })}
      ${card({
        label: "总浮盈 / 浮亏", info: true,
        value: `<span class="up">+$18,420</span>`,
        sub: `<span class="chip up">+6.96%</span><span class="muted">9 盈 · 6 亏</span>`,
        spark: barBalanceSVG(9, 6, 110, 36)
      })}
      ${card({
        label: "当前持仓数", info: false,
        value: `15`,
        sub: `<span class="chip neu">10 美股</span><span class="chip neu">5 加密</span>`,
        spark: ""
      })}
      ${card({
        label: "总风险敞口", info: true,
        value: `$4,820`,
        sub: `<span class="chip neu">1.69% equity</span><span class="muted">上限 3.0%</span>`,
        spark: gaugeSVG(1.69, 3.0, 110, 36)
      })}
      ${card({
        label: "本周纪律分", info: true,
        value: `86<span class="num" style="font-size:14px;color:var(--fg-2)">/100</span>`,
        sub: `<span class="chip up">+4</span><span class="muted">vs 上周</span>`,
        spark: disciplineBars()
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
    const wW = (wins / total) * w;
    return `<svg width="${w}" height="${h}">
      <rect x="0" y="${h - 10}" width="${wW}" height="6" fill="var(--up)" rx="1"/>
      <rect x="${wW + 2}" y="${h - 10}" width="${w - wW - 2}" height="6" fill="var(--down)" rx="1"/>
      <text x="0" y="${h - 16}" fill="var(--up)" font-family="JetBrains Mono" font-size="10">${wins}W</text>
      <text x="${w}" y="${h - 16}" text-anchor="end" fill="var(--down)" font-family="JetBrains Mono" font-size="10">${losses}L</text>
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
    const cx = 46, cy = 46, r = 38, inner = 26;
    let a = -Math.PI / 2;
    const segs = SECTOR_SPLIT.map(s => {
      const da = (s.pct / 100) * Math.PI * 2;
      const a0 = a, a1 = a + da;
      a = a1;
      const large = da > Math.PI ? 1 : 0;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const xi0 = cx + inner * Math.cos(a0), yi0 = cy + inner * Math.sin(a0);
      const xi1 = cx + inner * Math.cos(a1), yi1 = cy + inner * Math.sin(a1);
      return `<path d="M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${inner} ${inner} 0 ${large} 0 ${xi0} ${yi0} Z" fill="${s.color}" stroke="var(--bg-1)" stroke-width="1"/>`;
    }).join("");
    return `
      <div class="ov-pie">
        <div class="pie-wrap">
          <svg width="92" height="92">${segs}</svg>
          <div class="pie-center"><div class="tiny">Allocation</div><div class="big">93%</div></div>
        </div>
        <div class="legend">
          ${SECTOR_SPLIT.map(s => `
            <div class="li"><span class="sw" style="background:${s.color}"></span>${s.name}<span class="pct">${s.pct.toFixed(1)}%</span></div>
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
  const slopeIcon  = s => ({ up: "↗ UP", flat: "→ FLAT", down: "↘ DOWN" }[s] || s);
  const slopeClass = s => ({ up: "up", flat: "flat", down: "down" }[s] || "flat");

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

        <div class="bx-subhead">Sector</div>
        <div class="bx-context-row">
          <button class="bx-swatch" style="background:${bx.sector.color}"
                  data-bx-field="sectorColor" title="点击切换颜色"></button>
          <span class="bx-name" contenteditable="true"
                data-bx-field="sectorName" spellcheck="false">${bx.sector.name}</span>
          <div class="bx-meta">
            <span class="bx-meta-lbl">Score</span>
            <span class="bx-chip-score" contenteditable="true"
                  data-bx-field="sectorScore">${bx.sector.score}</span>
          </div>
          <div class="bx-meta">
            <span class="bx-meta-lbl">Slope</span>
            <button class="bx-chip-slope ${slopeClass(bx.sector.slope)}"
                    data-bx-field="sectorSlope">${slopeIcon(bx.sector.slope)}</button>
          </div>
        </div>

        <div class="bx-subhead" style="margin-top:10px">Overall vs VOO</div>
        <div class="bx-context-row">
          <div class="bx-meta">
            <span class="bx-meta-lbl">Score</span>
            <span class="bx-chip-score" contenteditable="true"
                  data-bx-field="overallScore">${bx.overall.score}</span>
          </div>
          <div class="bx-meta">
            <span class="bx-meta-lbl">Slope</span>
            <button class="bx-chip-slope ${slopeClass(bx.overall.slope)}"
                    data-bx-field="overallSlope">${slopeIcon(bx.overall.slope)}</button>
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
        } else if (field === "sectorSlope" || field === "overallSlope") {
          const slopes = ["up", "flat", "down"];
          const obj = field === "sectorSlope" ? h.bx.sector : h.bx.overall;
          obj.slope = slopes[(slopes.indexOf(obj.slope) + 1) % 3];
          btn.textContent = slopeIcon(obj.slope);
          btn.className = `bx-chip-slope ${slopeClass(obj.slope)}`;
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
        if (f === "sectorName")  h.bx.sector.name  = v;
        if (f === "sectorScore") h.bx.sector.score = v;
        if (f === "overallScore") h.bx.overall.score = v;
      });
      el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
    });
  }

  // ============ PROGRESS STATUS ============
  const PROGRESS_STATUSES = [
    { key: "danger", label: "止损区",  cls: "danger" },
    { key: "warn",   label: "缓冲区",  cls: "warn"   },
    { key: "ok",     label: "正常持有", cls: "ok"     },
    { key: "trim",   label: "减仓区",  cls: "trim"   },
    { key: "target", label: "目标区",  cls: "target" },
  ];
  function progressStatus(h) {
    const p = (h.last - h.stop) / (h.target - h.stop);
    if (p < 0)    return PROGRESS_STATUSES[0];
    if (p < 0.25) return PROGRESS_STATUSES[1];
    if (p < 0.75) return PROGRESS_STATUSES[2];
    if (p < 1.0)  return PROGRESS_STATUSES[3];
    return PROGRESS_STATUSES[4];
  }

  // ============ HOLDINGS TABLE ============
  let sortKey = "pnl", sortDir = -1, filter = "all", query = "", selectedSym = null;

  function renderTable() {
    // header
    const thead = $("#thead-row");
    thead.innerHTML = COLS.filter(c => c.on).map(c => {
      const sorted = sortKey === c.id ? "sorted" : "";
      return `<th class="${c.r ? "right" : ""} ${sorted}" data-col="${c.id}">${c.label}</th>`;
    }).join("");
    $$("#thead-row th").forEach(th => th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (sortKey === col) sortDir *= -1; else { sortKey = col; sortDir = -1; }
      renderTable();
    }));

    // filter + sort
    let rows = HOLDINGS.filter(h => {
      if (filter === "equity" && h.kind !== "equity") return false;
      if (filter === "crypto" && h.kind !== "crypto") return false;
      if (filter === "risk" && !(["warn","danger"].includes(progressStatus(h).key))) return false;
      if (filter === "target" && !(["target","trim"].includes(progressStatus(h).key))) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!(h.sym.toLowerCase().includes(q) || h.name.toLowerCase().includes(q) || h.setup.toLowerCase().includes(q))) return false;
      }
      return true;
    });

    const keyFn = {
      tk: h => h.sym, bxbars: h => h.bx.dailyBars, cost: h => h.cost, last: h => h.last,
      qty: h => h.qty, pnl: h => h.pnlDollar, stop: h => h.stop, target: h => h.target,
      progstatus: h => progressStatus(h).key,
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
      return `<tr class="${isSel}" data-sym="${h.sym}">${cells}</tr>`;
    }).join("");

    $$("#tbody tr").forEach(tr => tr.addEventListener("click", () => openDrawer(tr.dataset.sym)));

    // counts
    $("#row-count").textContent = rows.length;
    $("#c-all").textContent = HOLDINGS.length;
    $("#c-eq").textContent = HOLDINGS.filter(h => h.kind === "equity").length;
    $("#c-cr").textContent = HOLDINGS.filter(h => h.kind === "crypto").length;
    $("#c-rk").textContent = HOLDINGS.filter(h => ["warn","danger"].includes(progressStatus(h).key)).length;
    $("#c-tg").textContent = HOLDINGS.filter(h => ["target","trim"].includes(progressStatus(h).key)).length;
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
        const lbl = v === "0-5" ? "早期" : (v === "5-15" ? "中期" : "延伸");
        return `<td><span class="bx-bar-chip ${cls}">${v}<span class="bx-bar-sub">${lbl}</span></span></td>`;
      }
      case "cost": return `<td class="right num muted">$${price(h.cost)}</td>`;
      case "last": return `<td class="right num" style="font-weight:600">$${price(h.last)}</td>`;
      case "qty": return `<td class="right num muted">${h.qty.toLocaleString("en-US")}</td>`;
      case "pnl": return `<td class="right"><div class="pnl-cell"><span class="num ${fmt.sign(h.pnlDollar)}" style="font-weight:600">${fmt.signed(h.pnlDollar)}</span><span class="num muted" style="font-size:10.5px">${fmt.pct(h.pnlPct)}</span></div></td>`;
      case "stop": return `<td class="right num" style="color:var(--down)">$${price(h.stop)}</td>`;
      case "target": return `<td class="right num" style="color:var(--up)">$${price(h.target)}</td>`;
      case "progstatus": {
        const ps = progressStatus(h);
        return `<td><span class="status ${ps.cls}"><span class="dot"></span>${ps.label}</span></td>`;
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
    const h = HOLDINGS.find(x => x.sym === sym);
    if (!h) return;
    selectedSym = sym;
    renderTable();
    $("#drawer").innerHTML = drawerHTML(h);
    wireBX(h);
    $("#drawer").classList.add("open");
    $("#backdrop").classList.add("open");
    $("#drawer").setAttribute("aria-hidden", "false");
  }
  function closeDrawer() {
    selectedSym = null;
    $("#drawer").classList.remove("open");
    $("#backdrop").classList.remove("open");
    $("#drawer").setAttribute("aria-hidden", "true");
    renderTable();
  }

  function drawerHTML(h) {
    const light = h.status === "ok" ? "ok" : (h.status === "warn" ? "warn" : (h.status === "danger" ? "danger" : (h.status === "target" ? "target" : "ok")));
    const lightColor = { ok: "var(--up)", warn: "var(--warn)", danger: "var(--down)", target: "var(--accent)" }[light];
    const lightTxt = { ok: "计划内 · 正常", warn: "注意 · 接近关键位", danger: "风险 · 计划失效", target: "接近目标 · 考虑减仓" }[light];
    return `
      <div class="drawer-head">
        <div class="drawer-top">
          <div class="tk">
            <div class="avatar ${h.kind === "crypto" ? "crypto" : ""}">${h.sym.slice(0, h.kind === "crypto" ? 3 : 4)}</div>
          </div>
          <div>
            <div class="mono" style="font-size:17px;font-weight:600">${h.sym}</div>
            <div class="muted" style="font-size:11.5px">${h.name} · ${h.kind === "crypto" ? "Crypto" : "Equity"}</div>
          </div>
          <span class="statlight" style="color:${lightColor}; background: color-mix(in oklch, ${lightColor} 15%, transparent);">
            <span class="dot" style="background:${lightColor}"></span>${lightTxt}
          </span>
          <button class="close" id="drawer-close" title="关闭 (Esc)">✕</button>
        </div>
        <div class="hero-price">
          <span class="p">$${price(h.last)}</span>
          <span class="pct ${fmt.sign(h.pnlPct)}">${fmt.pct(h.pnlPct)}</span>
          <span class="pnl ${fmt.sign(h.pnlDollar)}">${fmt.signed(h.pnlDollar)}</span>
          <span class="muted" style="font-family:var(--f-mono);font-size:11px;margin-left:auto">持仓 ${h.days}d · since ${fmt.date(h.entry)}</span>
        </div>
        ${levelBar(h)}
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
            <div><div class="k">Setup 类型</div><div class="v" style="font-family:var(--f-sans);font-size:13px">${h.setup}</div></div>
            <div><div class="k">原始止损</div><div class="v">$${price(h.stop)} <span class="sub">(-${((h.cost - h.stop) / h.cost * 100).toFixed(1)}%)</span></div></div>
            <div><div class="k">目标位</div><div class="v">$${price(h.target)} <span class="sub">(${((h.target - h.cost) / (h.cost - h.stop)).toFixed(1)}R)</span></div></div>
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

  // ============ BOTTOM: setup bars / errors / events ============
  function renderBottom() {
    // setup bars — normalized around zero
    const maxAbs = Math.max(...SETUP_STATS.map(s => Math.abs(s.r)));
    $("#setup-list").innerHTML = SETUP_STATS.map(s => {
      const pct = Math.abs(s.r) / maxAbs * 48;
      const barHTML = s.r >= 0
        ? `<div class="bar" style="left:50%;width:${pct}%;background:var(--up)"></div>`
        : `<div class="bar" style="right:50%;width:${pct}%;background:var(--down)"></div>`;
      return `<div class="setup-row">
        <div class="nm">${s.name}</div>
        <div class="bar-wrap">${barHTML}<div class="zero"></div></div>
        <div class="val ${s.r >= 0 ? "up" : "down"}">${s.r >= 0 ? "+" : "−"}${Math.abs(s.r).toFixed(1)}R</div>
        <div class="count">${s.trades}笔</div>
      </div>`;
    }).join("");

    $("#err-cloud").innerHTML = ERROR_TAGS.map(t => `
      <span class="tag ${t.hot ? "hot" : ""}">${t.name}<span class="c">${t.c}</span></span>
    `).join("");

    $("#events").innerHTML = EVENTS.map(e => {
      const cls = e.severity === "danger" ? "down-dim" : (e.severity === "warn" ? "warn-dim" : "up-dim");
      const txt = e.severity === "danger" ? "财报前清仓" : (e.severity === "warn" ? "减仓" : "计划持有");
      const color = e.severity === "danger" ? "var(--down)" : (e.severity === "warn" ? "var(--warn)" : "var(--up)");
      return `<div class="event">
        <div class="when"><span class="d">${e.date.split(" ")[1]}</span>${e.date.split(" ")[0]} · ${e.weekday}</div>
        <div class="sym">${e.sym}</div>
        <div class="kind">${e.kind}</div>
        ${e.inPos ? `<span class="alert" style="color:${color};background:color-mix(in oklch, ${color} 15%, transparent)">${txt}</span>` : `<span class="alert muted" style="background:var(--bg-3)">宏观</span>`}
      </div>`;
    }).join("");
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
    const macro = [
      { s: "SPY",  p: "518.42", c: +0.82 },
      { s: "QQQ",  p: "445.71", c: +1.24 },
      { s: "IWM",  p: "198.30", c: -0.44 },
      { s: "VIX",  p: "14.85",  c: -2.10 },
      { s: "DXY",  p: "104.32", c: +0.15 },
      { s: "10Y",  p: "4.28%",  c: +0.03 },
      { s: "GLD",  p: "302.10", c: +0.55 },
      { s: "WTI",  p: "82.41",  c: -0.92 },
    ];
    const holdings = window.HOLDINGS.slice(0, 10).map(h => ({
      s: h.sym, p: h.last >= 1000 ? h.last.toLocaleString("en-US",{maximumFractionDigits:0}) : h.last.toFixed(2),
      c: +(h.pnlPct * 100).toFixed(2)
    }));
    const items = [...macro, ...holdings];
    const html = items.map(i => {
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
  tick(); setInterval(tick, 1000);

})();
