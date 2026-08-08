// 期权已结算权利金 — 核对脚本
// 用法：在 Trendo 页面按 F12 打开控制台，整段粘贴回车。
// 作用：逐笔列出所有已结算期权，把存储里的 realized 与按当前规则重算的值对比，
//       找出差额来自哪几笔。只读，不修改任何数据。
(() => {
  const LS = { sim: "trendo_v4_sim_options", real: "trendo_v4_real_options" };
  const read = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
  const usd = n => (n < 0 ? "−$" : "$") + Math.abs(n).toFixed(2);

  for (const [mode, key] of Object.entries(LS)) {
    const arr = read(key);
    const settled = arr.filter(p => ["expired", "closed", "assigned"].includes(p.status));
    if (!settled.length) { console.log(`\n【${mode}】无已结算记录`); continue; }

    console.log(`\n%c【${mode}仓】已结算 ${settled.length} 笔`, "font-weight:bold;font-size:13px");
    let sumStored = 0, sumWant = 0;
    const rows = settled.map(p => {
      // 当前规则：到期作废/两种指派都保留 100% 权利金；买回平仓扣买回价。
      const want = p.status === "closed" && p.closePremium != null
        ? (p.premium - p.closePremium) * 100 * p.qty
        : p.premium * 100 * p.qty;
      const stored = p.realized ?? 0;
      sumStored += stored; sumWant += want;
      return {
        标的: p.sym,
        类型: p.strat === "csp" ? "CSP" : "CC",
        状态: { expired: "到期OTM", closed: "买回平仓", assigned: "被指派" }[p.status],
        行权价: p.strike,
        权利金: p.premium,
        张数: p.qty,
        买回价: p.closePremium ?? "—",
        存储值: +stored.toFixed(2),
        应为: +want.toFixed(2),
        差额: +(stored - want).toFixed(2),
        结算日: p.closedAt || p.expiry || "",
      };
    });
    console.table(rows);

    const bad = rows.filter(r => Math.abs(r.差额) > 0.005);
    console.log(`已结算权利金盈亏  存储合计 ${usd(sumStored)}  ·  重算应为 ${usd(sumWant)}  ·  差额 ${usd(sumStored - sumWant)}`);
    if (bad.length) {
      console.log(`%c↑ 其中 ${bad.length} 笔对不上：`, "color:#e66");
      bad.forEach(r => console.log(`   ${r.标的} ${r.类型} $${r.行权价} ${r.状态} — 存储 ${usd(r.存储值)}，应为 ${usd(r.应为)}，差 ${usd(r.差额)}`));
      console.log("   （这些是旧版公式settle时写死的脏值；升级到 v604 后打开期权页会自动修复）");
    } else {
      console.log("%c✓ 每一笔都对得上", "color:#3a3");
    }

    // 正股腿单独核对（v604 起从权利金里分离，不再混算）
    const stockLegs = settled.filter(p =>
      (p.strat === "csp" && p.assignedStockSold && p.assignedExitPrice != null) ||
      (p.strat === "cc"  && p.status === "assigned" && !p.linkedCspId && p.underlyingAtEntry != null));
    if (stockLegs.length) {
      const stockSum = stockLegs.reduce((s, p) => s + (p.strat === "csp"
        ? (p.assignedExitPrice - p.strike) : (p.strike - p.underlyingAtEntry)) * 100 * p.qty, 0);
      console.log(`已结算正股盈亏（另计，不含在上面的权利金里）: ${usd(stockSum)} — ${stockLegs.length} 笔`);
    }
  }
})();
