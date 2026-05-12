# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 如何使用本文件 / How This File Works

每次在此目录开启新的 Claude Code 对话，本文件会被自动读取作为上下文起点。
**开新对话前请确保本文件已更新到最新状态。**

---

## 项目概览

**Trendo** — 个人摆动交易仪表盘（Swing Trading Dashboard）。
- 中英文混合界面，面向中文用户
- Vercel 静态部署 + Serverless API，无构建步骤
- 所有源码在 `project/` 目录下
- GitHub 仓库：`https://github.com/yind0927/Trendo`

## 部署流程

```
git add <files>
git commit -m "描述"
git push -u origin main   # Vercel 自动触发部署，约30秒
```

本地预览：`cd project && vercel dev`（需安装 Vercel CLI）

版本标签：`git tag v7.2 -m "说明" && git push origin v7.2`

---

## 文件结构

```
project/
  index.html      — 所有 CSS + HTML 结构（单文件，含内联 <style>）
  desk.js         — 所有渲染逻辑和交互（单 IIFE，~3800行）
  data.js         — 全局数据数组和配置（window.* 变量）
  sw.js           — Service Worker（PWA 自动更新）
  manifest.json   — PWA manifest
  api/
    quote.js      — 实时价格（Finnhub → Yahoo Finance → Polygon 降级链）
    history.js    — 历史日线数据（Yahoo Finance）
    holdings.js   — ETF 成分股静态数据（top 20，手动维护）
    earnings.js   — 财报日期（Finnhub → Yahoo 降级）
    feargreed.js  — CNN 恐慌贪婪指数代理
    data.js       — 跨设备云同步（Upstash Redis）
```

---

## 全局数据（data.js → window.*）

```js
window.HOLDINGS          // 真实现持仓 []
window.CLOSED_POSITIONS  // 真实已平仓 []
window.SIM_HOLDINGS      // 模拟现持仓 []
window.SIM_CLOSED        // 模拟已平仓 []
window.SIM_PENDING       // 模拟挂单队列 []
window.WATCHLIST         // 自选股 []
window.ERROR_TAGS        // 错误标签（Analytics）
window.EVENTS            // 事件记录（Analytics）
```

### 持仓对象字段（Holding）

```js
{
  sym, name, kind,          // kind: "equity" | "etf" | "crypto"
  cost, last, prevClose,    // 入场价、最新价、昨收
  qty, size,                // 数量、占仓比% (cost*qty/notional*100)
  stop, target,             // 止损、止盈
  entry,                    // 入场日期 "YYYY-MM-DD"
  pnlDollar, pnlPct,        // 浮盈亏金额、浮盈亏百分比
  risk1R, rMult,            // 1R风险额、R倍数
  days,                     // 持仓天数
  earnings, holdEarn,       // 财报日期、是否持有过财报
  status,                   // "ok"|"warn"|"danger"|"target"|"trim"|"earnings"
  spark,                    // 价格历史数组（用于sparkline）
  bx: {                     // BX趋势评分
    dailyBars,              // "0-5" 格式
    weekly, monthly,        // 周线/月线评分
    sector: { name, color, score, slope, slopeDir },
    overall: { score, slope, slopeDir }
  },
  setup, thesis,            // 交易计划描述
  journalNote,              // 日志备注
}
```

### 已平仓额外字段

```js
{ ...holding, closedAt, closePrice, pnlFinal }
```

### 挂单对象字段（SIM_PENDING）

```js
{
  id,           // Date.now().toString(36) 唯一ID
  sym, name, kind, qty, stop, target,
  orderType,    // "market" | "limit"
  limitPrice,   // 限价单触发价（market时为null）
  entryDate,    // "YYYY-MM-DD"
  earnings,
  createdAt,    // ISO时间戳
  bx,           // 默认BX对象
}
```

---

## localStorage 键名

```
trendo_v4_holdings           → HOLDINGS[]
trendo_v4_closed             → CLOSED_POSITIONS[]
trendo_v4_notional           → totalNotional (默认60000)
trendo_v4_watchlist          → WATCHLIST[]
trendo_v4_sim_holdings       → SIM_HOLDINGS[]
trendo_v4_sim_closed         → SIM_CLOSED[]
trendo_v4_sim_notional       → simNotional (默认100000)
trendo_v4_sim_pending        → SIM_PENDING[]
trendo_v4_sim_close_pending  → SIM_CLOSE_PENDING[]
trendo_v4_daily_pnl          → dailyPnlLog {}
trendo_v4_savedAt            → ISO时间戳（防止旧云数据覆盖本地）
trendo_sync_key              → 云同步密钥
```

---

## 核心逻辑

### progressBucket(h) — 双轴状态判断

```js
// 亏损区（last < cost）：按接近止损程度分两档
lp = (cost - last) / (cost - stop)
lp < 0.50 → "Pullback"    // 回调 浅红色 oklch(0.76 0.13 18)
lp >= 0.50 → "Near Stop"  // 近止损 深红色 oklch(0.58 0.23 18)

// 盈利区：按目标完成度分四档
pp = (last - cost) / (target - cost)
pp < 0.25 → "Early"        // 初期 orange
pp < 0.60 → "Midway"       // 中期 warn/yellow
pp < 0.90 → "On Track"     // 进行中 accent/teal
pp >= 0.90 → "Near Target" // 近止盈 green
```

### recomputeHolding(h, notional)

每次价格更新后调用，重算 pnlDollar / pnlPct / risk1R / rMult / days。
注意：qty 由 size 反推（`qty = round(size/100 * notional / cost)`）。
`h.days` 由 `calcTradingDays(h.entry)` 实时更新（美股交易日，不含周末和10个美股假日）。

### fetchPrices()

- 每30秒执行一次
- 合并 `[...SIM_HOLDINGS, ...HOLDINGS, ...SIM_PENDING]` 的 symbol
- 调用 `/api/quote?stocks=...&crypto=...`，上限50个股票symbol
- 收到价格后：
  1. 更新已有持仓的 last/prevClose，调用 recomputeHolding
  2. **检查 SIM_PENDING**（仅美股开盘时段 `isUSMarketOpen()`）：市价单直接成交；限价单在 price ≤ limitPrice 时成交
  3. **检查 SIM_CLOSE_PENDING**（仅美股开盘时段）：市价单直接平仓；限价单在 price ≥ limitPrice 时平仓
  4. 成交的挂单从队列移除，结果写入持仓/已平仓

### isUSMarketOpen()

```js
// 周一至周五，UTC 13:30–21:00（美东 9:30–17:00）
const day = now.getUTCDay(); // 0=Sun, 6=Sat
const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
return day >= 1 && day <= 5 && mins >= 13*60+30 && mins < 21*60;
```

### calcTradingDays(entryStr, endStr?)

计算美股交易日数（排除周末和10个美股假日）。
- 从入场日**次日**开始计算第1个交易日
- 结束日：若传入 `endStr` 用平仓日；否则用最后已收盘交易日（UTC 20:00前用昨天，之后用今天，再向前跳过周末/假日）
- 用于 `recomputeHolding`（开仓实时更新）、`drawerHTML`（抽屉展示）、`closePosition`（平仓记录）

### closePosition(sym, closePrice, closeDate, closeQty)

- closeQty < pos.qty → 部分平仓：创建已平仓记录 + 减少现有qty + recompute
- closeQty >= pos.qty → 全部平仓：splice 出持仓，push 到 CLOSED_POSITIONS

---

## 页面结构（switchPage）

```
desk      → main + #desk-view（默认主页，持仓表格）
journal   → #journal-view（日志，按持仓卡片展示）
sim       → #sim-view（模拟仓）
analytics → #analytics-view（分析：权益曲线 + P&L日历）
watchlist → #watchlist-view（Preparation预备，自选股）
market    → #market-view（市场：VIX/VXN + 板块轮动 + VOO基准 + 市场状态）
```

### 页面标题格式（v7.1 统一）

所有页面使用双语标题 `.page-title`：
```html
<div class="page-title">
  <span class="page-title-en">English</span>
  <span class="page-title-zh">中文</span>
</div>
```
CSS：`.page-title-en` 20px 700粗体，`.page-title-zh` 13px pill形状边框。
- **注意**：Journal 和 Preparation 使用 `journal-topbar` 作为布局容器（含 padding），不用 `page-header`。

### 手机端 Tab Bar

```
Dashboard / Simulation / Market / Analytics / Journal(🗂️) / Preparation(⭐)
```
- Watchlist 页已重命名为 Preparation，tab emoji 为 ⭐，nav label "Preparation"

---

## 筛选器设计

每个表格有两组静态 HTML chips，通过 `style.display` 切换：

**真实持仓（#filters-open / #filters-closed）**
- Open tab: `data-filter` → all / equity / etf / crypto / risk / target
- Closed tab: `data-filter-closed` → all / profit / loss

**模拟仓（#sim-filters-open / #sim-filters-closed）**
- Open tab: `data-simfilter` → all / equity / etf / crypto / risk / target
- Closed tab: `data-simfilter-closed` → all / profit / loss

Closed tab 按 `pnlFinal ?? pnlDollar` 判断盈利/亏损。

---

## 市场状态系统（Market 页，v7.1）

### MKT_REGIMES — 优先级顺序匹配（first match wins）

```js
const MKT_REGIMES = [
  { id: "panic",   regime: "抛售",  color: "#92400e",
    condition: v => v.vix > 50,
    cond: "VIX > 50",
    meaning: "极端抛售，市场失控", posSize: "0%", stopRule: "不适用" },

  { id: "defense", regime: "防守",  color: "#ef4444",
    condition: v => v.vix >= 30 || v.fg < 20,
    cond: "VIX >= 30 或 FGI < 20",
    meaning: "高波动或极度恐惧", posSize: "<= 25%", stopRule: "极紧 (-3%)" },

  { id: "caution", regime: "谨慎",  color: "#f97316",
    condition: v => v.vix >= 20,
    cond: "VIX 20-30",
    meaning: "波动放大，方向不明", posSize: "50%", stopRule: "收紧 (-4%)" },

  { id: "hot",     regime: "偏热",  color: "#eab308",
    condition: v => v.vix < 20 && (v.rsi > 70 || v.fg > 70),
    cond: "VIX < 20 且 RSI > 70 或 FGI > 70",
    meaning: "低波动，但情绪过热", posSize: "75%", stopRule: "正常 (-6%)" },

  { id: "attack",  regime: "进攻",  color: "#22c55e",
    condition: v => v.vix < 12 && v.rsi >= 45 && v.rsi <= 70 && v.fg > 25,
    cond: "VIX < 12 且 RSI 45-70 且 FGI > 25",
    meaning: "低波动，动量健康", posSize: "100%", stopRule: "宽松 (-8%)" },

  { id: "steady",  regime: "稳健",  color: "#3b82f6",
    condition: () => true,           // 兜底
    cond: "VIX 12-20 · RSI/FGI 正常区间",
    meaning: "正常风险环境", posSize: "75%", stopRule: "正常 (-6%)" },
];
function getCurrentRegime(vix, fg, rsi) {
  return MKT_REGIMES.find(r => r.condition({ vix, fg, rsi }));
}
```

### 手册表格显示顺序（≠ 优先级顺序）

```js
const displayOrder = ["attack", "steady", "hot", "caution", "defense", "panic"];
// 进攻 → 稳健 → 偏热 → 谨慎 → 防守 → 抛售
```

### Market 页数据源

- **VIX / VXN**：`/api/history?sym=^VIX` + `/api/history?sym=^VXN`
- **F&G**：`/api/feargreed` → `{ score, rating, prevScore }`（含昨日值用于显示日变化）
- **VOO RSI**：`/api/history?sym=VOO` → `calcRSI(closes)` + `calcRSI(closes.slice(0,-1))` 得昨日RSI
- **板块ETF**：`XLK XLY XLV XLF XLB XLP XLE XLI COPX ITA` 各自 `/api/history`
- 板块得分：`calcEtfStats(closes, vooCloses)` → `{ score, scorePrev }`，昨日得分用于排名变化列

---

## 模拟仓挂单系统（v7.x 新增）

新开仓弹窗在 sim 上下文显示"订单类型"选择器：
- **手动**：原有流程，直接填入场价
- **市价单**：跳过入场价，提交后进入 SIM_PENDING，下次 fetchPrices（开盘时段）以当时市价成交
- **限价单**：填写限价，开盘时段内 price ≤ limitPrice 时自动成交

挂单队列（`#sim-pending-section`）显示在模拟仓 **sim-overview 上方**（topbar 下方），保证手机端第一屏可见。

手机端开仓入口：
- `sim-new-pos-btn`（sim topbar 内，始终可见）
- 移动端 FAB 悬浮按钮：在 sim 页时自动切换为 sim 上下文（`currentPage === "sim"`），效果与 sim-new-pos-btn 一致；其他页面仍为真实仓开仓。

非 sim 上下文的平仓挂单走 `SIM_CLOSE_PENDING[]`，同样受 `isUSMarketOpen()` 门控。

---

## CSS 设计规范

**色彩系统（oklch色空间）**
```css
--bg-0: oklch(0.14 0.012 250)    /* 页面背景 */
--up:   oklch(0.78 0.17 145)     /* 盈利绿 */
--down: oklch(0.70 0.19 25)      /* 亏损红 */
--accent: oklch(0.78 0.12 195)   /* 强调色 teal */
--warn: oklch(0.80 0.15 75)      /* 警告黄 */
--orange: oklch(0.75 0.17 50)    /* 橙色 Early状态 */
--ok: oklch(0.78 0.17 145)       /* 同 --up */
```

**状态颜色**
- Pullback（浅红）: `oklch(0.76 0.13 18)`
- Near Stop（深红）: `oklch(0.58 0.23 18)`

**密度模式**：`body[data-density="compact|medium"]`（默认宽松）
**字体模式**：`body[data-font="mono"]`
**永远用 CSS 变量，不用硬编码颜色值**

---

## API 环境变量

```
FINNHUB_API_KEY      — 实时行情（主要）
POLYGON_API_KEY      — 加密货币行情 + 股票备用
KV_REST_API_URL      — Upstash Redis URL（跨设备同步）
KV_REST_API_TOKEN    — Upstash Redis Token
```

---

## ETF 成分股（api/holdings.js）

静态数据，每个ETF前20大持仓，手动维护。数据来源：StockAnalysis/iShares/Global X/VanEck。
最近更新：2026年5月。覆盖：VOO, XLK, XLY, XLV, XLF, XLB, XLP, XLE, XLI, COPX, ITA 等。
更新时需同步修改文件顶部的数据日期注释。

---

## 版本历史摘要

| 版本 | 主要内容 |
|------|---------|
| v1.0 | 初始版本，9栏持仓表格，BX Trend |
| v2.0 | 盈亏柱状图，BX对齐，orange Early状态 |
| v3.0 | 平仓/删除弹窗，持仓类型(equity/etf/crypto)，drawer状态徽章 |
| v4.0 | Analytics/Watchlist/Journal页，真实P&L，权益曲线，本地持久化 |
| v4.1 | 权益曲线网格线、悬停十字准星+工具提示 |
| v5.1 | 模拟仓（Simulation）页，完整纸上交易沙盒 |
| v5.2 | 正式上线，Polygon/Finnhub实时价格，实时行情滚动条 |
| v6.0 | Upstash Redis 跨设备同步，修复多次数据丢失 |
| v6.x | 移动端响应布局，PWA，FAB按钮，P&L日历，BX斜率，Market页(VIX/VXN/板块轮动) |
| v7.0 | progressBucket双轴重设计，ETF成分更新，VOO基准条，筛选重设计(ETF/近止损/近止盈)，部分平仓，已平仓盈亏筛选 |
| v7.1 | 模拟仓挂单系统（市价单/限价单），F&G/RSI昨日变化，板块排名日变化，统一双语页面标题(20px)，Watchlist→Preparation，6态市场状态系统(优先级匹配)，抛售/偏热更名，手册触发条件列 |
| v7.2 | 移除顶部时钟模块，修复响应式根因(body min-width)，新增769–1290px紧凑断点，导航选中改为下划线设计，搜索框简化，持仓数动态关联，市价单/限价单开盘时段门控(isUSMarketOpen)，美股交易日计算(calcTradingDays+usMarketHolidays)，持仓天数改为实时交易日，抽屉天数动态渲染，修复密码页闪屏，手机端挂单队列移至overview上方，FAB按当前页面切换开仓上下文 |

---

## 常见操作模式

**添加功能后必须调用：**
- `renderTable()` + `renderOverview()` — 真实仓
- `renderSimTable()` + `renderSimOverview()` — 模拟仓
- `saveToStorage()` — 持久化

**修改持仓价格后：**
`recomputeHolding(h, notional)` → `saveToStorage()` → render

**新增 localStorage 键：**
同步更新 `saveLocalOnly()` + `loadFromStorage()` + `applyCloudData()` + `syncPush()`（4处）

**修改 HTML 筛选器：**
同步更新 desk.js 里的 filter 逻辑和 counter setCount 调用

**修改 MKT_REGIMES：**
- 数组顺序 = 优先级顺序（panic 最高，steady 兜底）
- 显示顺序由 `mkPlaybookHTML` 里的 `displayOrder` 数组单独控制

**包含 Unicode 表情的字符串替换：**
Edit 工具对 emoji 字符串匹配可能失败，用 Python 脚本替代：
```python
import sys
with open('project/desk.js', encoding='utf-8') as f: c = f.read()
c = c.replace('旧字符串', '新字符串')
with open('project/desk.js', 'w', encoding='utf-8') as f: f.write(c)
print("Done")
```
