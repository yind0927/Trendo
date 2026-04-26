# Trendo v3.0 Baseline Version

**记录时间**: 2026-04-26  
**Git Commit**: `97d743d`  
**Git Tag**: `v3.0-baseline`  
**状态**: ✅ 完全功能 + 已部署到 Vercel

> **注意**: "回到原始代码版本" 指的是此版本 (v3.0-baseline)，不是 v2.0-baseline。

---

## 功能清单（在 v2.0 基础上新增）

### 新增功能

- ✅ **持仓类型选择** — New Position 弹窗支持 美股 / ETF / 加密货币 三选一
  - 类型保存到 `h.kind`，影响头像样式、筛选逻辑、概览标签
  - 概览"当前持仓数"子行显示 `N+METF 美股` 格式

- ✅ **Close Position 弹窗** — 平仓流程完整
  - 抽屉底部 SVG 图标按钮触发
  - 表格 ⊟ 按钮同样触发同一弹窗
  - 弹窗含平仓价格输入框 + 实时 PnL / R 预览
  - 确认后重算 pnlDollar / pnlPct / rMult / pnlFinal，归档到 Closed Tab
  - Closed Tab 表头显示"平仓价"，价格列显示 closePrice

- ✅ **Delete 确认弹窗** — 替换原来 browser confirm()
  - 适用于 Open / Closed 两个 Tab 的删除按钮
  - 弹窗显示具体 symbol，需二次确认

- ✅ **抽屉状态 Badge** — 与表格状态完全一致
  - Open 持仓：使用 progressBucket → 初期 / 中期 / 进行中 / 接近止盈 / 接近止损
  - Closed 持仓：显示"已平仓 · Closed"灰色 badge

- ✅ **BX Slope 数值输入** — Sector / Overall vs VOO 的 Slope 改为 contenteditable
  - 颜色根据正负自动切换（绿/红/灰）
  - 输入 Enter 或失焦即保存

- ✅ **复盘周期筛选** — 本周 / 本月 / 所有，与 CLOSED_POSITIONS 联动
  - BX Bars 分布（0-5 / 5-15 / 15+）替代原 Setup 表现
  - 每档显示笔数、胜率、平均 R

---

## 完整功能清单（含 v2.0 继承）

- ✅ Portfolio Overview — 4张总览卡 + 横向柱状图
- ✅ Holdings Table — Open / Closed 双 Tab，排序/筛选/搜索
- ✅ 5级进度状态系统（近止损/初期/中期/进行中/接近止盈）
- ✅ Open Position Modal — 新建持仓，支持三种资产类型
- ✅ Close Position Modal — 平仓价输入 + PnL 预览
- ✅ Delete Confirm Modal — 自定义确认弹窗
- ✅ Position Drawer — 5部分详情面板，含 BX 数值编辑
- ✅ LIVE TAPE — 仅显示持仓代码，hover 暂停

---

## 数据结构（新增字段）

```js
// 每笔持仓新增字段
{
  kind: "equity" | "etf" | "crypto",   // 资产类型
  // 平仓后新增
  closedAt: "2026-04-26",
  closePrice: 195.40,
  pnlFinal: 3200,
  exitReason: "manual",
}
```

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

## 技术架构

| 层 | 技术 |
|---|---|
| **HTML** | Semantic HTML5，无框架 |
| **CSS** | OKLCH 颜色系统，CSS 变量 |
| **JS** | Vanilla JS (IIFE)，无依赖 |
| **字体** | Geist Sans, JetBrains Mono |
| **部署** | Vercel (静态站点) |

### 关键全局状态

```js
let sortKey = "pnl", sortDir = -1;
let filter = "all", query = "";
let selectedSym = null;
let activeTab = "open";         // "open" | "closed"
let totalNotional = 284620;
let reviewPeriod = "week";      // "week" | "month" | "all"
let pendingCloseSym = null;
let pendingDeleteSym = null, pendingDeleteFrom = null;
```

---

## 文件结构

```
project/
├── index.html   # 主入口，含全部 CSS + Modal HTML
├── data.js      # 持仓数据 + BUCKET_STATUS + progressBucket
└── desk.js      # 渲染逻辑 + 交互
```

---

## 回到此版本

```bash
# 检出 v3.0 基线版本
git checkout v3.0-baseline

# 查看所有标签
git tag -l

# 查看提交
git log --oneline v3.0-baseline
```

---

## 已知限制

1. **无持久化** — 刷新页面，编辑内容（BX、新建仓位等）会丢失
2. **无后端** — 所有数据都是前端模拟
3. **静态数据** — 持仓是硬编码的

---

**此版本标志**: 平仓弹窗 + 删除确认弹窗 + 三类资产 + 抽屉状态 Badge + BX 数值 Slope + 复盘周期筛选 ✅
