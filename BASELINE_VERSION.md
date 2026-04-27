# Trendo v6.2 Baseline Version

**记录时间**: 2026-04-27  
**基于**: v6.1-baseline (`b90beab`)  
**状态**: ✅ 12色板块颜色选择器 · 斜率数字与颜色独立 · 财报自动获取

> **注意**: "回到版本" 指的是此版本 (v6.1-baseline)。

---

## 相较 v6.1 新增功能

### BX 板块颜色选择器
- ✅ **12 色颜色面板** — 点击色块弹出 4×3 颜色选择器，涵盖冷暖全色谱
- ✅ **点击外部关闭** — 在抽屉其他区域点击自动关闭颜色面板

### BX 斜率重设计
- ✅ **数字与颜色完全独立** — Slope 数字输入与红橙绿颜色点互不绑定
  - 数字输入保存 `slope` 字段（数值）
  - 颜色点保存 `slopeDir` 字段（1/0/-1，仅代表视觉方向）
- ✅ **向后兼容** — 旧数据自动从 `slope` 数值推导初始颜色点状态

### 开仓弹窗新增日期字段（v6.1）
- ✅ **入场日期选择器** — 默认今天，可回填历史日期；自动计算 `days`（持有天数）
- ✅ **财报日期字段** — 可手动填写或点击 Auto-fetch 按钮自动获取
- ✅ **Auto-fetch 按钮** — 调用 `/api/earnings` 从 Finnhub 获取下次财报日期

### 财报日期自动获取
- ✅ **Finnhub 接入** — `/api/earnings.js` Vercel 无服务器函数
  - 免费套餐使用 `/v1/calendar/earnings` 端点
  - 获取未来 365 天内最近的财报日期
  - 环境变量：`FINNHUB_API_KEY`

### 数据持久化确认
- ✅ **部署不影响数据** — localStorage `trendo_v4_*` + Upstash Redis 均在部署后保持不变
- ✅ **持仓和模拟仓数据安全** — 代码更新不会清空任何已有仓位

---

## 完整功能清单

- ✅ Portfolio Overview — 4 张总览卡 + 横向柱状图
- ✅ Holdings Table — Open / Closed 双 Tab，排序 / 筛选 / 搜索
- ✅ 5 级进度状态系统
- ✅ Open Position Modal — 新建持仓，支持美股 / ETF / 加密货币 + **入场日期 + 财报日期**
- ✅ Close Position Modal — 平仓价输入 + PnL 预览
- ✅ Delete Confirm Modal
- ✅ Position Drawer — 持仓详情，支持编辑 + 平仓
- ✅ BX Drawer — **斜率可输入数字 + 三色点双向联动**
- ✅ Journal 页 — 持仓日志流 + Notes 编辑
- ✅ Simulation 页 — 深蓝色主题，独立模拟仓，与真实仓完全相同逻辑
- ✅ Analytics 页 — 总资产曲线（日/周/月）+ 交易分析 + 动态财报日历
- ✅ Watchlist 页 — 观察标的管理
- ✅ LIVE TAPE — 实时今日涨跌幅，hover 暂停
- ✅ 实时行情 — Polygon.io 每 30 秒刷新
- ✅ 跨设备同步 — Upstash Redis，密钥授权
- ✅ localStorage 持久化 (`trendo_v4_*`)
- ✅ **财报日期自动获取** — Finnhub API (`/api/earnings`)

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
    ├── data.js       # Upstash Redis 同步接口（GET/POST）
    └── earnings.js   # Finnhub 财报日期接口（GET）
```

---

## 环境变量（Vercel）

| 变量名 | 用途 |
|--------|------|
| `POLYGON_API_KEY` | Polygon.io 行情 API 密钥 |
| `KV_REST_API_URL` | Upstash Redis REST 地址 |
| `KV_REST_API_TOKEN` | Upstash Redis 写入 Token |
| `FINNHUB_API_KEY` | Finnhub 财报日期 API 密钥（新增） |

---

## 回到此版本

```bash
git checkout v6.1-baseline
# 或回到 v6.0
git checkout v6.0-baseline
git checkout 48f3769
```

---

**此版本标志**: 斜率可输入 · 开仓日期选择 · 财报自动获取 · 数据持久化确认 ✅
