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
