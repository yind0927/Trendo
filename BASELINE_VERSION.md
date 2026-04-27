# Trendo v5.2 Baseline Version

**记录时间**: 2026-04-27  
**Git Commit**: `48f3769`  
**Git Tag**: `v5.2-baseline`  
**状态**: ✅ 正式启用 · 实时行情 · 跨设备同步 · 已部署到 Vercel

> **注意**: "回到版本" 指的是此版本 (v5.2-baseline)。

---

## 相较 v5.1 新增功能

### 实时行情
- ✅ **Polygon.io 接入** — `/api/quote.js` Vercel 无服务器函数代理
  - 免费套餐使用 `/v2/aggs/ticker/{sym}/prev` 端点（日线数据）
  - 全仓并行请求，每 30 秒自动刷新
  - 顶栏显示 `LIVE · HH:MM` 绿色状态指示
- ✅ **实时行情播放条** — 显示持仓标的今日涨跌幅（vs 昨收），随价格更新刷新

### 跨设备同步
- ✅ **Upstash Redis 同步** — `/api/data.js` GET/POST 端点
  - 生成 `xxxx-xxxx-xxxx` 格式私密同步密钥
  - 每次保存后 2 秒防抖推送到云端
  - 页面加载时自动拉取云端数据
  - 顶栏云图标显示同步状态（绿色已同步 / 橙色连接中 / 红色失败）
  - 环境变量：`KV_REST_API_URL` + `KV_REST_API_TOKEN`

### 正式启用
- ✅ **标签栏标题** — `Trendo - Swing Trading Concepts`
- ✅ **SVG Favicon** — 与顶栏 logo 一致的浏览器标签页图标
- ✅ **清空示例数据** — HOLDINGS / CLOSED_POSITIONS / WATCHLIST 全部清空
- ✅ **总资产基准** — 默认 $60,000（原 $284,620）
- ✅ **localStorage 升级** — `trendo_v3_*` → `trendo_v4_*`，旧示例数据不再加载

### 财报日历
- ✅ **动态财报日历** — 自动从真实持仓 + 模拟仓读取 `earnings` 字段
  - 过滤未来 14 天内有财报的标的
  - 持仓来源徽章（持仓 / 模拟）
  - 天数倒计时（≤2天红色 / ≤6天橙色）
  - 按 `holdEarn` 字段显示计划决定（计划持有 / 计划减仓）
  - 无事件时显示空状态提示
- ✅ **移除最常见错误标签** — §03 REVIEW 中间面板清理

---

## 完整功能清单

- ✅ Portfolio Overview — 4 张总览卡 + 横向柱状图
- ✅ Holdings Table — Open / Closed 双 Tab，排序 / 筛选 / 搜索
- ✅ 5 级进度状态系统
- ✅ Open Position Modal — 新建持仓，支持美股 / ETF / 加密货币
- ✅ Close Position Modal — 平仓价输入 + PnL 预览
- ✅ Delete Confirm Modal
- ✅ Position Drawer — 持仓详情，支持编辑 + 平仓
- ✅ Journal 页 — 持仓日志流 + Notes 编辑
- ✅ Simulation 页 — 深蓝色主题，独立模拟仓，与真实仓完全相同逻辑
- ✅ Analytics 页 — 总资产曲线（日/周/月）+ 交易分析 + 动态财报日历
- ✅ Watchlist 页 — 观察标的管理
- ✅ LIVE TAPE — 实时今日涨跌幅，hover 暂停
- ✅ 实时行情 — Polygon.io 每 30 秒刷新
- ✅ 跨设备同步 — Upstash Redis，密钥授权
- ✅ localStorage 持久化 (`trendo_v4_*`)

---

## 全局状态

```js
let sortKey = "pnl", sortDir = -1;
let filter = "all", query = "";
let selectedSym = null;
let activeTab = "open";
let totalNotional = 60000;
let reviewPeriod = "week";
let pendingCloseSym = null;
let pendingDeleteSym = null, pendingDeleteFrom = null;
let currentPage = "desk";
let journalFilter = "all";
let equityPeriod = "week";
let simActiveTab = "open";
let simNotional = 100000;
let newPositionContext = "desk";
let pendingCloseCtx = "desk";
let pendingDeleteCtx = "desk";
let syncKey = localStorage.getItem("trendo_sync_key") || "";
```

---

## 文件结构

```
project/
├── index.html        # 主入口，含全部 CSS + 5 个页面视图 + Modal HTML
├── data.js           # 全局数组 + BUCKET_STATUS + progressBucket + COLS
├── desk.js           # 渲染逻辑 + 交互 + 同步逻辑
├── logo.svg          # 浏览器标签页图标
└── api/
    ├── quote.js      # Polygon.io 行情代理（Vercel 无服务器函数）
    └── data.js       # Upstash Redis 同步接口（GET/POST）
```

---

## 环境变量（Vercel）

| 变量名 | 用途 |
|--------|------|
| `POLYGON_API_KEY` | Polygon.io 行情 API 密钥 |
| `KV_REST_API_URL` | Upstash Redis REST 地址 |
| `KV_REST_API_TOKEN` | Upstash Redis 写入 Token |

---

## 回到此版本

```bash
git checkout v5.2-baseline
# 或
git checkout 48f3769
```

---

**此版本标志**: 正式启用 · 实时行情 · 跨设备同步 · 动态财报日历 ✅
