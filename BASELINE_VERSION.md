# Trendo v6.5 Baseline Version

**记录时间**: 2026-04-29  
**基于**: v6.4-baseline (`35607f9`)  
**当前 commit**: `1fac508`  
**状态**: ✅ 手机端 FAB 开仓按钮 · 手机端响应式布局 · Logo 双源兜底 · 同步密钥可编辑

> **注意**: "回到版本" 指的是此版本 (commit `1fac508`)。

---

## 相较 v6.4 新增

### 手机端 FAB 开仓按钮
- ✅ **浮动圆形 ＋ 按钮** — 固定在底部 Tab 栏上方（bottom: 86px / right: 20px）
- ✅ **点击打开新建持仓弹窗** — 与桌面端 "Open Position" 按钮功能完全一致
- ✅ **桌面端自动隐藏** — `@media (min-width: 769px)` 强制不显示
- ✅ **点击缩放反馈** — `:active` 缩至 90%，有触觉感

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
- ✅ 手机端响应式 — 底部 Tab 栏 · FAB 开仓按钮 · Modal 底部弹出 · 表格横向滚动 · 2 列概览

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
git checkout 1fac508
# 或回到 v6.4
git checkout 35607f9
# 或回到 v6.3
git checkout 7c27bd2
```

---

**此版本标志**: 手机端 FAB 开仓 · 响应式布局 · Logo 双源兜底 · 数据零丢失 ✅
