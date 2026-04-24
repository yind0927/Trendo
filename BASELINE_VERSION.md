# Trendo v2.0 Baseline Version

**记录时间**: 2026-04-24  
**Git Commit**: `538445e`  
**Git Tag**: `v2.0-baseline`  
**状态**: ✅ 完全功能 + 已部署到 Vercel

> **注意**: "回到原始代码版本" 指的是此版本 (v2.0-baseline)，不是 v1.0-baseline。

---

## 功能清单

### 核心功能

- ✅ **Portfolio Overview** — 4张总览卡 + 横向柱状图
  - 总资产 (Equity NAV)，点击 ✎ 可编辑金额
  - 今日盈亏（实时计算自持仓数据）
  - 胜/亏笔数
  - 横向分布柱状图（替代饼图，按最大值缩放）

- ✅ **Holdings Table** — Open / Closed 双 Tab
  - **Open Tab**: 9列 `代码 | BX Bars | 成本 | 现价 | 数量 | 盈亏 | 止损 | 目标 | 状态`
  - **Closed Tab**: 已平仓仓位，含删除按钮
  - 排序、筛选、搜索功能保留
  - 每行操作: ⊟ 平仓（归档到 Closed Tab） / ✕ 永久删除

- ✅ **5级进度状态系统**（基于止损→目标进度）
  - 近止损 · Near Stop（红色 + 脉冲）
  - 初期 · Early（橙色）
  - 中期 · Midway（琥珀色）
  - 进行中 · On Track（绿色）
  - 接近止盈 · Near Target（强调色）

- ✅ **Open Position Modal** — 新建持仓弹窗
  - 字段: Symbol, Cost, Last, Stop, Target, Size%, Sector
  - 动态计算 Qty（基于 totalNotional）
  - 提交后自动刷新表格和总览

- ✅ **Position Drawer** — 5个部分详情面板
  - §01 持仓概况
  - §02 BX Trend & 市场背景
    - Daily BX Bars: 开始(0-5) / 中间(5-15) / 延续(15+)
    - Weekly / Monthly BX: -2..+2
    - Sector / Overall vs VOO: 使用对齐网格（Score + Slope 列对齐）
  - §03 交易计划
  - §04 执行记录（时间轴）
  - §05 复盘笔记
  - 底部 **Close Position** 按钮 → 归档到 Closed Tab

- ✅ **LIVE TAPE** — 仅显示持仓代码，hover 暂停滚动

---

## 状态逻辑

```js
window.progressBucket = h => {
  const p = (h.last - h.stop) / (h.target - h.stop);
  if ((h.target - h.last) / (h.target - h.stop) < 0.05) return "Near Stop";
  if (p < 0) return "Near Stop";
  if (p < 0.30) return "Early";
  if (p < 0.60) return "Midway";
  if (p < 0.95) return "On Track";
  return "Near Target";
};
```

---

## 数据结构

```js
// data.js 顶层
window.HOLDINGS = [ /* 15笔持仓 */ ];
window.CLOSED_POSITIONS = [];   // 平仓后归档至此

// 每笔持仓字段
{
  sym, name, cost, last, stop, target, size,
  qty,           // 自动计算: Math.round((size/100 * totalNotional) / cost)
  pnlDollar,     // (last - cost) * qty
  pnl,           // pnlDollar / (cost * qty)
  bx: {
    dailyBars,   // "0-5" | "5-15" | "15+"
    weekly,      // -2..+2
    monthly,     // -2..+2
    sector: { name, color, score, slope },
    overall: { score, slope }
  }
}
```

---

## 技术架构

| 层 | 技术 |
|---|---|
| **HTML** | Semantic HTML5，无框架 |
| **CSS** | OKLCH 颜色系统，CSS 变量，`--orange` / `--orange-dim` 新增 |
| **JS** | Vanilla JS (IIFE)，无依赖 |
| **字体** | Geist Sans, JetBrains Mono |
| **部署** | Vercel (静态站点) |

### 关键全局状态 (desk.js IIFE)

```js
let sortKey = "pnl", sortDir = -1;
let filter = "all", query = "";
let selectedSym = null;
let activeTab = "open";       // "open" | "closed"
let totalNotional = 284620;   // 可通过 Equity NAV 卡编辑
```

---

## 关键函数

| 函数 | 说明 |
|---|---|
| `progressBucket(h)` | 计算持仓状态桶 |
| `getTableData()` | 根据 `activeTab` 返回 HOLDINGS 或 CLOSED_POSITIONS |
| `renderOverview()` | 渲染4卡 + 柱状图，实时计算数据 |
| `pieCard()` | 渲染横向柱状图（误称，实为bar chart） |
| `renderTable()` | 渲染持仓表格（双 tab 共用） |
| `closePosition(sym)` | 从 HOLDINGS 移至 CLOSED_POSITIONS |
| `deletePosition(sym)` | 从 HOLDINGS 永久删除 |
| `deleteClosedPosition(sym)` | 从 CLOSED_POSITIONS 永久删除 |
| `wireEquityModal()` | 事件委托（survives re-render） |
| `wireNewPositionModal()` | 新建仓位弹窗逻辑 |

---

## 关键CSS类

| 类 | 用途 |
|---|---|
| `.status.early` | 橙色状态标签 |
| `.status.near-stop` | 红色 + 脉冲动画 |
| `.alloc-bars` / `.alloc-row` | 横向柱状图 |
| `.bx-align-grid` | BX Sector/VOO 对齐网格 |
| `.close-pos-btn` | ⊟ 平仓按钮（橙色） |
| `.delete-btn` | ✕ 永久删除按钮（红色） |
| `.nav-edit-btn` | ✎ NAV编辑图标 |
| `.tape:hover .track` | hover 暂停 tape 滚动 |

---

## 文件结构

```
project/
├── index.html          # 主入口，含全部CSS + Modal HTML
├── data.js             # 持仓数据 + BUCKET_STATUS + progressBucket
└── desk.js             # 渲染逻辑 + 交互
```

---

## 回到此版本

```bash
# 检出 v2.0 基线版本
git checkout v2.0-baseline

# 查看所有标签
git tag -l

# 查看提交
git log --oneline v2.0-baseline
```

---

## 已知限制

1. **无持久化** — 刷新页面，编辑内容（BX、新建仓位等）会丢失
2. **无后端** — 所有数据都是前端模拟
3. **静态数据** — 持仓是硬编码的

---

**此版本标志**: 双Tab平仓系统 + 5级状态 + Open Position Modal + 横向柱状图 ✅
