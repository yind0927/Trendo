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

### ⚠️ 缓存破坏（每次改 desk.js / data.js 必做）

`index.html` 用 `?v=N` 查询串引用脚本：`<script src="desk.js?v=21">`。浏览器 HTTP 缓存和
Vercel CDN 边缘缓存按 URL 缓存，URL 不变就会一直返回旧 `desk.js`（即使逻辑已修复，用户清缓存
也未必命中这些层 → 旧代码继续跑，表现为 last 更新但 prevClose 卡在旧值）。**改动 JS 后，三处版本号
必须同步 +1**：
1. `index.html` 两个 `<script src="...?v=N">`
2. `sw.js` 顶部 `const CACHE = "trendo-vN"`
3. `sw.js` 的 `PRECACHE` 数组里 `/desk.js?v=N`、`/data.js?v=N`

`vercel.json` 已给 `/`、`/index.html`、`/sw.js` 设 `must-revalidate`，保证新版本号能被拉到。

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
    quote.js           — 实时价格（每symbol并发 Finnhub实时last + Yahoo chart可靠prevClose，Yahoo query1→query2 失败重试 → Polygon日线序列兜底（非/prev：收盘后/prev返回当天bar会压平涨跌）；**prevClose来源链：Yahoo indicators.quote[0].close原始（未调整）收盘序列 + 开盘时段感知选bar——开盘中且今日bar未生成→bars[-1]（昨收），其余所有情况（今日bar已存在、或休市=盘前/周末）→bars[-2]，因为休市时last本身就是最近完成交易日的收盘价，涨跌必须参照其前一交易日（券商盘前/周末显示上一交易日涨跌）；Finnhub d.pc和Yahoo meta.previousClose均不用于prevClose：d.pc可能滞后数日；meta.previousClose被公司行动（分拆/特别股息）调整偏离券商值（INTC +8.82%虚高案例）**）
    history.js         — 历史日线数据（Yahoo Finance）
    holdings.js        — ETF 成分股静态数据（top 20，手动维护）
    earnings.js        — 财报日期（Finnhub → Yahoo 降级）
    feargreed.js       — CNN 恐慌贪婪指数代理；`?gex=1` 附带 SPX 做市商 Gamma（GEX）：CBOE 免费延迟期权链 `_SPX.json`（含SPXW 0DTE），0-30DTE ±15%行权价，γ×OI×100×spot²×0.01 求和（call正/put负）→ Net GEX、波段口径swing(剔0DTE)、Gamma Flip（累计净γ过零插值）、Call/Put Wall（最大γ行权价）、DTE三桶(0/1-7/8-30)、距离%、仓位修正因子（距Flip: 深正×1.15/正×1.0/临界×0.75/负×0.6/深负×0.4）；Redis 1h缓存(gex_v4) + 每日快照历史120天(gex_hist_v1)→较昨日Δ与近N天分位；`?gex=debug` 诊断。Yahoo期权(crumb被429)和Polygon期权(403无权限)均不可用，CBOE CDN是免费源唯一可行路径
    data.js            — 跨设备云同步（Upstash Redis）；POST 时按blob是否含挂单维护 `trendo:order_keys` 注册表
    order-check.js     — 模拟仓挂单后台成交 worker（Vercel Cron 开盘时段每分钟触发；扫描 `trendo:order_keys` → 读用户blob → 镜像客户端成交逻辑（市价/限价、部分/全部平仓、CC结算、calcTradingDays）→ 写回blob并更新savedAt；客户端 visibilitychange 时 pull-if-newer 接收成交结果；冲突模型=savedAt last-write-wins，页面活跃时客户端自己成交并覆盖，结果等价）
    market-summary.js  — 市场日报 AI 简报（Claude Sonnet 4.6，含新闻+市场数据）
    holdings-brief.js  — 持仓分析 AI 简报（Claude Sonnet 4.6，含个股新闻+市场环境）
    drawdown-context.js — 历史回撤情景分析（VOO/QQQ 近15年单日大跌后续走势统计 + Claude 解读）
```

---

## 全局数据（data.js → window.*）

```js
window.HOLDINGS          // 真实现持仓 []
window.CLOSED_POSITIONS  // 真实已平仓 []
window.SIM_HOLDINGS      // 模拟现持仓 []
window.SIM_CLOSED        // 模拟已平仓 []
window.SIM_PENDING       // 模拟挂单队列 []
window.SIM_OPTIONS       // 期权滚动策略仓位 []（CSP/CC 卖方，手动记录模型，v256）
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
  cc,                       // Covered Call 权利金记录 [{ id, date, total(总额) }]
                            // ccNet(h)=累计权利金，ccAdjCost(h)=cost−ccNet/qty（h.cost 不变）
                            // 浮盈亏 pnlDollar/pnlPct 含权利金；全平时结入 pnlFinal；
                            // 部分平仓记录不带 cc（留在剩余仓位上）；R倍数/止损仍基于原始成本
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
trendo_v4_sim_options        → SIM_OPTIONS[]（期权滚动策略）
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
//   偏冷 FGI<40||RSI<45 → scale（小幅加） 极端恐惧 FGI<25&&RSI<38 → accumulate（分批进，等VIX回落）
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

### 后台成交（api/order-check.js）

挂单不再依赖页面打开：Vercel Cron 在开盘时段（UTC 13-20 时每分钟，函数内再做 13:30 门控）触发
`/api/order-check`，扫描 Redis 注册表 `trendo:order_keys`（由 `api/data.js` POST 时维护：blob 含挂单
即 SADD，否则 SREM），对每个 key 读取云端 blob、拉实时价（Finnhub→Yahoo 兜底，crypto 走 Polygon），
按客户端相同条件成交后写回 blob（savedAt 更新）。客户端在 `visibilitychange` 恢复可见时执行
pull-if-newer，接收后台成交结果；页面活跃时客户端 30 秒周期自己成交并推送覆盖，两边结果等价、
数组整体替换不会重复开仓。**注意：Vercel Hobby 计划 cron 仅支持每日级别调度，每分钟 cron 需
Pro 计划；Hobby 可改用外部定时器（如 cron-job.org）每分钟 GET /api/order-check 达到同样效果。**

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

## BX 评级 & RS 开仓评分系统（v200+）

### 入场评分总流程

```
用户填写 BX 三周期 → calcBXGrade → bxGrade (A+/A…Exit)
用户点击"计算RS" → computeEntryRS → calcRSScore → rsResult
rsAdjustGrade(bxGrade, rsResult) → finalGrade
renderEntryScorecard(bxGrade, rsResult) → 展示在开仓弹窗/抽屉实时评级
开仓保存时写入 h.bx: { entryBxGrade, entryFinalGrade, entryRsResult, entrySectorEtf }
```

### BX 三周期评分映射 `calcBXGrade(cur, wk, mo)`

BX 输入值：`-1`=看跌 / `0`=中性 / `1`=偏多 / `2`=强势

| Daily (cur) | Weekly (wk) | Monthly (mo) | 等级 |
|-------------|-------------|--------------|------|
| ≤−1（任意）  | 任意         | 任意          | Exit |
| 2           | 2           | ≥1           | A+   |
| 2           | 1           | 2            | A    |
| 2           | 1           | 1            | A−   |
| 2           | ≥1          | 0            | B+   |
| 2           | 0           | ≥1           | B    |
| 2           | ≤−1 或 mo≤−1 | —            | C    |
| 1           | 2           | ≥1           | B+   |
| 1           | 2           | 0            | B    |
| 1           | 1           | 2            | B    |
| 1           | 1           | 1            | B−   |
| 1           | 1 或 0      | 0 或 ≥1      | C+   |
| 0           | ≥1          | ≥−1          | B−   |
| 0           | 0           | ≥−1          | C+   |
| 其余                                       | C    |

### BX_GRADE_META — 等级元数据

```js
const BX_GRADE_META = {
  "A+":  { action: "积极开仓", pos: "满仓",   desc: "三时框架全面看涨" },
  "A":   { action: "积极开仓", pos: "满仓",   desc: "周月线强势对齐" },
  "A-":  { action: "可以开仓", pos: "75%",   desc: "日线领先，周月支持" },
  "B+":  { action: "可以开仓", pos: "75%",   desc: "日线领先，中线中性" },
  "B":   { action: "普通开仓", pos: "50%",   desc: "日线普通，周月线中等" },
  "B-":  { action: "普通开仓", pos: "50%",   desc: "三时框均比较普通" },
  "C+":  { action: "小仓进入", pos: "25%",   desc: "多时框整体较差" },
  "C":   { action: "暂缓",     pos: "不进场", desc: "多时框架不对齐" },
  "Hold":{ action: "持有现有", pos: "—",      desc: "日线→Bull，等待日线确认" },
  "Exit":{ action: "回避",     pos: "不进场", desc: "看跌信号，不宜开仓" },
};
```

等级排序（`GRADE_LADDER`）：`Exit < C < C+ < B- < B < B+ < A- < A < A+`

### RS 评分 `calcRSScore(rsData)` — 4 个维度（v208 后）

所有维度基于最近 **20 个交易日**（60 日日历区间获取数据保证足够 bar 数）。

| 维度 | 满分 | 评分规则 |
|------|------|---------|
| vs VOO（相对大盘） | 5 | >8pp=5 · >5pp=4 · >2pp=3 · >0pp=2 · >−3pp=1 · ≤−3pp=0 |
| vs 板块ETF | 5 | >5pp=5 · >3pp=4 · >1pp=3 · >0pp=2 · >−2pp=1 · ≤−2pp=0 |
| 板块ETF vs VOO | 5 | >5pp=5 · >2pp=4 · >0pp=3 · >−2pp=2 · >−5pp=1 · ≤−5pp=0 |
| 涨跌量比（20日量比） | 5 | >65%=5 · >55%=4 · ≥45%=3 · ≥35%=1 · <35%=0 |

- **有板块ETF时**：max = 20（4 维度全参与）
- **无板块ETF时**：max = 10（仅 vs VOO + 量比两维）
- 如无量比数据（API失败）：回退到旧 max 15 / 5

涨跌量比计算：`calcVolUpDownRatio(closes, volumes, 20)` — 涨日成交量 / (涨日+跌日成交量) × 100%，量比标签：>65% 积累 / >55% 偏多 / ≥45% 中性 / ≥35% 偏空 / <35% 派发。

### RS 调整等级 `rsAdjustGrade(grade, rsResult)`

```js
const norm = rsResult.score / rsResult.max * 10;  // 归一化到 0-10 分
const isDistrib = rsResult.volScore === 0;         // 派发（涨跌量比 <35%）；null=无数据不惩罚

// norm >= 7  + 非派发 → +1 级（强RS升档）
// norm >= 7  + 派发   → 不变（派发阻止升级）
// norm <= 0           → −2 级（极弱RS双降）
// 派发 + norm < 4     → −2 级（派发叠加弱RS，复合双降）
// 派发 + norm 4–6     → −1 级（派发叠加一般RS，触发降级）
// norm < 4  无派发    → −1 级（弱RS降档）
// 4 ≤ norm < 7 无派发 → 不变
// Hold / Exit 等级不受RS影响
```

### `computeEntryRS(sym, sectorEtf)` — 数据获取

- 调用 `/api/history?symbols=${sym},${etf},VOO&from=60daysAgo`
- API 返回 `{ results: { [sym]: { [date]: close } }, volumeResults: { [sym]: { [date]: vol } } }`
- 从 `volumeResults[sym]` 提取与 closes 对齐的成交量数组
- 返回 `{ stockRet, vooRet, sectRet, volRatio }`

### 数据持久化字段（写入 `h.bx`）

```js
h.bx.entryBxGrade    // 纯BX等级（未经RS调整）
h.bx.entryFinalGrade // 最终等级（RS调整后）
h.bx.entryRsResult   // 完整RS对象 { score, max, stockRet, vooRet, sectRet, vsVOO, vooScore,
                     //   vsSect, sectScore, sectVsVOO, sectBonusScore, hasSect,
                     //   volRatio, volScore }
h.bx.entrySectorEtf  // 板块ETF代码（如 "XLK"）
```

### 抽屉 BX 区块（`bxSectionHTML`）

两个 Tab：
- **入场评级**（`data-dsc-panel="entry"`）— 静态展示开仓时记录的 `entryFinalGrade` + RS 分解表
- **实时评级**（`data-dsc-panel="live"`）— 与开仓弹窗相同的实时 BX 表单 + "计算RS" 按钮

持仓列表中的等级 chip（`hc-grade-chip`）展示 `h.bx.entryFinalGrade`，无值时显示 `—`。

### 相关函数（均为顶层作用域，`desk.js`）

| 函数 | 作用 |
|------|------|
| `calcBXGrade(cur, wk, mo)` | 三周期 BX → 等级字符串 |
| `calcRSScore(rsData)` | RS 数据 → `{ score, max, …各维度 }` |
| `calcVolUpDownRatio(closes, volumes, days)` | 涨日量 / 总量 % |
| `rsAdjustGrade(grade, rsResult)` | 等级 + RS → 最终等级 |
| `computeEntryRS(sym, sectorEtf)` | 异步拉取历史价格+量，返回 RS 原始数据 |
| `renderEntryScorecard(bxGrade, rsResult, loading, el)` | 渲染开仓弹窗评分卡 |
| `bxSectionHTML(h)` | 抽屉 BX 区块 HTML（含入场/实时双 Tab） |

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
| v8.0 | **Covered Call 权利金记录**：抽屉"交易计划"区新增权利金记录块（+记录权利金弹窗：每股权利金/股数/日期，可删除），`ccNet/ccAdjCost` 计算调整后成本，入场成本显示 `$原始 → $调整后`，表格成本列和卡片入场价带 `cc` 标记显示调整后成本（title 显示原始成本+累计权利金）。h.cost 保持纯净，R/止损不受影响。**抽屉滑动切换**：手机端在抽屉头部左右滑动切换持仓卡片（50px阈值，横向位移需大于纵向），头部显示 `X / Y` 位置计数器，真实仓/模拟仓、列表/卡片模式均支持。 |
| v7.9 | 综合建议6档加emoji(❌⚠️🔄⏫⏸️✅)。VIX风险轴止损放宽(充裕−10%/正常−8%/收缩·极小−5%)。市场模型详情三表用`table-layout:fixed`列对齐。**市场模型基准 SPY→VOO**(方向轴价格/50MA/200MA + RSI 统一为VOO)。**历史回撤参考**(`api/drawdown-context.js`)：VOO/QQQ近15年单日大跌分4档(普通−2~−3%/显著−3~−5%/急跌−5~−8%/崩跌≤−8%)，统计后续5/10/20/60交易日中位涨跌+胜率+p10尾部；当日跌幅自动匹配档位高亮，叠加Claude解读(历史规律/本次异同/操作建议)，含市场上下文(vix/dir/senti)。Redis按日缓存(统计`drawdown_stats`+解读`drawdown_ai`)，localStorage跨日重置。Market页`#drawdown-card`，手动触发，收起/展开。 |
| v8.2 | **今日盈亏彻底修复**：`prevClose` 不再持久化到 localStorage/Redis（`noMarket()` 在保存前剥离），页面加载和云同步时始终从 null 开始，由当次 API 调用填充，消除了跨会话累积的"幽灵旧收盘"问题。`api/quote.js` prevClose 来源改为 Yahoo `indicators.quote[0].close` 原始未调整序列（非 `meta.previousClose`，后者被 Yahoo 针对分拆/特别股息调整，ex-date 当天数值偏低导致虚高涨幅），用 `timestamp` 判断今日 bar 是否已收盘来选正确的 bar（收盘后取倒数第2，开盘前取倒数第1），开盘/非开盘均准确。移除 Finnhub d.pc（长期滞后）。缓存破坏：`desk.js?v=21`+`vercel.json` `must-revalidate` 保证新代码到达客户端。 |
| v200 | **BX/RS 开仓评级系统**：抽屉 BX 区块重设计为"入场评级/实时评级"双 Tab；`calcBXGrade` + `BX_GRADE_META`（10级，A+→Exit，建议仓位/操作描述）；`calcRSScore`（3维度×0-5分，最高15分）；`rsAdjustGrade`（RS归一化后±1~2级）；`renderEntryScorecard` 渲染开仓弹窗评分卡；所有函数从 `wireNewPositionModal` 闭包提升至顶层作用域，解决 `wireBX` 调用 ReferenceError 根因。 |
| v201 | 板块区块移至双 Tab 下方；Tab 重命名为"入场评级/实时评级"；持仓表格"BX Bars"列更名为"评级"（`data.js` COLS 同步更新）；旧持仓无评级时展示 `—`。 |
| v202 | 更新 BX_GRADE_META 描述语：B="日线普通，周月线中等"/B-="三时框均比较普通"/C+="多时框整体较差"；建议仓位"跳过"→"不进场"。 |
| v203 | 卡片模式无评级时展示 `—` chip（替换原 BX Bars 信息）。 |
| v205 | 卡片模式评级 chip 内联在盈亏行：彩色边框+浅色背景 pill，RS 分数 `score/max` 显示在旁边；CSS 新增 `.hc-grade-chip`/`.hc-grade-rs`/`.hc-grade-empty`。 |
| v206 | 修复模拟仓挂单 BX/RS 字段缺失：`SIM_PENDING.push` 时用 IIFE 即时计算 `entryBxGrade`/`entryFinalGrade`/`entryRsResult`/`entrySectorEtf` 写入 `bx` 对象；提交后重置 `_pendingRsResult`/`_pendingRsEtf`。 |
| v207 | 版本缓存破坏 bump（`desk.js?v=207`，`sw.js trendo-v207`）。 |
| v208 | **涨跌量比（20日量比）加入 RS 评分第4维度**：`/api/history.js` 新增 `volumeResults`（Yahoo 日线成交量）；`calcVolUpDownRatio(closes,volumes,20)` 计算涨日量占比；`calcRSScore` 增量比得分（0-5分，>65%=5/>55%=4/≥45%=3/≥35%=1/<35%=0）；新满分 max=20（有ETF）/10（无ETF），无量比数据时回退 15/5；评分卡（弹窗+抽屉入场评级）均展示"涨跌量比"明细行。 |
| v209 | **派发成交量降级机制**：`rsAdjustGrade` 新增三条派发规则（`volScore===0` 时）：①强RS（norm≥7）时禁止升级，维持原级；②一般RS（norm 4–6）时触发降1级；③弱RS（norm<4）时复合双降（原本只降1级）。`volScore===null`（无量数据）不受影响保持向后兼容。 |
| v227-v231 | **SPX 做市商 Gamma（GEX）大卡片**（Market页，VIX卡下方整行）：数据源历经 Yahoo期权(crumb认证被429限流)→Polygon期权(403无权限)→**CBOE免费延迟期权链**(cdn.cboe.com `_SPX.json`，唯一可行免费源)。指标：Net GEX(0-30DTE ±15%行权价，每1%波动对冲美元量)、**波段口径swing=剔0DTE**(0DTE收盘清零，对隔夜持仓无延续性；正Gamma但swing<0时卡片和综合建议均警示)、Gamma Flip、Call/Put Wall、DTE三桶、距离%、**仓位修正因子×0.4~×1.15**(乘轴B仓位上限)。卡片：价格结构条(Put Wall—Flip—现价—Call Wall，Flip左红右绿)、4个level pill、较昨日Δ+近N天分位(Redis `gex_hist_v1` 每日快照120天)、DTE分解、状态解读文案。`combineAxes` 负Gamma/临界/正但swing负时追加警示；AI市场简报gex参数7字段。注意：GEX绝对值随spot²和OI增长，固定阈值会过时，读数看分位和Flip距离；当前SPX~7450下正常正Gamma区间约+30B~+80B。手机端 `.mkt-row.mkt-row-full` 双class防被2列规则覆盖。 |
| v245-v252 | Journal页重设计（标签系统3类21个/归因摘要/BX天数chip）；持平(pnlFinal===0)三处统一badge设计（列表/卡片/Journal）+入场时机绩效模块（Analytics，按BX天数分段）。 |
| v253-v256 | **期权滚动策略模块**（Sim页，`SIM_OPTIONS`）：期权链数据源尝试 Yahoo(401 crumb被挡)→Nasdaq(500 Akamai挡Vercel IP)→CBOE延迟链(可用但15min延迟数值仍对不上券商)，最终 v256 定为**手动记录模型**：只有标的ETF现价实时（fetchPrices→`_optSpot`，`_optWatchSyms()`并入quote拉取），行权价/权利金/到期日/手数全部手动输入。CSP卖Put/CC备兑Call双策略；卖出弹窗实时算权利金收入/占用现金/盈亏平衡/年化；持仓卡：安全垫距离、到期预估(按现价OTM作废/ITM指派)、时间损耗进度条、手动记Mark算浮盈；到期自动结算(需live spot)；平仓buy-to-close手动填买回价；滚仓=平旧+预填开新；汇总条4格；已了结列表。云同步4处已补`simOptions`。`api/history.js`恢复原版(期权branch已删，**Yahoo UA必须保持短版**——v253换完整Chrome UA触发风控致VOO/VIX拉取失败)。Vercel Hobby限12个serverless函数(新增API前先数)。模态复用：sell/close/mark三模式(`_optModalMode`隐藏字段行)。 |
| v261-v266 | 期权模块完善：平仓/滚仓弹窗补价格+日期字段（`#opts-row-premium` 嵌套在 wrapper `#opts-row-qty-premium` 内，非sell模式要显示wrapper只藏qty列）；**预设单**（盘前 `status:"pending"` 只填 targetPremium，开盘后「记录成交」填实际权利金激活为open）；卡片系统重设计（`.opts-card-hd`头行 + `.opts-card-metrics` 4列grid + foot）；单位手→张；ETF chips扩至6个。 |
| v267-v269 | 顶部现价pills与chips同步为 DRAM/MAGS/SMH/GLD/IWM/QQQ 6个（`OPT_WATCH_SYMS`）；到期徽章"到期作废 OTM"→"到期OTM"；**入场Delta（可选手填）+ entryDTE（自动快照）**，已了结卡片新增指标行（`_optDoneMetaRow`：入场DTE/Delta/持仓天数/权利金捕获率/年化收益）；`.form-input` 补 `width:100%+box-sizing:border-box+min-width:0` 修手机端弹窗输入框溢出（浏览器input固有min-width撑破两列flex）。 |
| v270 | **Serverless CPU 优化**（期权模块上线后 Fluid Active CPU 涨5-6倍的修复）：①期权6个watch ETF只在Sim页面板可见时并入quote轮询，后台只拉 `_optLiveSyms()`（open + CSP被指派未出仓的标的，供到期结算/正股浮盈）——此前只要有open期权仓位就7×24每30秒多拉6个symbol，还可能把symbol数推过15的分块边界使invocation翻倍；②休市且无crypto持仓时价格轮询30s→10min（`tick()` 内 `effInterval`，pull-to-refresh/切回前台/下单仍 `lastPriceFetch=0` 立即刷新）。 |
| v271 | **Inspirations页（合并Journal+Preparation）+ Options期权专页**：Journal和Preparation两页合并为Inspirations（灵感，灯泡图标），内置子tab「复盘 Journal / 准备 Preparation」（`inspSubTab` 状态，`.page-subtab-bar` 组件）。新增Options期权专页（overlapping circles图标），子tab「实盘 Live / 模拟 Sim」（`currentOptMode`），SIM_OPTIONS迁出Sim页，与新增`REAL_OPTIONS`各在对应子tab渲染（`_activeOpts()`返回当前数组引用，`renderOptions()/wireOptions()`参数化，原名保留别名）。`_optLiveSyms()`扫描双数组。`REAL_OPTIONS`全局变量+localStorage(`trendo_v4_real_options`)+云同步(`realOptions`字段)。导航6 tabs: Dashboard/Sim/Market/Analytics/Inspirations/Options。`_optWatchSyms()`和现价pills仅在Options页可见时全量拉取。上次打开页 journal/watchlist 自动迁移为 inspirations。 |
| v500-v505 | 仓位计算器（BX+RS+ST综合评级自动联动风险%）；开仓表单市价单预估价+仓位计算器适配限价/市价；持仓抽屉入场价/持股数量可编辑并联动recompute；已平仓列表分批出场记录在完全平仓后自动合并为一行（`mergeClosedForDisplay()`，按sym+entry+cost分组，仅在持仓已脱离HOLDINGS时合并，保留原始分批记录供P&L日历/抽屉执行记录还原）；delete/restore按钮修复为按整笔交易组精确匹配；`.restore-btn`补齐与`.sim-restore-btn`一致的悬停显隐/警告色样式（此前完全无样式）。 |
| v506 | **设计 Token 与组件层更新**（参考 ETF CoTrade 视觉语言，仅改样式不改内容/结构）：`--up`/`--down`/`--ok`/`--danger` 色相向更克制的薄荷绿+珊瑚红收敛（145°→158°、饱和度降低），全站含硬编码字面量的同色派生值（BX评级色、状态徽章等）同步替换；`--line` 边框透明度 .6→.5，卡片描边更细；新增"teal短刻度线"标签组件——`.analytics-metric-label`（Analytics页）/`.sim-astat-label`（Sim页）/`.j-statsbar-label`（Inspirations统计栏）/`.mkt-card-label`（Market页）统一加 `::before` 刻度线+11px圆角卡片，四处结构一致的"指标tile"视觉签名统一。后续按页面（Dashboard总结区/Market三轴卡片等）适配为第二阶段。 |
| v507 | **Dashboard 总结卡片 + 持仓表格徽章系统适配新视觉语言**（第二阶段第一批，保留全部原有元素/数据）：`#overview` 4张卡片（总资产/总浮盈浮亏/今日盈亏/当前持仓数）+ 仓位分布卡新增双语大写标签（NAV·总资产/OPEN P&L·总浮盈浮亏/DAY P&L·今日盈亏/OPEN POSITIONS·当前持仓数/ALLOCATION·仓位分布）+ teal刻度线（`.ov-card-hd`包裹`.ov-tick`+`.label`，移除旧版label下划虚线避免与刻度线重复强调）；`--radius` 10px→12px 全局圆角统一（`.ov-card`/`.ov-pie`/`.panel`等引用该变量的容器自动生效）；持仓表格徽章描边化对齐参考图 CSP/CC 标签质感——`.status`（进度状态徽章）、`.bxg-val`（列表视图评级chip，此前仅纯色文字无背景/边框，现与卡片视图`.hc-grade-chip`观感一致）、`.pending-order-badge`（模拟仓挂单市价/限价标签）统一加 `currentColor` 半透明描边。 |
| v508 | **修复持仓表头与内容错位（第一步，未根治）**（真实仓+模拟仓通病）：`<thead>` 只为 `COLS` 生成表头 `<th>`，但每行 `<tbody>` 都多一个"操作"列 `<td>`（关闭/删除/撤回按钮），表头比数据行少一列。修法（与 v7.9 Market 页三表同款）：表头补一个空 `<th class="th-actions">`占位对齐操作列；`table.holdings`/`table.sim-holdings` 改 `table-layout:fixed`；新增 `<colgroup>`（`#holdings-colgroup`/`#sim-holdings-colgroup`）由 `colgroupHTML()` 按 `COL_WEIGHT` 权重表动态生成各列百分比宽度。**此版本本身仍有残留错位**，根因见 v509。 |
| v509 | **彻底修复表头错位真正根因**：`table.holdings`/`table.sim-holdings` 的 `tbody tr::before{content:"";position:absolute;...}` 一直被用来画悬停/选中时的左侧竖条高亮。问题在于——`<tr>` 是 `display:table-row`，浏览器的表格"匿名对象生成"（anonymous table object construction）发生在应用 `position:absolute` **之前**：只要 `content` 不是 `none`，哪怕定位成绝对定位，仍会被当成该行的一个匿名单元格参与列计数，正好吃掉第 0 列的位置，把这一行真正的 9 个 `<td>` 全部顶到右边一列，最后一个"操作"列则被挤出 colgroup 范围只剩 0 宽——这与 v508 截图看到的现象（整体右移、状态徽章消失在右侧）完全吻合。`table-layout:auto` 下这个 bug 一直存在但因自动列宽算法掩盖不明显，切到 `fixed`+`colgroup` 后被放大成肉眼可见的错位。修法：删除 `tr::before`，改用 `box-shadow: inset Npx 0 0 0 var(--accent)`（box-shadow 是纯绘制效果，不参与盒模型/表格列生成）实现同样的左侧高亮条。**排查方法记录**：本环境默认网络策略禁止访问任意外网 URL（含 Google Fonts），但 `file://` 本地文件 + Playwright（`/opt/pw-browsers/chromium`）不受此限制，可用于以后任何需要真机截图/量测的场景——`localStorage.setItem('trendo_auth_v1','1')` 跳过密码墙，写入 `trendo_v4_holdings`/`trendo_v4_sim_holdings` 等 key 注入测试数据，`getBoundingClientRect()` 对比表头与数据行各列坐标可精确定位此类像素级错位，比反复凭截图猜测快得多。 |
| v510 | **手机端持仓表格布局修复（第一步）**：v508 起表格改 `table-layout:fixed`+`width:100%`，桌面正常但手机端把全部 9 列压进 ~360px 视口导致文字重叠（如 `$63.$57.71.00`）。首版方案：仅手机端隐藏止损/止盈 + `min-width:560px` 横向滚动。v511 起改为桌面手机统一隐藏。 |
| v511 | **止损/止盈列全端隐藏 + 手机列间距加大 + 桌面状态徽章与操作按钮重叠修复**：①`data.js` 的 `COLS` 里 `stop`/`target` 改 `on:false`——桌面+手机列表视图均默认不显示止损止盈（数据仍在抽屉可编辑、level bar 可视），设置里列选择器仍可手动勾回；`visTableCols` 简化为 `c.on && !(isClosed && closedHide)`，移除 v510 的 `isMobileWidth`/`MOBILE_HIDE_COLS`/断点重渲染监听（列集不再随视口变化）。②手机端表格列内边距 `7px 8px`→`9px 14px`、`min-width` 560→640px，列间距更宽松（真实仓+模拟仓共用同一组 `td/th` padding + 首列 sticky 规则，删除 sim 重复规则）。③桌面状态徽章（如"近止损 · Near Stop"）此前宽于其列、溢出到操作列压住关闭/删除按钮——`progstatus` 列权重 `COL_WEIGHT` 140→165，且移除止损止盈后 `colgroupHTML` 把释放的宽度重新摊给各列，状态列变宽后徽章不再溢出（实测徽章右缘 1286px、首个操作按钮左缘 1346px，留 60px 间隙）。 |
| v537 | **修复同symbol多笔已平仓交易在抽屉/导航中互相覆盖**：真实仓+模拟仓的卡片点击、上下键导航、抽屉滑动切换、导航计数器、表格/卡片选中高亮，此前均只按 `sym` 匹配"当前选中交易"，导致同一股票存在两笔独立已平仓交易时点开第二笔仍显示第一笔数据。改为统一用 `sym+entry+cost` 复合键（`tradeKey()`）匹配，`selectedEntry/selectedCost`（+ Sim 对应）记录抽屉当前具体打开哪一笔；表格 `<tr>`/卡片 `div` 补 `data-entry`/`data-cost`；`_drawerNavList` 卡片视图分支改用 `mergeClosedForDisplay` 与列表视图口径一致。聚合计算（`groupTrades`/`mergeClosedForDisplay`/月度回测）本就按复合键分组，未受影响。 |
| v538-v539 | **Market 页综合建议文案改为状态标签型 + Inspirations 归因摘要精简 + 新增"策略失效"标签**：`combineAxes` 的 6 档 headline 从"加仓动作型"（❌禁止新多仓/⚠️止盈禁新仓/🔄分批建仓/⏫小幅加仓/⏸️持仓观望/✅正常进攻）改为纯文字状态标签（逆风区/过热区/恐慌区/偏冷区/偏热区/顺风区，后两档 v539 定稿为 `getSentimentAxis` 同名情绪标签而非另造"修复区/滞涨区"），标题只描述当前所处区间、不下达指令，颜色仍由 `combined.color` 内联样式驱动，不依赖 emoji；具体操作留在 detail 文案与三轴卡片里；优先级/GEX警示拼接逻辑不变。归因摘要 `.jts-sub` 删除"Insight ·"英文装饰前缀，只保留"N 笔已标注"。`JOURNAL_TAGS` 管理组新增 `mgmt_invalid`「策略失效」（红色 `var(--down)`）。 |
| v560 | **综合建议 headline 改回动作词 + 新增独立状态标签**：`combineAxes` 返回值新增 `state` 字段，`headline`（防守/止盈/布局/分批参与/保持持仓/正常配置）与 `state`（趋势逆风/极端过热/恐慌积累/情绪偏冷/情绪偏热/趋势顺风）分离展示——headline 说"怎么做"，state 说"为什么"；`detail` 精简为一句话（如"禁止新开多仓，保护已有仓位"），移除仓位上限/止损宽度的重复数字（已在下方风险容量轴卡片展示），GEX 警示仍无条件追加在句尾。`mkAxesHTML` 新增 `.mkt-combine-state`（`.mkt-combine-head` 改 `flex` 布局，headline+state 同行）。AI 市场简报 `_lastMktCtx.regime` 同步改为 `"${headline} · ${state}"` 传给 Claude。 |
| v561 | **GEX 警示从 detail 长句改为 state 短后缀**：`combineAxes` 删除拼在 `detail` 末尾的 GEX 长句（负Gamma/临界/正转负三种各一整句），改为 `gexTag` 短语（" · 负Gamma"/" · Gamma临界"/" · Gamma转弱"）直接拼进 `state`（如"趋势逆风 · 负Gamma"），与已有的状态副标题风格统一，detail 恢复成纯粹的一句话操作建议，不再有变长的风险附注。 |
| v562 | **综合建议标题放大 + 加对应色 emoji 圆点**：`combineAxes` 每档新增 `emoji` 字段（🔴防守/🟠止盈/🟢布局/🔵分批参与/🟡保持持仓/🟢正常配置，与既有 `color` 一一对应），`mkAxesHTML` 在 headline 前插入 `.mkt-combine-emoji`；`.mkt-combine-head` 字号 22px→30px（手机端 15px→20px），新增 `.mkt-combine-emoji`（22px/手机16px）与 `.mkt-combine-state` 字号手机端同步微调（11.5px）。 |
| v563 | 综合建议标题字号 30px→26px（手机端同步统一为 26px，此前手机端更小 20px）。 |
| v564 | 综合建议标题手机端字号改回 20px（桌面保持 26px）。 |
| v565 | **期权页汇总条重设计为"权利金总账"（Premium Ledger）卡片**（实盘/模拟仓共用 `_optSummaryHTML`，两个 tab 自动同步）：替换旧版"1个净盈亏数字+可选侧栏+4格网格"，改为参考截图的两段式布局——①卡片头部左侧 PREMIUM LEDGER 标签+标题+免责说明，右侧大号"净现金流"数字（`卖出总收取Σpremium*100*qty`−`买回总支出Σ仅closed的closePremium*100*qty`，含未结算/被指派未平仓仍在手的权利金——不同于下方"已结算"口径），中间三格算式行（01卖出总收取 − 02买回总支出 = 03净现金流，第三格按盈亏色调 `mkAlpha` 浅底高亮），底部两行圆点分色小结（Settled Premium P&L=已有的 `realizedPnl`；Open Premium P&L=已有的 `manualMark` 浮盈）；②6格指标网格（`opts-ws-grid-6`，3列2行/手机2列）：已实现期权收益(=realizedPnl)、Open P&L(期权浮盈+持股浮盈合并展示+拆分子项)、平均Delta(新增，settledPosns按qty加权`entryDelta`)、胜率(复用)、权利金保留率(新增聚合版，`settledPrem/settledGross`，此前只有单笔卡片版本)、占用资金(复用`totalOccupied`+新增占组合比例`/totalNotional或simNotional`)。新增字段全部来自现有 `_optFinalPnl`/`_optAnn`/`premium`/`entryDelta` 等既有数据，无需改动 SIM_OPTIONS/REAL_OPTIONS 数据模型。CSS 删除死代码 `.opts-pnl-hero*`/`.opts-pnl-side*`/`.opts-pnl-occ*`（旧侧栏样式，新设计不再需要），新增 `.opts-ledger-*` 系列类名，手机端 `@media(max-width:640px)` 补充堆叠布局。 |
| v566 | 占用资金去掉占组合比例（只留 `$金额` + `未平仓N张`）；`.opts-summary-block` 改为唯一的外层边框容器（`border+border-left accent+border-radius+overflow:hidden`），把 ledger 卡片和 6格网格包成一张连续卡片（内部用 `border-top` 分隔线区分两段），与下方持仓卡片列表之间 `margin-bottom` 10px→24px 拉开距离，使"计算模块"与"持仓模块"形成两个边界清晰的独立区块。 |
| v567 | **权利金计算模块拆为两张独立卡片 + CSP指派立即结算重构**：①`.opts-summary-block` 改回 `display:flex;gap:12px` 的两张独立卡片（ledger 卡 + 6格网格各自 `border+border-left accent+border-radius`），替代 v566 的单卡内部分隔线方案。②**CSP 被指派后期权腿立即计入已平仓**（不再等到手动"记录出仓"）：`_optFinalPnl` 简化为统一 `return pos.realized ?? 0`（删除 CSP+assigned 专属分支），`pos.realized` 在 `settleExpiredOptions` 指派时就已经是纯权利金（`premium*100*qty`），此后永不再被覆写——`openAssignedExitModal` 确认出仓时删除了原先把 `pos.realized` 覆写成"权利金+正股盈亏"合计的那一行，正股出仓盈亏改为只在 `_optPnlBreakdown`（已有独立计算，未改动）里展示，不再倒灌回期权侧的已实现值，避免出仓时重复计账；`_optAnn` 删除"未出仓CSP不算年化"的提前返回。`_optSummaryHTML` 的 `settledPosns` 从排除"仍持股未出仓的CSP"改为直接等于 `done`（liveAssigned 不再与 settledPosns 互斥，同一仓位可以"期权已结算+正股仍持有"同时成立），使 Realized Option P&L/胜率分母/平均Delta/权利金保留率都会立即纳入刚被指派的 CSP；胜率计算天然不受影响（仍按 status 精确过滤 expired/closed，指派状态继续不计入胜负）。③**持有正股卡片改为"正股"框架**：header 徽章从 `CSP`（紫色期权徽章）换成新增的 `.opts-badge-stock`（中性灰"正股"徽章），代号后不再跟着 `$60P` 这种期权式行权价+类型后缀，改为在旁边一个 muted 小标签展示"CSP指派 · $60P"仅作溯源说明；`+CC`/`记录出仓`按钮与联动计算（`ccPerShare`/`adjustedCost`/`totalCcPrem`）完全未改动。`_optDoneMetaRow` 新增 `assigned` 状态下的"权利金捕获 100%"展示（此前只有 expired/closed 有）。 |
| v568 | **持仓模块整体包成一张卡片**：`renderOptions()` 把待执行/持仓中/持有正股/已了结/月度明细全部包进新的 `.opts-positions-module`（`border+border-radius+overflow:hidden`，和计算模块的两张卡片同一视觉语言），取代此前"计算区块 margin-bottom 拉开距离、持仓区仍是裸列表"的方案，页面现在明确分成"计算"与"持仓"两个独立卡片模块。 |
| v569 | **权利金计算模块改用 Analytics 页同款卡片语言**：`_optSummaryHTML` 不再是"两张描边卡片"，改为套用 `.analytics-card`（Analytics 页复盘概览等模块同款：纯 `border:1px solid var(--line)`，不带颜色描边，标题用 `atitle()` 生成的小色块tick+中英文，与 Analytics 页视觉统一）——净现金流大数字、三格算式、已结算/持仓中分色小结、6格指标网格全部并入这一张卡片内部，取代 v567 的"两张独立描边卡片"方案；`.opts-ws-grid` 6格网格改为卡片内嵌的轻量分组（`border-radius:8px` 无外框），不再自带描边。持仓模块 `.opts-positions-module` 圆角同步为 12px 与 `.analytics-card` 对齐。删除死代码 `.opts-ledger-card`/`.opts-ledger-eyebrow`/`.opts-ledger-title` 相关 CSS。 |
| v570 | **6格指标网格拆成两个3格独立小组，行间用间距不用线**：原本 6 个 stat 用同一个 `grid-template-columns:repeat(3,1fr)` 连成一体，两行之间靠 `background:var(--line)` 的 1px 网格线分隔——视觉上是"一条线"而不是"两个独立模块"。改为 `.opts-ws-rows`（`flex-direction:column;gap:12px`）包两个独立的 `.opts-ws-grid.opts-ws-grid-6`（各自 3 格、各自圆角），行与行之间是真正的空白间隔。手机端同步修正：此前 `.opts-ws-grid-6` 沿用了 6 格网格的 `repeat(2,1fr)` 两列规则，3 格内容两列布局会在第二列多出一个空白格；改为单列 `1fr` 堆叠，不再有多余空格子。 |
| v571 | 计算模块与持仓模块之间的间隔 `.opts-summary-block` `margin-bottom` 24px→32px。两张卡片本就已各自独立描边（v568 起），但卡片底色 `--bg-1`(L .175) 与页面底色 `--bg-0`(L .14) 只差 0.035，加上描边极淡，24px 的空隙不足以让"两张卡"读出来，观感仍像"一条分隔线"；拉到 32px 后空白带够宽，模块边界才明确。 |
| v572 | **真正根因：外层 `#opts-real-panel`/`#opts-sim-panel` 一直带着 `background:var(--bg-1)`**——这是重构前"整页一个大面板"时代的遗留样式，包住了权利金计算模块和持仓模块之间的全部间隙，导致 v571 拉宽 margin 也没用：间隙本身画的是和卡片同色的 bg-1，不是页面深色 bg-0，视觉上永远像"一条描边线"而不是"镂空的间隔"。去掉这层外壳的 `background`/`border`/`border-radius`/`overflow`（只保留 `margin-top`），让间隙露出真正的页面底色，两个模块才读成两张独立浮起的卡片。 |
| v573 | 持仓模块与权利金计算模块顺序对调：`renderOptions()` 里 `positionsHTML` 拼在 `_optSummaryHTML(open, done)` 前面，`.opts-summary-block` 的 `margin-bottom:32px` 相应改为 `margin-top:32px`（间隙现在需要留在计算模块上方而不是下方）。 |
| v574 | 删除持仓模块顶部"持仓中 · Open · N"文案，直接从 CSP/CC 策略分组标签开始展示（待执行/持有正股/已了结等其他小节标签不受影响）。 |
| v575-v576 | VIX/VXN 分档词汇改为恐惧/贪婪语系（贪婪/中性/恐惧/恐慌/极恐），随后对调恐慌↔极恐顺序（VIX 30-50→恐慌，≥50→极恐），`getRiskAxis`/`MKT_ZONES`/`mkPlaybookHTML` 同步。 |
| v577-v580 | **月度回测（现持仓+模拟仓）与分析复盘重设计**：`renderMonthlyBacktest` 引入 `isCombinedMode`（持仓中+本月已平仓合并口径）与 `closedOnlyItems`（仅已平仓口径）双轨——盈亏总额/评级/行业用合并口径，交易分布/收益率细分仅已平仓口径（浮动结果不适合算胜率）；总览卡改 3×2（规模一排+表现一排），新增总投入金额/资金利用率（月度）或平均持仓天数（lifetime）。现持仓页删除"本周复盘"模块只留财报日历；模拟仓页删除财报日历模块（并入现持仓页 `renderEvents()`，含 real/sim 来源标签）；Analytics 顶部卡片同步加总投入金额+资金利用率。**Bug**：删除本周复盘时误删了内嵌的 `renderEvents()` 调用点，财报日历随之消失——修复为在 init 序列单独调用。 |
| v581 | Analytics「复盘概览」卡片重排为 5×2 双排分组（规模与收益：总投入金额/资金利用率/已实现盈亏/资金加权收益率/历史回撤；交易分布：已平仓笔数/总体胜率/盈利数量/亏损数量/持平数量），新增 `.sim-a-stats.cols-5`。 |
| v582 | Analytics 5×2 卡片手机端断点从 3 列改为 2 列（`cols-5` 移动端 `repeat(2,1fr)`），与其余模块的手机排版规范统一；清理一处重复 CSS 规则。 |
| v583-v584 | **财报日历彻底修复**：新增 `fetchAllEarnings()`，页面加载时为现持仓+模拟仓每个 symbol 批量调 `/api/earnings`，写回 `h.earnings` 并触发重渲染（此前 `earnings` 字段只在开仓弹窗手动点"自动获取"时写一次，当季过后永久过期，日历长期为空），按 symbol 缓存 24h 且过期日期强制重查。随后修复 `renderEvents()` 自身三个叠加 bug：①14 天硬窗口导致财报季刚过时全空——改为不设前向截止，按日期升序展示全部已知财报日；②`new Date("YYYY-MM-DD")` 按 UTC 解析，在美股负时区下 `setHours(0,0,0,0)` 回退一天，恰好今天的财报会被过滤掉——新增 `parseLocalDate()` 按本地日解析；③`renderEvents()` 全程只在 init 调用一次，云同步 `applyCloudData()` 替换 HOLDINGS/SIM_HOLDINGS 后从不重渲染——现已在 `applyCloudData()` 里补上 `renderEvents()+fetchAllEarnings()`。过期日期不再静默丢弃，改为底部提示"N 个持仓的财报日期已过期"。 |
| v585 | 月度回测「最佳 / 最差」改用合并口径（原来只从已平仓交易里选，会漏掉本月表现最极端、通常还拿在手上的那一只）；卡片标签加"持仓中/已平仓"状态 chip 标出数字是否还会变；空态文案同步调整。lifetime 的「分析复盘」不受影响，仍保持已平仓口径。 |
| v586 | 月度回测/分析复盘小节顺序重排为「组合层面（规模/表现/盈亏总额）→ 逐笔拆解（交易分布/收益率/最佳最差/评级分层表现/行业表现）」，用 `.simb-part` 分区卡片包裹两大块；小节标题统一为 `.simb-subtitle`（teal 刻度线+中英文+可选口径标签+可选说明），取代此前并存的两套写法；行业贡献→行业表现；盈亏总额从裸网格改为跟规模/表现一致的 tile+sub 写法。 |
| v587 | **月度回测新增历史月份**：此前只统计自然月当月，一进入新月上月记录就整个消失。新增 `historicalMonthsHTML()`，按 `entry` 日期把 sourceArr/otherArr 分桶为历史月份，倒序列在当月内容下方，每月一个 `<details>` 折叠块，默认收起只留标题行（月份+净盈亏色标+笔数），展开为当月同款两分区模板。「当月回撤」历史月份没有逐日峰值数据可回放，显示"—"。仅 desk/sim 两个按月切分模块生效，lifetime 分析复盘不需要。 |
| v588 | **月度回测接入 VOO 影子基准对比**：`资金加权收益率`（Σpnl/Σ成本）此前 sub 文案声称"可与大盘当月涨跌幅同层对比"但站不住脚——仓位入场时点参差不齐，直接比"整月涨跌幅"等于假设资金月初就全部到位。新增**逐笔配对影子基准**：给每笔仓位配一段跟它自己实际入场→出场时间完全一致的 VOO 涨跌幅（已平仓用真实 entry→真实 closedAt，不管哪个月平的都不冻结；持仓中用真实 entry→exitDate，当月模块传今天/历史模块传该月最后一个交易日），按金额加权聚合出 Alpha，替换 sub 文案为真实对比值。**历史月份新增"冻结"**：仍持仓中的部分点开时异步拉取该 symbol 在月末交易日的收盘价定格 pnl（不再用今天的实时价），已平仓的永远用真实 `pnlFinal`+真实 `closedAt`（不冻结——那已经是定论，冻结等于用虚构数字覆盖真实结果）。**架构**：`renderMonthlyBacktest` 拆成 `.simb-current-mount`（每次调用都重建，跟随实时行情）+`.simb-history-mount`（仅当 `monthlyEntitySignature`——sym+entry+qty/closedAt 的指纹——变化时才重建），避免 `fetchPrices()` 30 秒一次的价格轮询把用户刚展开的历史月份重新收起、把已经拉到的冻结结果也丢掉；历史月份改为点开才发请求（`wireHistoryMonths` 监听 `toggle`），结果按 `sectionSel:monthKey` 缓存至会话结束；当月基准按 `sectionSel` 缓存 20 分钟并发去重（`_curBenchCache`）。Playwright 回归：Alpha 数值 vs 手工验算一致、GOOG 冻结 pnl 精确匹配月末价计算、7 月开仓 9 月平仓的仓位正确用真实 9 月数据而非 7 月冻结、真实 30 秒价格 tick 后历史月份保持展开且不重复发请求、lifetime 分析复盘不受影响。 |
| v589 | **修复历史月份偶发"加载失败" + 跑赢基准改为独立 tile**：`api/history.js` 的 Yahoo 请求此前没有超时——同一批 symbol 里只要有一个慢/卡住，`Promise.all` 就会一直等，最终撞上 Vercel 函数级默认 10s 超时，整个请求失败（客户端看到"加载失败"），symbol 数少的月份侥幸跑得完就没事，这正好解释了"某个月失败、其他月都行"的现象。补上 `signal: AbortSignal.timeout(6000)`（单个 symbol 超时静默跳过，不拖累整批）+ `vercel.json` 给 `api/history.js` 单独设 `maxDuration:20` 留余量。「表现」排的"资金加权收益率"tile 此前 sub 塞了"VOO同期 +X% · Alpha +Ypp"整段文字，手机端窄列（v588 引入）装不下会折成 3-4 行，把同一网格行里的"综合盈亏"/"本月回撤"也一起撑高、底部留大片空白，跟其余卡片观感不协调。改为新增独立的"跑赢基准" tile（`alphaTileHTML()`），Alpha 数字单独一行、VOO 原始涨跌幅退到 sub；「表现」排从 `cols-3` 改回 base `.sim-a-stats`（4格，跟下方"交易分布"排同一套桌面4列/手机2×2响应式，复用模块里已验证过的模式，不用新造）。 |
| v590 | **`computeFrozenMonth` 加客户端重试 + 12s 超时**：v589 的服务端超时只解决了"一个慢 symbol 拖垮整批"，没覆盖部署边缘节点滞后/Yahoo 偶发限流这类瞬时失败——现在失败后自动重试一次（800ms 后），失败原因打到 console（`[月度回测] 历史价格拉取失败...`）方便下次复现时直接从 devtools 里定位。**月度回测/分析复盘手机端统一为 2 列**：`cols-3`（规模、盈亏总额两排，各 3 格）此前手机端仍强制 3 列，在 390px 下比 `cols-5`/表现排的 4→2 更挤；改为 `@media(max-width:768px)` 下也变 2 列（3 格自动排成 2+1），跟模块里其余行手机端全部 2 列的观感统一。 |
| v591 | **历史月份错误信息直接展示在卡片上 + 修复 crypto symbol 查询**：`computeFrozenMonth` 两次重试都失败后不再只显示"加载失败"四个字，改为返回 `{error, symbols}`，卡片上直接展示具体报错原因（HTTP 状态码/超时/响应缺 VOO）+ 实际请求的 symbol 列表——手机端不方便开开发者工具，用户不用连电脑，读一下卡片文字就能把关键信息反馈回来定位问题。顺带修复一个真实 bug：仍持仓中的仓位如果是 crypto（如 BTC），历史价格查询此前一直传裸 symbol（"BTC"），但 `/api/history` 代理的 Yahoo 接口只认 "-USD" 后缀（"BTC-USD"），裸 symbol 查不到任何数据——`computeEntryRS` 早就用同一映射处理过这个坑，`computeFrozenMonth` 之前漏了，新增 `_histYahooSym()` 补齐，crypto 仓位现在也能正确冻结在月末价，不会静默退化成用实时价占位。 |
| v592 | **修复历史月份"响应中没有 VOO 数据"的真正根因**：v591 加的诊断信息当场揪出真凶——某用户模拟仓 7 月仍持仓中的股票有 34 只，`symbols = [...openSyms, "VOO"]` 里 VOO 永远拼在最后，而 `/api/history` 服务端对单次请求的 symbol 数做了 `.slice(0, 30)` 截断，VOO 排第 35 位直接被截没，整个月因此被判定失败——这解释了"只有某个月失败、其他月都行"：失败与否只取决于那个月仍持仓中的 symbol 数量是否越过 30 这条线，跟月份本身、跟"八月是否已开盘"完全无关。修法：`computeFrozenMonth` 把 VOO 拆成独立一次请求（体积恒定 1 个 symbol，基本不会失败），股票列表单独一批；服务端上限 30→50 给活跃交易者的真实持仓规模留够余量。两批并行发出，互不拖累——股票批即使真的超过上限，最多是排到上限外的几个 symbol 拿不到冻结价、优雅降级为实时价占位，不会像之前那样让 VOO 被误伤进而拖垮整个月。 |
| v593 | **VOO 基准改回日历月涨跌幅**：v588 引入的"逐笔配对影子基准"（每笔仓位按自己实际入场→出场日配 VOO 涨跌幅，按金额加权聚合）数学上更精确，但已平仓仓位若拖到后续月份才平仓（按 v588 设计，用真实 closedAt 不冻结），会把那之后月份的 VOO 涨跌也混进"当月"的基准数字里——弃用户实测：7月一笔跨到9月才平仓的仓位，把"VOO同期"从真实的 7月涨跌幅 1.7% 拉到了 2.2%，跟外部数据源核对不上，直觉上像是算错了。改为纯粹的 VOO 日历月涨跌幅（该月第一个交易日收盘→月末最后交易日收盘，当月进行中则→今天收盘），不再依赖任何持仓数据，是固定的单一数字。新增 `closeOnOrAfter()`（`closeOnOrBefore` 的镜像，找月初1号之后最近的交易日）+ `vooCalendarPct()` 取代 `shadowBenchmarkPct()`；`fetchCurrentMonthBenchmark()` 因此不再需要持仓数据，缓存键从按 sectionSel 改为按 monthKey，desk/sim 共用同一份 VOO 数据、少发一次请求。代价（明确取舍）：不再是学术意义上跟"资金加权收益率"逐笔时间对齐的精确配对，只是常规的月度参照，两边入场时点不同带来的公平性问题重新出现——用户已知晓并接受，图的是直观、能跟外部数据核对。Playwright 回归：跨月平仓场景下"VOO同期"从旧算法的 2.2%（混入9月）改为新算法的 1.7%（纯7月，与独立手算的日历月涨跌幅 1.73% 一致）；当月（进行中）场景与单笔仓位历史场景也分别验证过与手算一致。 |
| v594 | **修复 `api/history.js` 交易日错标一天的根因**：用户连续报了3-7月共5个月的 VOO 涨跌幅都跟外部数据源对不上（偏差0.3~0.85个百分点，7月因为真实值接近0%还直接把符号搞反了），排查发现 `new Date(ts*1000).toISOString().slice(0,10)` 用 UTC 时区给 Yahoo 返回的原始时间戳转日期——但 VOO 是美股，K线应该按**美东时间**判定属于哪个交易日，UTC 硬转会在某些锚点时间下把交易日错标到前一天或后一天（用 Node 实测：一根标记美东晚8点的K线，UTC 转换会跨过 UTC 零点被错标为下一天）。这类"差一天"的误标，在大多数场景下无感（相邻两天价格通常接近），但恰好直接命中月度回测最依赖的"月初/月末第一个和最后一个交易日"这两个边界点，导致整月涨跌幅的计算基数就是错的。改用 `toLocaleDateString("en-CA", {timeZone:"America/New_York"})` 按交易所本地时区取日期（en-CA locale 天然输出 YYYY-MM-DD 格式），从数据源头修好，不需要改任何客户端逻辑——`computeEntryRS`（RS评分）等其他消费 `/api/history` 日期数据的调用点也一并受益。 |
| v595 | **VOO 月度涨跌幅改用分红调整后收盘价**：v594 修完时区错标后用户反馈数字仍未对上，猜测参考的"正确值"是含分红再投资的口径——排查发现 `api/history.js` 一直只拉 Yahoo `indicators.quote[0].close`（裸收盘价），从没读取 `indicators.adjclose[0].adjclose`（分红/拆股调整后收盘价），任何"月涨跌幅"只要用裸收盘价算，一旦区间内跨过除息日就会系统性偏低，这正是大家平时看到的"VOO 月度涨跌幅"报的都是含分红口径、对不上的根本原因。修法：Yahoo 请求 URL 加 `events=div,split` 参数换取 adjclose 数据，响应新增 `adjResults` 字段（跟原 `results` 并列返回，不影响任何现有调用方）；客户端 VOO 基准计算（`fetchCurrentMonthBenchmark`/`computeFrozenMonth`）改为优先读 `adjResults.VOO`，缺失时优雅退回裸收盘价，不会因为某天 Yahoo 没给 adjclose 就直接失败。**明确不动的部分**：仍持仓中股票用于冻结自己那笔仓位盈亏的价格（`stockBatch.results`）继续用裸收盘价——那是真实成交价，分红调整后的价格是往回倒推算出来的历史构造值，拿来算某一天"实际值多少钱"是错的，只有算涨跌幅（比率）才该用调整后口径。顺带把 `fetchCurrentMonthBenchmark` 里的"今天"日期也从 UTC 改成美东时区，跟 v594 的服务端修复保持一致。Playwright 回归：mock 裸收盘价走平（0%）+ adjclose 有涨幅的场景，App 正确显示 adjclose 算出来的百分比而不是裸收盘价的 0%；adjResults 为空时正确回退到裸收盘价，不报错。 |
| v596 | **修复"资金利用率"与"仓位分布·已投"对不上 + 模拟仓分批平仓未合并统计的问题**：Analytics 页「资金利用率」此前误用 `realCostBasis`（全部历史已平仓交易的成本累加，只增不减，做过10笔30%仓位的交易累加起来就是300%）作分子，跟 Dashboard「仓位分布·已投」（当前持仓的快照）完全不是同一个东西，永远对不上——改为用当前持仓（`HOLDINGS`）的成本基础，两个数字现在语义一致、数值也对得上。另一个问题：`groupTrades()`（按 sym+entry+cost 合并同一笔交易的多次减仓记录，避免分批平仓被错算成好几笔独立交易）此前只有 Analytics 页（`renderAnalytics`）自己调用了，**月度回测/分析复盘模块（`renderMonthlyBacktest`，desk 和 sim 共用）完全没有分组**——现持仓的月度回测、模拟仓的月度回测、模拟仓的分析复盘，三处的胜率/收益率/最佳最差/评级/行业统计此前都会把同一笔交易的多次减仓错算成多笔独立交易。修法：在 `renderMonthlyBacktest` 顶部按 mode 分辨"代表已平仓的是 sourceArr 还是 otherArr"，对那个数组统一过一遍 `groupTrades()`，历史月份区块（`historicalMonthsHTML`/`computeFrozenMonth`）通过参数传递自动一并受益；签名检测（`monthlyEntitySignature`，判断要不要重建历史月份区块）特意保留用未分组的原始数组，确保"同一笔交易又减了一次仓"这类变化不会被合并掉、检测不到。Playwright 回归：仓位分布已投与资金利用率两个数字对齐；同一笔交易分3次减仓（+50/+30/−20，净值+60应判定为1笔盈利交易）在现持仓 Analytics（本来就对）、模拟仓分析复盘、现持仓月度回测、模拟仓月度回测四处全部正确合并为1笔、胜率100%，不再是错误的"2胜1负、66.7%胜率"。 |
| v597 | Analytics 页上半部分（复盘概览/收益与盈亏）的 `.sim-astat` 卡片风格对齐「出场质量分析」模块的 `.eq-summary-card`——描边填充卡改成纯色填充（`--bg-2`，去掉描边）+ teal 短刻度线标签，跟页面下半部分已经在用的视觉语言统一；元素/排版（5×2 网格、4 列网格、tile 内容）完全不变，只换皮肤。作用域限定在 `#analytics-content .sim-astat`——`.sim-astat` 是全站共用组件（Sim 页/月度回测/Options 页 Premium Ledger 等到处都在用），不能改全局样式，只有 Analytics 页这两张卡片受影响。Playwright 回归：Analytics 页卡片背景色变为 `--bg-2`+标签带刻度线；Sim 页 `.sim-astat` 背景色保持 `--bg-1` 不受影响。 |
| v598 | **月度回测当月也改为默认折叠 + 修复历史月份"平仓后数值不更新"的真正 bug**：当月内容现在也包进跟历史月份同款的 `<details class="simb-current-details simb-month">` 折叠卡（复用同一套摘要行样式——月份名/净盈亏 chip/笔数），默认收起；`<details>` 元素本身懒创建一次、此后复用，内容（`curEl`）依旧每次价格轮询都整块重建，摘要行单独用 `updateCurSummary()` 逐字段更新，两者都不会重置用户手动展开的 `open` 状态。**排查"点开折叠框数值会变"的用户提问时发现的真 bug**：历史月份收起时的预览数字是同步实时算的（无网络请求，仍持仓中的部分用当下的 `pnlDollar`），点开后异步拉取月末冻结价重算，这两个数字本来就不是同一套口径，会不一样——这部分是设计如此，不是 bug。但深挖"过去的月份数值到底会不会变"时发现：`_histMonthCache` 只按 `sectionSel:monthKey` 存结果，跟里面具体是哪些仓位、状态如何完全无关——如果某个历史月份里"仍持仓中"的仓位后来真的平仓了，正确逻辑应该是从"月末价冻结估算"切换成真实 `pnlFinal`，但缓存不知道内容变了，会一直把平仓前算出的旧结果传出去，即使折叠状态下的实时预览已经正确更新成了真实盈亏。修法：在 `monthlyEntitySignature` 检测到持仓构成变化、要重建历史月份列表时，顺带把该 `sectionSel` 名下所有 `_histMonthCache` 缓存清掉，下次展开自动重新计算，宁可多算几次也不能让用户看到过期数字。Playwright 回归：真实 30 秒价格 tick 后当月折叠卡保持用户手动展开的状态不丢；构造"仍持仓中→展开缓存冻结值→仓位真实平仓（不刷新页面）→重新展开"的完整场景，修复前显示过期的冻结估算值，修复后正确显示平仓后的真实盈亏。 |
| v599 | **历史月份改为真正的定格快照，永久不再重算**：v598 的"缓存失效重算"改了一个更根本的设计问题——讨论后确认历史月份卡片该回答的问题是"该月结束时，这批仓位看起来怎么样"，是一份不该被后续事件改写的历史记录，不是"持续追踪最新状态"的实时视图；某笔仓位后来才平仓的真实结果，应该去「分析复盘/综合回测」看（那边本来就用真实 `pnlFinal`，v596 修完 `groupTrades()` 之后统计是准的），不该反过来篡改已经翻篇的月份卡片。撤销 v598 那段"账户构成变化时清空该 section 缓存"的逻辑——`_histMonthCache` 一旦算出来就永久有效，即使因为账户其他变动导致 `<details>` 节点列表重建，已经缓存过的月份重新展开时仍然直接读旧缓存，不会因为账户后续发生的事重新计算出不一样的数字，也顺带比 v598 更简单（少了一段容易出错的失效逻辑）。Playwright 回归：构造同一个"7月 GOOG 仍持仓中→展开冻结为 $0→GOOG 真实平仓 +$8990（不刷新页面）→重新展开"场景，"7月"卡片正确保持在 $0 不再跳变；同时验证「分析复盘」正确把 GOOG 计入 1 笔真实盈利——确认数据没有丢失，只是各自归位到对应的模块。 |
| v600 | **修复折叠标题行不看缓存、每次重建都现算实时预览的根本问题**：v599 修完"展开后是否会变"之后，用户追问"为什么折叠和展开的数值还是会变"——排查发现 `historicalMonthsHTML()` 的折叠标题行数字（`.simb-month-chip`）无论如何都用当下的 `h.pnlDollar` 现算一遍"实时预览"，完全不管 `_histMonthCache` 里是否已经有这个月定格好的真实结果。`histEl` 会因为账户里**任何**变动（哪怕跟这个月完全无关的新开仓/平仓）而整个重建、生成全新的 `<details>` 节点，标题行因此每次重建都被冲刷回一个新的"实时猜测"，跟已经缓存的定格值对不上——这才是"折叠态和展开态数值不一致"真正的根源：不是展开时算错了，是折叠时的标题行压根没去问缓存。修法：`historicalMonthsHTML()` 新增 `sectionSel` 参数，为每个月份先查 `_histMonthCache[sectionSel:key]`，命中就直接用缓存里的 `bucket.monthPnl`/`combinedItems.length`（不再带"≈"，因为已经是确认过的定格值），只有从未展开过的月份才现算实时预览。Playwright 回归：GOOG 仍持仓中且实时浮盈远高于冻结值的场景下，第一次展开前折叠显示"≈+$8,990"（诚实标注为估算）；展开后正确定格为"+$0"；折叠后触发一次跟7月完全无关的账户变动（8月新开一笔 MSFT）导致 `histEl` 重建，折叠标题行正确保持显示缓存的"+$0"，不再被重建冲刷回"≈+$8,990"。 |
| v601 | **期权页新增：CC 持仓卡展示正股浮盈**：此前只有"CSP被指派后持有正股"这条路径（`_optDonePosCard` 的 assigned-live 分支）会计算并展示正股浮盈（`equityPnl=(spot-strike)*shares`），标的的正股本身完全不出现在卡片上——用户手动记录的直接卖 CC（不经 CSP 指派，本来就自己持有正股）的 `_optOpenPosCard` 只展示期权腿指标（权利金/最大盈利/安全垫/时间损耗），完全看不到正股这部分的盈亏。修法：`_optOpenPosCard` 新增"正股浮盈(估)"行，`(spot - pos.underlyingAtEntry) * 100 * pos.qty`——`underlyingAtEntry` 是开 CC 仓/滚仓时 `optSpot(sym)` 抓取的现价快照（早已存在，此前只用于 `_optAnn` 年化收益的资金基数和 CC-assigned 结算分支），在这个手动记录模型里是唯一能拿到的成本基础代理。**仅对 `!pos.linkedCspId` 的直接 CC 生效**——若该 CC 挂在某笔已指派 CSP 名下（`linkedCspId` 关联），正股已经在父级"正股"卡（`_optDonePosCard` assigned-live 分支）里用真实指派价 `pos.strike` 算过一次浮盈并展示，这里跳过以避免同一批股票出现两个基于不同成本价、数字对不上的浮盈估算。样式复用 `.opts-mark-row` 布局，新增 `.opts-stock-tag` 标签（悬浮提示成本价来源为估算非真实成本）。 |
| v602 | **修复 CC 被行权后正股盈亏在结算卡/轮组卡里被重复计算的 bug**：用户追问"行权后的CC，正股的实际亏盈需要计算进去吧"，排查发现代码其实早就试图算了，但算了两遍——`settleExpiredOptions()` 在 CC 被指派（行权）时，把 `stockGain=(strike−underlyingAtEntry)×100×qty` 直接烧进了 `pos.realized`（"capture both components now"）；而 `_optPnlBreakdown()` 的 CC-assigned 分支又把 `pos.realized` 当作纯期权盈亏（`incomeLabel:"期权盈亏"`），再单独算一次同样的 `stockGain` 叠加上去当作"正股增益"——结算卡（`_optDonePosCard`）和轮组卡（`_optWheelGroupCard`，用 `cc.realized` 直接相加）显示的总盈亏因此把正股这部分数字算了两次，被行权的 CC 报出的总额系统性偏离真实值（正股涨了就虚高、跌了就虚低，且轮组卡里第二次用的还是不同基准 `csp.strike` 而非 `underlyingAtEntry`，两次数字连基准都对不上）。修法：让 `settleExpiredOptions()` 里 CC 分支的 `pos.realized` 也改为纯期权腿盈亏（`(premium−intrinsic)×100×qty`，不含正股部分），与旁边 CSP 分支的 `pos.realized=premium×100×qty`（早已是纯期权，正股单独在 `assignedExitPrice` 结算时算）保持同一套模式——正股盈亏只在下游 `_optPnlBreakdown`/`_optWheelGroupCard` 里各自按各自场景对的成本基准算一次，不再有第二个源头。`_optFinalPnl` 头部注释同步更新为"CSP 和 CC 的指派都只结算期权腿"。 |
| v603 | **修复 CC 行权后权利金被 intrinsic 错误扣减、导致总盈亏系统性偏低的 bug**：v602 只解决了"正股盈亏算两遍"，用户继续追问"权利金的计算和CC行权后已经确定的亏盈都要展示出来"，深挖 `settleExpiredOptions()` 发现 CC 分支从一开始就有第二个独立 bug——`pos.realized=(premium−intrinsic)×100×qty`，用 ITM 内在价值去扣减权利金。但实物指派（assignment）从不会从期权腿倒扣现金：期权卖方永远 100% 保留权利金，ITM 的"损失"完全体现在正股按行权价（而非市价）易手这一件事上，且这部分已经由 `stockGain=(strike−underlyingAtEntry)` 完整承担——`intrinsic` 用的是"行权价 vs 结算日市价"的差，跟 `stockGain` 用的"行权价 vs 建仓日市价"的差是两个不同维度的量，硬拼在一起会把总盈亏系统性拉低整整一个 intrinsic 的量（实测案例：权利金$2+正股$100→$105行权价的真实总收益应为$7/股，旧代码算出$2/股，只因为多减了一次$5的intrinsic）。修法：CC 分支的 `pos.realized` 改为 `premium×100×qty`（不扣intrinsic），与旁边 CSP 分支彻底对称一致；`_optPnlBreakdown` 的 CC-assigned 分支 `incomeLabel` 从"期权盈亏"更名为"期权收入"、`costLabel` 从"正股增益"更名为"正股盈亏"，与 CSP-assigned-已出仓分支的措辞完全对齐（现在两条分支在数学上和文案上都是同一套逻辑的镜像）。此修复同时连带修好了 `_optWheelGroupCard`（轮组卡）和 `_optAnn`（年化收益）里依赖 `cc.realized`/`_optFinalPnl` 的下游计算——它们此前都被同一个 intrinsic 误差污染。 |
| v604 | **CSP指派→卖CC→CC被行权 整条轮组链路的计算修正（正股盈亏单一归属 + 汇总纳入正股腿）**：用户报"整个链条计算不太对"。实测确认两个问题：①**同一批股票的盈亏被两张卡各算一次**——完整轮组里，父CSP卡按 `(assignedExitPrice−strike)` 算正股盈亏（CC被行权时 `settleExpiredOptions` 已把 CC 的行权价写进父级 `assignedExitPrice`，所以这一项已覆盖整个来回），而子CC卡又按 `(strike−underlyingAtEntry)` 再算一次同一批股票，基准还不一样。实测案例（CSP $100P 权利金$2 → 指派 → CC $105C 权利金$1.5，开CC时现价$102 → 被行权）：真实总额应为 200+150+500=**$850**，"合看"轮组卡正确显示 $850，但展开"分看"时两张子卡是 $700+$450=**$1150**，两个视图对不上。②**已结算的正股腿完全没进任何汇总**——`_optFinalPnl` 只返回纯期权腿（v602/v603 的正确设计），但汇总卡、月度明细、按标的分组全都直接用它，导致轮组里那 $500 正股收益在页面所有聚合数字里凭空消失，只有单张卡片上看得到。修法：新增 `_optOwnsStockLeg(pos)`/`_optStockPnl(pos)` 两个函数明确**正股腿单一归属规则**——CSP已出仓→归CSP（`assignedExitPrice−strike`，覆盖整个来回）；CC被行权且**无**在管父CSP（用户自己本来就持股的独立CC）→归CC（`strike−underlyingAtEntry`）；CC被行权但父CSP正在承担正股腿→归0（父级已算）；父CSP被删或未记出仓时**不让渡**，避免正股盈亏静默丢失。`_optPnlBreakdown` 两个 assigned 分支合并为一支、统一走该规则（归属方展示"正股盈亏"列，非归属方只展示"期权收入"）；`_optWheelGroupCard` 的 `stockPnl` 改用 `_optStockPnl(csp)+_optStockPnl(cc)`，使"合看"总额恒等于"分看"两张子卡之和（不再是两套各自硬编码的算法）；新增 `_optTotalPnl(pos)=期权腿+自己归属的正股腿`，`_optAnn`（年化）、月度明细、按标的分组均改用它；汇总卡新增"Settled Stock P&L · 已结算正股盈亏"分色行，首格指标由"Realized Option P&L · 已实现期权收益"改为"Realized P&L · 已实现总盈亏"并在 sub 拆出"期权 +$X · 正股 +$Y"（权利金总账的三格算式仍是纯权利金口径，不掺正股）。Playwright 回归：上述案例修复后"合看"$850 = "分看"$700+$150 = 汇总"期权+$350·正股+$500"=$850 三处完全一致；独立CC（无 `linkedCspId`）被行权仍正确保留自己的正股腿（+$300权利金+$500正股=+$800）；CSP指派后仍持股的实时卡不受影响；汇总的"已结算正股盈亏"正确只含已易手的股票、不含仍持有的浮盈。 |
| v605 | **旧版脏 `realized` 自动修复 + 核对脚本**（用户报"模拟仓已结算权利金 4680，但应该是 4528"）：v602/v603 修的是 `settleExpiredOptions()` 里**结算那一刻**的公式，但 `pos.realized` 是**写死存进 localStorage/Redis 的字段**——所有在修复之前就已经结算过的仓位，仍然带着旧公式算出的脏值（CC 指派旧公式 `=(premium−intrinsic)×100×qty + stockGain`，既多减了 intrinsic 又混进了正股腿），前端再怎么修都不会自己变回来，会长期污染「已结算权利金盈亏」及其所有下游聚合。关键观察：`realized` 的**四个写入分支全部只依赖 `premium`/`qty`/`closePremium`**，没有任何用户手输、不可重算的信息——它本质是个**缓存的派生值**，因此可以安全地无条件重算。修法：`_optMigrate()` 末尾新增自愈逻辑，对所有 `expired`/`closed`/`assigned` 仓位按当前规则重算 `realized`（到期作废与两种指派都保留 100% 权利金；买回平仓扣 `closePremium`），与存储值差 >0.005 才写回并 `saveToStorage()`——幂等，修一次之后每次渲染都是空跑。另新增 `tools/reconcile-options.js` 只读核对脚本（不随 Vercel 部署，放在 `project/` 外）：控制台粘贴即可 `console.table` 逐笔列出实盘/模拟仓每笔已结算期权的「存储值 vs 按当前规则应为 vs 差额」，直接点名是哪几笔对不上，并单独汇报已结算正股盈亏（v604 起已从权利金口径中分离）。Playwright 回归：构造一笔旧公式脏值仓位（存储 $304、应为 $152）注入后，核对脚本准确定位该笔并报出 $152 差额，打开期权页后存储值与页面「已结算权利金盈亏」双双自动修正。 |
| v606 | **期权页汇总卡主数字从「权利金净现金流」改为「综合已实现收益」**：v604 虽然已经把正股腿并进了统计，但卡片上最大、最显眼的英雄数字仍是 `netCashFlow`（纯权利金现金流，不含正股），三格算式也是"卖出总收取 − 买回总支出 = 净现金流"——用户一眼看到的仍然只是权利金那条腿。改为：卡片标题「权利金总账 Premium Ledger」→「收益总览 P&L Overview」；英雄数字改为 `realizedTotal`（TOTAL REALIZED P&L · 综合已实现收益）；主算式改为体现真实构成的 **01 期权权利金收益 + 02 正股结算收益 = 03 综合已实现**（正股为 0 时该格显示"—"并注明"暂无已易手的正股"）；原权利金现金流算式降为次级区块，加 `.opts-ledger-subhead` 小标题「权利金现金流 · Premium Cash Flow」并注明"含仍在持仓中的合约，与上方已实现口径不同"（它回答的是"实际到账多少现金"，与"已实现"口径确实不同，仍有保留价值）。因主算式已展示两条腿，删除与之重复的 `Settled Premium P&L`/`Settled Stock P&L` 两个圆点分色行（`Open Premium P&L` 保留）。6格网格首格由重复英雄数字的"Realized P&L · 已实现总盈亏"改为新增信息量的 **"Total P&L · 综合总收益"= 已实现 + 浮动**（sub 拆出两项），与第二格 Open P&L 形成"总—浮动"的递进。Playwright 回归：完整轮组（CSP权利金$200 + CC权利金$150 + 正股$500）+ 一笔带 mark 的持仓中CC（浮盈$80）场景下，英雄数字 +$850、主算式 $350+$500=$850、次级现金流 $550、综合总收益 +$930（=850+80）全部正确；桌面 1400px 与手机 390px 均无横向溢出，手机端两个算式正常纵向堆叠。 |
| v607 | **去掉"腿"这个术语 + 收益总览卡排版重做**：①**文案**——UI 里所有"两条腿/期权腿/正股腿"的说法（期权交易黑话，非交易者读不懂）统一改为"**两项来源**"「期权权利金收益」「正股结算收益」；顺带把 v606 那句偏口语的"这笔生意到目前真正落袋的钱"删掉，"未扣费用"改为更准确的"未扣手续费"，"含买回支出"改为"卖出收取扣掉买回支出"；两处仍在用"腿"的中文代码注释也一并对齐（`_optOwnsStockLeg`/`_optStockPnl` 的英文注释保留 stock leg 说法，那是给开发者看的标准术语）。②**排版**——v606 把两个结构完全相同的三格算式（`.opts-ledger-formula`）上下堆着，视觉重复且手机端要竖排成 6 格 + 4 个运算符，卡片被拉得极长；且第三格"综合已实现"与右上角英雄数字是同一个数，纯属重复。改为：主区块 `.opts-comp`「收益构成 · Composition」只放**两个来源卡片**（`.opts-comp-cell`，`--bg-2` 填充圆角，带色点+大数字+说明），合计值不再重复一遍（右上角英雄数字就是），下方新增**占比条** `.opts-comp-bar` + 图例（期权 41% · 正股 59%）直观展示收益来自哪一侧；权利金现金流从整块三格算式压缩为**单行** `.opts-cf-line`（pill标签 + 卖出总收取 − 买回总支出 = 净现金流 + 右侧灰色说明）。**占比条只在两项来源同为正时才画**——一盈一亏时占比无意义（谁占120%？），此时显示"两项来源一盈一亏，不适合按占比展示"；只有权利金无正股时显示"暂不足以计算占比"。删除随之失效的 `.opts-ledger-formula/-fcell/-fop/-fl/-fv/-fs/-subhead` 全部 CSS（含手机端两条规则）。Playwright 回归：三种场景（双正/一盈一亏/仅权利金）数值与占比条显隐均正确（41.2%/58.8% 分段宽度精确），桌面手机均无横向溢出，手机端卡片高度从 v606 的两组竖排算式显著缩短。 |

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
