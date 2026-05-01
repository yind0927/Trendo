# Trendo v6.8 Baseline Version

**记录时间**: 2026-05-01  
**基于**: v6.7-baseline (`97cdd14`)  
**当前 commit**: `5c7f08e`  
**状态**: ✅ 盈亏日历 · 历史浮盈亏 · 进度状态优化 · 手机端全面布局更新

> **注意**: "回到版本" 指的是此版本 (commit `5c7f08e`)。

---

## 相较 v6.7 新增 / 修复

### Analytics — 盈亏日历
- ✅ **月度日历卡片** — Analytics 页新增 P&L Calendar，按月展示每日已实现盈亏（绿/红色深浅按金额比例）
- ✅ **开仓标记** — 开仓日期显示 ticker 代号 + 彩色圆点，颜色按当前浮盈亏正负着色
- ✅ **月份导航** — ‹ › 切换月份，不可超过当前月，顶部显示月度总盈亏 + 胜负笔数
- ✅ **今日浮盈亏** — 今天格子显示实时当日浮盈亏（半透明，区别于已实现）
- ✅ **历史每日浮盈亏** — `/api/history.js` 通过 Yahoo Finance 拉取历史收盘价，按持仓区间计算每天贡献，进入 Analytics 页自动加载
- ✅ **实时录制备份** — 每次行情刷新后自动记录当日 delta，存入 localStorage 并纳入云同步

### 进度状态系统更新
- ✅ **Near Stop 触发范围扩大** — 区间底部 10%（原：跌破止损才触发）
- ✅ **颜色对调** — On Track → 蓝紫（accent），Near Target → 绿色
- ✅ **阈值调整** — On Track 60–90%，Near Target > 90%（原 60–95% / > 95%）

### 手机端全面布局更新
- ✅ **Analytics 指标卡** — 2 列 → 3 列，数值字号缩小适配，减少滚动距离
- ✅ **Watchlist 卡片** — flex → grid 双行结构：上排 ticker + 操作，下排数据条不再乱换行
- ✅ **Journal 卡片** — padding 收紧，meta 行间距优化
- ✅ **本周复盘 + 财报日历** — 从两列并排改为各占一行，不再挤压

### 其他修复
- ✅ **Watchlist tab 图标** — `👁` → `📋`
- ✅ **Logo 加载** — TradingView SVG 为股票主源，移除 lazy 加载
- ✅ **Journal / Watchlist logo 尺寸** — 补全 `.jc-ticker .avatar` CSS，统一 34px

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
    ├── earnings.js   # 财报日期：Finnhub → Yahoo Finance（Vercel）
    └── history.js    # 历史日线数据：Yahoo Finance（Vercel，新增）
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
git checkout 5c7f08e
# 或回到 v6.7
git checkout 97cdd14
# 或回到 v6.6
git checkout 3a3f26f
```

---

**此版本标志**: 盈亏日历 · 历史浮盈亏计算 · 进度状态重新校准 · 手机端全面优化 ✅
