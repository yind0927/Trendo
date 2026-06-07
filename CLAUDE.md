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

版本标签：`git tag v7.5 -m "说明" && git push origin v7.5`

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
    quote.js           — 实时价格（Finnhub → Yahoo Finance → Polygon 降级链）
    history.js         — 历史日线数据（Yahoo Finance）
    holdings.js        — ETF 成分股静态数据（top 20，手动维护）
    earnings.js        — 财报日期（Finnhub → Yahoo 降级）
    feargreed.js       — CNN 恐慌贪婪指数代理
    data.js            — 跨设备云同步（Upstash Redis）
    market-summary.js  — 市场日报 AI 简报（Claude Sonnet 4.6，含新闻+市场数据）
    holdings-brief.js  — 持仓分析 AI 简报（Claude Sonnet 4.6，含个股新闻+市场环境）
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
trendo_brief_v1_market       → 市场简报缓存 { summary, headlines, updatedAt, _date }
trendo_brief_v1_holdings     → 持仓分析缓存 { summary, updatedAt, hasNews, _date }
trendo_brief_collapsed       → 市场简报收起状态 "0"|"1"
trendo_holdings_brief_collapsed → 持仓分析收起状态 "0"|"1"
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

### getLastTradingDayStr()

返回最近已收盘美股交易日的 `"YYYY-MM-DD"` 字符串。
- UTC 20:00 前（美东4pm前）：今天未收盘，取昨天
- 向前跳过周末和节假日
- **用于今日盈亏基准判断**：`h.entry >= getLastTradingDayStr()` 时用入场价（cost）作基准，否则用 prevClose

### groupTrades(closedArr)

将 `CLOSED_POSITIONS` 按 `sym + entry + cost` 分组，合并同一交易的多次减仓记录为一笔交易。
```js
// 返回数组，每项包含：
// pnlFinal: 所有减仓 pnlFinal 之和
// closedAt: 最晚的 closedAt
// qty:      所有减仓 qty 之和
// rMult:    totalPnl / (cost - stop) / totalQty 重新计算
// days:     calcTradingDays(entry, lastClosedAt)
```
**用于**：`renderBottom()` 胜率、Journal 统计栏、月份分组统计、`renderAnalytics()` 所有指标、`exitQualityHTML()` 出场效率。
P&L 日历仍使用原始 `CLOSED_POSITIONS`（每次平仓事件显示在对应日期）。

### closePosition(sym, closePrice, closeDate, closeQty)

- closeQty < pos.qty → 部分平仓：创建已平仓记录 + 减少现有qty + recompute
- closeQty >= pos.qty → 全部平仓：splice 出持仓，push 到 CLOSED_POSITIONS

---

## 页面结构（switchPage）

```
desk      → main + #desk-view（默认主页，持仓表格）
journal   → #journal-view（日志，按持仓卡片展示）
sim       → #sim-view（模拟仓）
analytics → #analytics-view（分析：权益曲线(周/月/年，真实数据) + BX Bars效能 + P&L日历）
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

## 三轴市场模型（Market 页，v7.8）

取代旧版"单一 VIX 瀑布"作为主推荐。核心理念：**VIX 管"开多少(仓位)"，趋势管"哪个方向"，情绪极端(FGI/RSI)管"何时止盈/反向"**，三轴独立评分后合并，避免单指标在周期边界给出自相矛盾信号。

```js
// 轴A 方向（趋势）getDirectionAxis(price, ma50, ma200) → 决定 eligible（做多资格）
//   顺风: price > 50MA > 200MA          eligible=true
//   逆风: 50/200死叉 或 price < 200MA    eligible=false（无论 VIX 多低都禁新多仓）
//   中性: 均线间回调                      eligible=true
// 轴B 风险容量（VIX）getRiskAxis(vix) → posMax + 止损宽度（只管"多少"）
//   <15→100% · 15-20→75% · 20-30→50% · ≥30→25%
// 轴C 情绪（FGI+RSI）getSentimentAxis(fg, rsi, vixTrend) → tilt 倾斜
//   过热 FGI>75||RSI>72 → trim（减仓）   偏热 FGI≥60||RSI≥65 → hold
//   偏冷 FGI<35||RSI<45 → scale（小幅加） 极端恐惧 FGI<25&&RSI<38 → accumulate（分批进，等VIX回落）
// combineAxes(dir,risk,sent) → { headline, color, detail } 综合建议
//   方向逆风=闸门（禁新仓）> 情绪过热=止盈倾斜 > 加仓倾斜 > 正常进攻
```

- `buildAxes({price,ma50,ma200,vix,fg,rsi,vixTrend})` 在 `fetchMarketData` 中调用，结果传入 `renderMarket(data.axes)`。
- `mkAxesHTML(axes)` 渲染：综合建议横幅 + 三轴卡片（方向/风险容量/情绪）。
- VOO 价格/50MA/200MA/RSI 来自 `/api/history?symbols=VOO...&from=`（v7.8 起 `from` 改为 **400 天**以满足 200MA；v7.9 起方向轴与 RSI 基准统一为 VOO）。
- 旧 `MKT_REGIMES` 6 态保留为 `<details>` 折叠的"旧版参考手册"（`mkPlaybookHTML`），`mkStrategyHTML` 已删除。
- AI 简报：`_lastMktCtx.regime` 改为综合建议 headline，并新增 `direction/posMax/sentiment` 传入 `market-summary.js`（URL params `dir/posmax/senti`），prompt 增加三轴框架解释。

## 市场状态系统（Market 页，v7.1，旧版参考）

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
    condition: v => v.vix >= 20 && (v.fg < 40 || v.vixTrend === "up"),
    cond: "VIX ≥ 20 且 (FGI < 40 或 VIX 均线上升)",
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
- **大盘指数**：`SPY QQQ DIA IWM` 通过 `/api/quote` 实时拉取，计算日涨跌幅传入市场简报

---

## AI 简报系统（v7.6）

### 两个简报模块

| 模块 | 位置 | API 文件 | 触发 |
|---|---|---|---|
| 市场日报 | Market页顶部 `#market-brief` | `api/market-summary.js` | 手动点击 |
| 持仓分析 | Dashboard持仓列表与动态之间 `#holdings-brief` | `api/holdings-brief.js` | 手动点击 |

### 缓存架构（两层）

```
localStorage（浏览器端）
  键：trendo_brief_v1_market / trendo_brief_v1_holdings
  有效期：当天（_date字段与今日本地日期对比，跨日自动失效）
  作用：页面加载零延迟展示，无API调用

Redis（服务端，Upstash）
  键：trendo:market_brief:YYYY-MM-DD:SLOT（2小时slot）
      trendo:holdings_brief:YYYY-MM-DD:SLOT:sortedSyms（2小时slot+持仓指纹）
  TTL：7200秒
  作用：用户点击时去重，同一slot内命中不调Claude
```

### 触发逻辑

```
页面加载 → initMarketBriefCard() / initHoldingsBriefCard()
  ├─ localStorage有当日缓存 → 直接渲染，不调API
  └─ 无缓存 → 显示"生成简报/生成分析"按钮

用户点击生成/↻
  → fetchMarketBrief(force) / fetchHoldingsBrief(force)
    ├─ force=false → API先查Redis → 命中返回（不调Claude）
    │                             → 未命中调Claude → 存Redis
    └─ force=true  → 跳过Redis → 直接调Claude → 存Redis
  → 结果存localStorage（带_date）→ 渲染
```

### 数据传递（desk.js）

```js
let _lastMktCtx = null; // 全局，fetchMarketData()时赋值

// fetchMarketData完成后：
const mktCtx = { vix, fg, rsi, regime, vixTrend, indices };
_lastMktCtx = mktCtx;
fetchSectorData().then(sectors => {
  _lastMktCtx = { ...mktCtx, sectors };
  initMarketBriefCard(_lastMktCtx);
});

// fetchHoldingsBrief()里读取_lastMktCtx，编码为URL params传入API
// 持仓编码格式：sym:pnlPct:rMult:days:status:earningsDate:trimInfo（7字段）
// trimInfo 格式："{pct}p{avgR}R"，如 "33p+1.5R" = 已减仓33%@平均+1.5R
// 无减仓时 trimInfo 为空字符串
```

### API 设计要点

**market-summary.js**
- 新闻源：Finnhub（主）→ Yahoo RSS（降级，周末/节假日时自动切换）
- 市场数据：idx（SPY/QQQ/DIA/IWM日涨跌）+ vix + fg + rsi + regime + sect
- 输出格式：【今日总结】【驱动因素】【板块与资金】【风险与机会】，≤300字

**holdings-brief.js**
- 个股新闻：Finnhub `company-news` 并行拉取每只持仓近4天（Promise.allSettled）
- 市场环境：接收idx/vix/fg/regime/sect URL params
- 输出格式：【持仓概览】【重点关注】【今日操作建议】，≤180字
- 分析重点：持仓时间效率、P&L vs 市场匹配度、个股催化剂、财报风险

### 共享渲染函数（desk.js）

```js
_briefAgeTag(updatedAt)          // 生成"X分钟前"标签HTML
_saveBrief(key, data)            // 存localStorage（带_date）
_loadBrief(key)                  // 读localStorage（跨日返回null）
_briefSummaryHTML(summary)       // 将【标题】转为带class的div
_renderMarketBrief(el, data, mktCtx)   // 渲染市场简报卡片
_renderHoldingsBrief(el, data)         // 渲染持仓分析卡片
initMarketBriefCard(mktCtx)      // 初始化：读缓存或显示生成按钮
initHoldingsBriefCard()          // 初始化：读缓存或显示生成按钮
```

### CSS 组件

```css
.brief-card        — 卡片容器（border-left: 3px solid var(--accent)）
.brief-badge       — AI徽章（var(--accent)背景）
.brief-gen-btn     — 生成按钮（outlined teal，悬停填充）
.brief-toggle      — 收起/展开箭头（15px，旋转动画）
.brief-refresh     — ↻ 刷新按钮（spinning动画类）
.brief-section-title — 【标题】样式（accent色，mono字体）
.mkt-module-sep    — 模块间分隔线（Market页）
```

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

**双语区块标题（`.sim-section-label`）**
```html
<div class="sim-section-label">
  <span class="ssl-zh">中文标题</span>
  <span class="ssl-en">English</span>
  <span class="ssl-rule"></span>          <!-- 分隔线，flex:1 -->
  <span class="ssl-meta">附加信息</span>  <!-- 可选 -->
</div>
```
Dashboard 和 Sim 页均使用此组件，替代旧版 §01/§02 样式标题。

---

## API 环境变量

```
ANTHROPIC_API_KEY    — Claude API（市场简报 + 持仓分析，大小写严格）
FINNHUB_API_KEY      — 实时行情（主要）+ 个股新闻
POLYGON_API_KEY      — 加密货币行情 + 股票备用
KV_REST_API_URL      — Upstash Redis URL（跨设备同步 + AI简报服务端缓存）
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
| v7.2 | 移除顶部时钟模块，修复响应式根因(body min-width)，新增769–1290px紧凑断点，导航选中改为下划线设计，搜索框简化，持仓数动态关联，市价单/限价单开盘时段门控(isUSMarketOpen)，美股交易日计算(calcTradingDays+usMarketHolidays)，持仓天数改为实时交易日，抽屉天数动态渲染，修复密码页闪屏，手机端挂单队列移至overview上方，FAB按当前页面切换开仓上下文，`.sim-section-label`双语区块标题(ssl-zh/ssl-en/ssl-rule/ssl-meta)，Sim页模拟分析/模拟仓持仓区块标题，Dashboard页持仓总结/持仓列表区块标题，Analytics权益曲线改用真实数据(histPnlLog+dailyPnlLog)，周/月/年切换，修复轴标签拉伸(SVG text→HTML)，修复悬浮tooltip日P&L误差，BX Bars与P&L日历同行排列，Dashboard页标题更新(持仓/持仓总结/持仓列表) |
| v7.5 | 密码页重设计（平台logo内联+玻璃质感输入框+Geist 800字标+页面入场动画），浮盈亏列移至止盈与状态之间，BX表单Score/Slope支持两位小数，页面切换淡入+上移动画(page-enter) |
| v7.6 | AI简报系统：Market页市场日报（Claude Sonnet 4.6，结构化4段式）+ Dashboard页持仓分析（含个股新闻+市场环境）。手动触发设计：页面加载读localStorage，跨日自动重置为生成按钮，Redis 2小时服务端缓存去重，↻强制重生成。徽章/边框颜色统一为accent teal。`_lastMktCtx`全局传递市场上下文。 |
| v7.7 | **多处 bug 修复与分析优化**：分批平仓记录合并（`groupTrades()`，按sym+entry+cost分组），胜率/Analytics指标/Journal统计/出场效率均按交易笔数而非记录数计算；exitQualityHTML按交易组计算峰值和实际盈亏，多批次显示"N次出场"标签。今日盈亏基准修复（`getLastTradingDayStr()`），周末/节假日后不再把开仓前涨跌计入。Auth token改为localStorage（后台切换不再要求重新输密码）。AI持仓简报增加第7字段trimInfo（已减仓比例和平均出场R），让AI分析考虑部分平仓。Market RSI数据源改为SPY。模拟仓NAV含已实现盈亏。已平仓抽屉展示减仓记录+支持出场价内联编辑（wireClosedDrawerEdits）。播报条速度60s→50s。 |
| v7.8 | **三轴市场模型**（取代单一VIX瀑布作主推荐）：轴A方向(SPY vs 50/200MA，决定做多资格)×轴B风险容量(VIX→仓位上限/止损)×轴C情绪(FGI/RSI→减仓/加仓倾斜)，`buildAxes/combineAxes/mkAxesHTML`，方向逆风为闸门、情绪过热触发止盈倾斜。SPY history `from` 延长至400天供200MA。旧6态手册折叠为`<details>`参考，删除`mkStrategyHTML`。AI简报传入dir/posmax/senti并在prompt加入三轴框架。**今日盈亏修复**：卡片%分母改为持仓昨收市值(非totalNotional)；`todayPnlOf(h)`统一卡片与逐股分解(`(last-prevClose)*qty`直算)；移除prevClose休市冻结(与last脱钩导致跨天涨跌被当单日，-23%虚高)。 |

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
