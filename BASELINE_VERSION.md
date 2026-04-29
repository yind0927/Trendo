# Trendo v6.4 Baseline Version

**记录时间**: 2026-04-29  
**基于**: v6.3-baseline (`7c27bd2`)  
**当前 commit**: `35607f9`  
**状态**: ✅ 手机端响应式布局 · Logo 双源兜底 · 同步密钥可编辑

> **注意**: "回到版本" 指的是此版本 (commit `35607f9`)。

---

## 相较 v6.3 新增 / 修复

### 手机端响应式布局
- ✅ **Viewport 修复** — 从 `width=1440` 改为 `width=device-width`，手机不再缩小渲染桌面版
- ✅ **底部 Tab 栏** — navbar 移到页面底部固定，图标 + 文字（📊📓🧪📈👁），iOS Safari 兼容
- ✅ **iOS Safari 定位 Bug 修复** — JS 在手机端将 `<nav>` 移至 `<body>` 直接子元素，避免 sticky 父元素干扰 fixed 定位
- ✅ **Overview 2 列网格** — `!important` 覆盖桌面端强制 5 列规则，手机显示 2×2
- ✅ **抽屉全屏宽** — 手机端抽屉占满屏宽
- ✅ **Modal 底部弹出** — 模态框从底部滑入，圆角顶部
- ✅ **表格横向滚动** — Ticker 列 sticky 固定，其余列可横向滑动
- ✅ **所有视图底部留白** — Journal / Sim / Analytics / Watchlist 均预留 76px 给底部 Tab 栏

### Logo 加载优化
- ✅ **两级 fallback 链** — 股票：FMP → TradingView SVG；加密货币：CoinCap → TradingView crypto SVG → 文字缩写
- ✅ **`logoImg()` 统一函数** — 所有 Avatar（表格、抽屉、Journal、Watchlist）共用同一逻辑
- ✅ **Journal / Watchlist 新增 Logo** — 之前仅显示文字缩写，现在也加载 Logo
- ✅ **`decoding="async"`** — 异步解码，不阻塞页面渲染

### 同步密钥可编辑
- ✅ **编辑已生成密钥** — Sync 面板新增编辑按钮，可自定义密钥（最少 8 位）
- ✅ **保存后立即推送** — 修改密钥后自动 syncPush，跨设备立即生效

---

## 完整功能清单

- ✅ Portfolio Overview — 4 张总览卡 + 横向柱状图
- ✅ Holdings Table — Open / Closed 双 Tab，排序 / 筛选 / 搜索
- ✅ 5 级进度状态系统
- ✅ Open Position Modal — 新建持仓，支持美股 / ETF / 加密货币 + 入场日期 + 财报日期
- ✅ 加仓 Modal — 加权平均成本计算，执行记录追加
- ✅ Close Position Modal — 平仓价输入 + PnL 预览
- ✅ Delete Confirm Modal
- ✅ Position Drawer — 持仓详情，支持编辑 + 平仓 + 加仓
- ✅ BX Drawer — 内联 12 色选色 · Slope 输入框按方向着色 · 数字与颜色独立
- ✅ 股票 / 加密货币 Logo — 两级 fallback，Journal / Watchlist 也显示
- ✅ Journal 页 — 持仓日志流 + Notes 编辑（与抽屉笔记同步）
- ✅ Simulation 页 — 深蓝色主题，独立模拟仓，支持加仓
- ✅ Analytics 页 — 总资产曲线（日/周/月）+ 交易分析 + 动态财报日历
- ✅ Watchlist 页 — 观察标的管理
- ✅ LIVE TAPE — 实时今日涨跌幅，hover 暂停
- ✅ 实时行情 — Finnhub / Yahoo Finance / Polygon 三级优先链，每 30 秒刷新
- ✅ 跨设备同步 — Upstash Redis，密钥手动触发 / 可编辑，本地优先
- ✅ localStorage 持久化 (`trendo_v4_*`)
- ✅ 财报日期自动获取 — Finnhub + Yahoo Finance 双源
- ✅ **手机端响应式** — 底部 Tab 栏 · Modal 底部弹出 · 表格横向滚动 · 2 列概览

---

## 文件结构

```
project/
├── index.html        # 主入口，含全部 CSS + 5 个页面视图 + Modal HTML
├── data.js           # 全局数组 + BUCKET_STATUS + progressBucket + COLS
├── desk.js           # 渲染逻辑 + 交互 + 同步逻辑
├── logo.svg          # 浏览器标签页图标
└── api/
    ├── quote.js      # 行情代理：Finnhub → Yahoo Finance → Polygon（Vercel）
    ├── data.js       # Upstash Redis 同步接口（GET/POST）
    └── earnings.js   # 财报日期：Finnhub → Yahoo Finance（Vercel）
```

---

## 环境变量（Vercel）

| 变量名 | 用途 |
|--------|------|
| `POLYGON_API_KEY` | Polygon.io 行情 API 密钥（兜底） |
| `KV_REST_API_URL` | Upstash Redis REST 地址 |
| `KV_REST_API_TOKEN` | Upstash Redis 写入 Token |
| `FINNHUB_API_KEY` | Finnhub 实时行情 + 财报日期（推荐配置） |

---

## 回到此版本

```bash
git checkout 35607f9
# 或回到 v6.3
git checkout 7c27bd2
# 或回到 v6.2
git checkout d027a7c
```

---

**此版本标志**: 手机端完整响应式 · Logo 双源兜底 · 同步密钥可编辑 · 数据零丢失 ✅
