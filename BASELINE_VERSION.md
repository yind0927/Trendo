# Trendo v5.1 Baseline Version

**记录时间**: 2026-04-27  
**Git Commit**: `ae0ac7d`  
**Git Tag**: `v5.1-baseline`  
**状态**: ✅ 完全功能 + 已部署到 Vercel

> **注意**: "回到版本" 指的是此版本 (v5.1-baseline)。

---

## 功能清单（在 v5.0 基础上新增）

### v5.1 新增

- ✅ **Simulation 模拟仓页面** — 位于 Journal 和 Analytics 之间
  - 深蓝色主题（`oklch(0.58 0.20 252)`），与真实持仓视觉区分
  - 4 张总览卡：模拟 NAV / 浮盈亏 / 已实现盈亏 / 胜率
  - 模拟本金可编辑（默认 $100,000），持久化到 localStorage
  - 完整持仓表格：同列 / 同排序 / 同筛选 / 同搜索逻辑
  - Open / Closed 双 Tab，完整抽屉（含编辑 + BX 编辑）
  - 平仓弹窗 / 删除确认弹窗 — 上下文感知（区分真实 vs 模拟）
  - New Sim Position 按钮 — 共用 New Position 弹窗，推入 SIM_HOLDINGS
  - 所有模拟数据独立持久化（`trendo_v3_sim_*` localStorage 键）

---

## 功能清单（在 v3.0 基础上新增）

### 新增功能

- ✅ **数据持久化** — localStorage 保存持仓/平仓/总资产/Watchlist，刷新不丢失

- ✅ **编辑现有持仓** — 抽屉内 last / stop / target / size 可直接 contenteditable 编辑
  - 修改后自动 recomputeHolding，实时更新 qty / PnL / rMult

- ✅ **已平仓抽屉布局** — 显示成本价、出场价、盈亏金额、盈亏%、R 倍数、持仓天数

- ✅ **今日盈亏真实计算** — 基于 prevClose 数据，sum((last-prevClose)*qty)

- ✅ **总资产与持仓联动** — portfolioValue = totalNotional + sum(unrealized PnL)

- ✅ **已平仓列表优化** — 隐藏止盈/止损列，状态显示"盈利·Win / 亏损·Loss"

- ✅ **复盘 BX Bars** — 平均收益从 R 改为实际 $ 金额显示

- ✅ **平仓按钮主题色** — btn-exit-pos 使用 accent 主题色强调

- ✅ **Journal 页面** — 持仓日志流，含 Thesis / BX 上下文 / Notes 编辑
  - 支持 全部 / 持仓中 / 已平仓 筛选
  - Notes 实时保存到 localStorage

- ✅ **Analytics 页面** — 6个核心指标 + 总资产曲线 + BX Bars 效能 + 交易分布 + 持仓风险表
  - 总资产曲线支持 日/周/月 周期选择器
  - 曲线显示实际 totalNotional + unrealized PnL 为基准

- ✅ **Watchlist 页面** — 观察标的卡片，含 BX Score / Slope / Setup / Notes
  - 快速添加到 New Position 联动
  - 添加表单支持 symbol / price / sector / setup / BX 评分

- ✅ **仓位分布真实计算** — pieCard 基于 HOLDINGS 按 sector 分组真实聚合

- ✅ **抽屉 R:R 比率** — §01 显示 (target-cost)/(cost-stop) 固定盈亏比，替代动态 R 倍数

---

## 完整功能清单

- ✅ Portfolio Overview — 4张总览卡 + 横向柱状图（真实仓位分布）
- ✅ Holdings Table — Open / Closed 双 Tab，排序/筛选/搜索
- ✅ 5级进度状态系统（近止损/初期/中期/进行中/接近止盈）
- ✅ Open Position Modal — 新建持仓，支持美股/ETF/加密货币
- ✅ Close Position Modal — 平仓价输入 + PnL 预览
- ✅ Delete Confirm Modal — 自定义确认弹窗
- ✅ Position Drawer — 持仓详情，支持编辑 + 平仓
- ✅ Journal 页 — 持仓日志流 + Notes 编辑
- ✅ Analytics 页 — 总资产曲线 + 交易分析
- ✅ Watchlist 页 — 观察标的管理
- ✅ LIVE TAPE — 仅显示持仓代码，hover 暂停
- ✅ localStorage 持久化

---

## 全局状态

```js
let sortKey = "pnl", sortDir = -1;
let filter = "all", query = "";
let selectedSym = null;
let activeTab = "open";           // "open" | "closed"
let totalNotional = 284620;
let reviewPeriod = "week";        // "week" | "month" | "all"
let pendingCloseSym = null;
let pendingDeleteSym = null, pendingDeleteFrom = null;
let currentPage = "desk";         // "desk" | "journal" | "analytics" | "watchlist"
let journalFilter = "all";
let equityPeriod = "week";        // "day" | "week" | "month"
```

---

## 数据结构

```js
// 持仓字段
{
  sym, name, cost, last, stop, target, size,
  kind: "equity" | "etf" | "crypto",
  prevClose,            // 昨收价，用于今日盈亏计算
  qty, pnlDollar, pnlPct, risk1R, rMult,  // 自动计算
  bx: { sector, dailyBars, score, bxSlope, vooSlope },
  thesis, notes,
  // 平仓后新增
  closedAt, closePrice, pnlFinal, exitReason, days,
}

// Watchlist 字段
{
  sym, name, sector, color, price, setup,
  note, bxScore, bxSlope, addedAt,
}
```

---

## 文件结构

```
project/
├── index.html   # 主入口，含全部 CSS + 4个页面视图 + Modal HTML
├── data.js      # 持仓数据 + PREV_CLOSE + WATCHLIST + BUCKET_STATUS + progressBucket
└── desk.js      # 渲染逻辑 + 交互 + 4个页面渲染函数
```

---

## 回到此版本

```bash
# 检出 v4.0 基线版本
git checkout v4.0-baseline

# 或直接用 commit hash
git checkout c272fa1

# 查看所有标签
git tag -l
```

---

## 已知限制

1. **无后端** — 所有数据都是前端模拟
2. **静态价格** — 持仓价格为硬编码，无实时行情接入
3. **曲线数据模拟** — Analytics 权益曲线历史数据为插值生成

---

**此版本标志**: 4页面布局(Desk/Journal/Analytics/Watchlist) + 总资产曲线日周月 + 持久化 + 编辑持仓 + 真实计算 ✅
