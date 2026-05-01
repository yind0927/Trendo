# Trendo v6.9 Baseline Version

**记录时间**: 2026-05-01  
**基于**: v6.8-baseline (`5c7f08e`)  
**当前 commit**: `ca474c7`  
**状态**: ✅ PWA 支持 · Service Worker 自动更新 · 手机端 Tab Bar 修复 · 抽屉安全区 · 模拟仓表格横滑

> **注意**: "回到版本" 指的是此版本 (commit `ca474c7`)。

---

## 相较 v6.8 新增 / 修复

### PWA (Progressive Web App)
- ✅ **主屏幕安装** — 添加 `manifest.json`，支持 iOS Safari「添加到主屏幕」和 Android Chrome 安装提示
- ✅ **App 图标** — 生成 192×512 PNG 图标，渐变色铺满全框，无透明边角
- ✅ **Service Worker 自动更新** — 部署新版本后 App 内弹出「已有新版本 立即更新」提示条，无需手动重装

### 手机端 Tab Bar 稳定性
- ✅ **修复 Journal / Simulation / Watchlist 页 Tab Bar 上移** — 移除 `viewport-fit=cover`（根本原因），恢复 `position: fixed` 正确锚定
- ✅ **Tab Bar 底部间距** — 加 16px bottom padding，点击区域不再贴底边
- ✅ **切页隐藏 `<main>`** — `switchPage()` 在非 Dashboard 页隐藏 `<main>`，消除幽灵高度

### 抽屉 (Drawer) 修复
- ✅ **顶部安全区** — 抽屉 header 加 `env(safe-area-inset-top)` padding，内容不被状态栏遮挡
- ✅ **关闭残影修复** — 抽屉加 `overflow: hidden`，消除 iOS 合成层 "止" 字残影 bug
- ✅ **加仓按钮样式** — 空心绿色描框，透明背景

### 手机端布局
- ✅ **总资产 / 今日盈亏卡片** — 各占一整行，其他卡片 2 列
- ✅ **模拟仓表格横滑** — 加 `overflow-x: auto` 容器，首列 sticky 固定
- ✅ **顶部头像按钮删除** — Topbar 更简洁
- ✅ **顶部浅深模式按钮删除** — 已在 Tweaks 面板中

---

## 完整功能清单

- ✅ Portfolio Overview — 4 张总览卡 + 横向柱状图
- ✅ Holdings Table — Open / Closed 双 Tab，排序 / 筛选 / 搜索
- ✅ 5 级进度状态系统（Near Stop / Early / Midway / On Track / Near Target）
- ✅ Open Position Modal — 新建持仓，支持美股 / ETF / 加密货币 + 入场日期 + 财报日期
- ✅ 加仓 Modal — 加权平均成本计算，执行记录追加
- ✅ Close Position Modal — 平仓价输入 + PnL 预览
- ✅ Delete Confirm Modal
- ✅ Position Drawer — 持仓详情，支持编辑 + 平仓 + 加仓
- ✅ BX Drawer — 内联 12 色选色 · Slope 输入框按方向着色 · 数字与颜色独立
- ✅ 股票 / 加密货币 Logo — TradingView SVG 主源，三级 fallback，全页面一致尺寸
- ✅ Journal 页 — 持仓日志流 + Notes 编辑（与抽屉笔记同步）
- ✅ Simulation 页 — 深蓝色主题，独立模拟仓，支持加仓，跨设备同步
- ✅ Analytics 页 — 总资产曲线（日/周/月）+ 交易分析 + 盈亏日历（含历史每日浮盈亏）
- ✅ Watchlist 页 — 观察标的管理
- ✅ LIVE TAPE — 实时今日涨跌幅，hover 暂停
- ✅ 实时行情 — Finnhub / Yahoo Finance / Polygon 三级优先链，每 30 秒刷新
- ✅ 跨设备同步 — Upstash Redis，密钥手动触发 / 可编辑，last-write-wins 时间戳策略
- ✅ localStorage 持久化 (`trendo_v4_*`) + dailyPnlLog 历史录制
- ✅ 财报日期自动获取 — Finnhub + Yahoo Finance 双源
- ✅ 手机端响应式 — 底部 Tab 栏 · FAB 开仓按钮 · Modal 底部弹出 · 全页面布局优化
- ✅ PWA — 主屏幕安装 · Service Worker 自动更新提示

---

## 文件结构

```
project/
├── index.html        # 主入口，含全部 CSS + 5 个页面视图 + Modal HTML
├── data.js           # 全局数组 + BUCKET_STATUS + progressBucket + COLS
├── desk.js           # 渲染逻辑 + 交互 + 同步逻辑
├── logo.svg          # 浏览器标签页图标
├── icon-192.png      # PWA 图标 192×192
├── icon-512.png      # PWA 图标 512×512
├── manifest.json     # PWA manifest
├── sw.js             # Service Worker（网络优先 + 自动更新提示）
└── api/
    ├── quote.js      # 行情代理：Finnhub → Yahoo Finance → Polygon（Vercel）
    ├── data.js       # Upstash Redis 同步接口（GET/POST）
    ├── earnings.js   # 财报日期：Finnhub → Yahoo Finance（Vercel）
    └── history.js    # 历史日线数据：Yahoo Finance（Vercel）
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
git checkout ca474c7
# 或回到 v6.8
git checkout 5c7f08e
# 或回到 v6.7
git checkout 97cdd14
```

---

**此版本标志**: PWA 安装 · Service Worker 自动更新 · Tab Bar 稳定 · 抽屉安全区 · 手机端全面优化 ✅
