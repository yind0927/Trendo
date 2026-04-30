# Trendo v6.7 Baseline Version

**记录时间**: 2026-04-30  
**基于**: v6.6-baseline (`3a3f26f`)  
**当前 commit**: `97cdd14`  
**状态**: ✅ 模拟仓跨设备同步修复 · Logo 加载优化 · Journal/Watchlist Logo 尺寸修复

> **注意**: "回到版本" 指的是此版本 (commit `97cdd14`)。

---

## 相较 v6.6 新增 / 修复

### 模拟仓跨设备同步修复
- ✅ **`applyCloudData` 无条件渲染** — 原来只有在 sim 页时才调用 `renderSim()`，导致用户在 Dashboard 同步后看不到模拟仓更新；现在无论当前页面，同步后立即写入 DOM
- ✅ **retroactive stamp 改为 epoch 0** — 原来首次打开没有 `savedAt` 的设备会打上当前时间戳，误判为比云端新而推送覆盖；改为 `1970-01-01` 确保云端数据始终优先

### Ticker Logo 加载优化
- ✅ **移除 `loading="lazy"`** — `position:absolute` 的 img 在 28px 容器内被浏览器误判为离屏，永久推迟加载；移除后立即加载
- ✅ **股票主源改为 TradingView SVG** — 覆盖率高于 FMP（含 ETF、小盘股），FMP 降为备用
- ✅ **加密货币保持 CoinCap 主源** — TradingView 加密 SVG 作备用

### Journal / Watchlist Logo 尺寸修复
- ✅ **`.jc-ticker .avatar` 补全 CSS** — 原来缺少 `position:relative; overflow:hidden` 和 img 的绝对定位约束，图片按 CDN 原始尺寸渲染（过大）；现在统一 34px，与表格风格一致

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
- ✅ 股票 / 加密货币 Logo — TradingView SVG 主源，三级 fallback，全页面一致尺寸
- ✅ Journal 页 — 持仓日志流 + Notes 编辑（与抽屉笔记同步）
- ✅ Simulation 页 — 深蓝色主题，独立模拟仓，支持加仓，跨设备同步
- ✅ Analytics 页 — 总资产曲线（日/周/月）+ 交易分析 + 动态财报日历
- ✅ Watchlist 页 — 观察标的管理
- ✅ LIVE TAPE — 实时今日涨跌幅，hover 暂停
- ✅ 实时行情 — Finnhub / Yahoo Finance / Polygon 三级优先链，每 30 秒刷新
- ✅ 跨设备同步 — Upstash Redis，密钥手动触发 / 可编辑，last-write-wins 时间戳策略
- ✅ localStorage 持久化 (`trendo_v4_*`)
- ✅ 财报日期自动获取 — Finnhub + Yahoo Finance 双源
- ✅ 手机端响应式 — 底部 Tab 栏 · FAB 开仓按钮（SVG 图标） · Modal 底部弹出 · 表格横向滚动
- ✅ 日期选择器深色主题 — color-scheme 自动适配，自定义图标

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
git checkout 97cdd14
# 或回到 v6.6
git checkout 3a3f26f
# 或回到 v6.5
git checkout 1fac508
# 或回到 v6.4
git checkout 35607f9
```

---

**此版本标志**: 模拟仓同步修复 · Logo 全页面正常显示 · 跨设备数据零丢失 ✅
