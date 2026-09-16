// 核对「N 笔交易 · N 条记录」—— 在平台页面的浏览器控制台里整段粘贴运行。
// 只读，不改任何数据。回答三个问题：
//   1. 这两个数字各自是怎么来的；
//   2. 哪些交易被合并了（合并对不对）；
//   3. 有没有仍在用「旧式复合身份」的记录 —— 那些是唯一可能被错算的部分。
(() => {
  const arrs = {
    "现持仓": { open: window.HOLDINGS || [], closed: window.CLOSED_POSITIONS || [] },
    "模拟仓": { open: window.SIM_HOLDINGS || [], closed: window.SIM_CLOSED || [] },
  };
  const key = h => h._tid || `${h.sym}|${h.entry || ""}|${h.cost ?? ""}`;
  const legacy = h => !h._tid || /\|/.test(h._tid);   // 复合键身份 = 迁移来的旧数据

  for (const [name, { open, closed }] of Object.entries(arrs)) {
    if (!open.length && !closed.length) continue;

    const openKeys = new Set(open.map(key));
    const groups = new Map();
    closed.forEach(c => {
      const k = key(c);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    });
    const closedDone = [...groups.entries()].filter(([k]) => !openKeys.has(k));
    const trades  = open.length + closedDone.length;
    const records = open.length + closed.length;

    console.log(`\n%c══ ${name} ══`, "font-weight:bold;font-size:13px");
    console.log(`笔交易 = ${trades}  （持仓中 ${open.length} + 已全部平掉 ${closedDone.length}）`);
    console.log(`条记录 = ${records}  （持仓中 ${open.length} + 平仓事件 ${closed.length}）`);
    console.log(`差 ${records - trades} 条，全部来自分批平仓`);

    // 被合并的交易：一笔交易有多条平仓记录
    const multi = [...groups.entries()].filter(([, v]) => v.length > 1);
    if (multi.length) {
      console.log(`\n分批平仓的交易（${multi.length} 笔，共 ${multi.reduce((s, [, v]) => s + v.length, 0)} 条记录）：`);
      console.table(multi.map(([k, v]) => ({
        身份: k, 代号: v[0].sym, 入场: v[0].entry,
        出场次数: v.length,
        平仓日: v.map(x => x.closedAt).sort().join(" / "),
        仍持仓: openKeys.has(k) ? "是" : "否",
        合计盈亏: Math.round(v.reduce((s, x) => s + (x.pnlFinal ?? 0), 0)),
      })));
    }

    // 唯一可能错算的地方：两笔不同交易共用同一个旧式复合身份
    const suspects = multi.filter(([k, v]) =>
      legacy(v[0]) && new Set(v.map(x => x.closedAt)).size === v.length &&
      v.length > 2);
    console.log(`\n仍在用旧式复合身份的记录：持仓 ${open.filter(legacy).length} / ${open.length}，` +
      `已平仓 ${closed.filter(legacy).length} / ${closed.length}`);
    if (suspects.length) {
      console.log(`%c⚠ 下面这些旧记录的出场次数偏多，如果其中混进了「同一标的、同一入场日、同一成本的另一笔交易」，` +
        `它们会被错并成一笔。新开的仓位有唯一 id，不会再出现这种情况。`, "color:#d90");
      console.table(suspects.map(([k, v]) => ({ 身份: k, 出场次数: v.length })));
    } else {
      console.log("未发现可疑的合并。");
    }
  }
  console.log("\n（只读脚本，未修改任何数据）");
})();
