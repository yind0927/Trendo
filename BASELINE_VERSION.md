# Trendo v6.3 Baseline Version

**记录时间**: 2026-04-28  
**基于**: v6.2-baseline (`d027a7c`)  
**当前 commit**: `7c27bd2`  
**状态**: ✅ 股票/加密货币 Logo · 内联颜色条 · Slope 输入框着色 · 加仓功能 · 交易计划重设计 · 数据持久化修复

> **注意**: "回到版本" 指的是此版本 (commit `7c27bd2`)。

---

## 相较 v6.2 新增 / 修复

### 数据持久化彻底修复
- ✅ **启动只推送，不拉取** — 本地 localStorage 永远是数据源，部署后绝不被云端覆盖
- ✅ **`applyCloudData` 空数组保护** — 使用 `Array.isArray()` 判断，空数组不再覆盖本地有效数据
- ✅ **跨设备同步** — 在 Sync 面板输入密钥触发主动拉取，不再自动拉取

### 股票 / 加密货币 Logo
- ✅ **所有 Avatar 自动加载 Logo** — 持仓表格、持仓抽屉、模拟仓表格、已平仓均显示
  - 股票：`financialmodelingprep.com/image-stock/{SYM}.png`
  - 加密货币：`assets.coincap.io/assets/icons/{sym}@2x.png`
- ✅ **文字缩写兜底** — Logo 加载失败时自动回退至原有字母缩写

### BX 板块颜色 — 内联直选
- ✅ **12 色内联颜色条** — 取消弹出气泡，12 个色块常驻显示，点击即刻生效
- ✅ **板块名称背景着色** — 选色后 Sector Name 输入框背景同步变为对应颜色

### BX Slope 输入框着色
- ✅ **点击方向点 → 输入框背景变色** — 绿=上升、橙=中性、红=下降
- ✅ **数字与颜色完全独立** — `slope`（数值）与 `slopeDir`（方向）分别保存，互不绑定
- ✅ **CSS 类名实现** — `.tint-up / .tint-flat / .tint-down`，避免 inline `color-mix(var())` 兼容性问题

### 抽屉交易计划重设计（删除原 04 · 05 节）
- ✅ **止损价格 / 止盈价格 / 盈亏比** — 三格价格卡片，含距入场百分比
- ✅ **执行记录** — 真实数据（开仓 + 所有加仓记录），按时间顺序排列
- ✅ **Journal 笔记** — 与 Journal 页面 `journalNote` 字段共用，任一页修改同步
- ✅ **删除复盘笔记** — 移除原 05 节（复盘笔记）和 04 节（伪造时间轴）

### 加仓功能
- ✅ **加仓按钮** — 持仓抽屉顶部新增绿色「加仓」按钮（现有持仓 + 模拟仓均支持）
- ✅ **加仓弹窗** — 输入加仓价格、股数、日期
- ✅ **加权平均成本** — 自动计算新均价，更新 qty / size / risk1R
- ✅ **执行记录追加** — 加仓后立即在执行记录区显示新条目（`h.entries` 数组）

### 实时行情优化（v6.2 已完成）
- ✅ **Finnhub 实时报价** — `/api/v1/quote` 作为优先源（需 `FINNHUB_API_KEY`）
- ✅ **Yahoo Finance 无密钥备选** — Finnhub 不可用时自动回退
- ✅ **Polygon 昨收兜底** — 最终备选（免费套餐）

### 财报日期修复（v6.2 已完成）
- ✅ **Finnhub 按 symbol 过滤** — 免费套餐返回结果去噪
- ✅ **Yahoo Finance calendarEvents 备选** — Finnhub 无数据时自动使用

---

## 完整功能清单

- ✅ Portfolio Overview — 4 张总览卡 + 横向柱状图
- ✅ Holdings Table — Open / Closed 双 Tab，排序 / 筛选 / 搜索
- ✅ 5 级进度状态系统
- ✅ Open Position Modal — 新建持仓，支持美股 / ETF / 加密货币 + 入场日期 + 财报日期
- ✅ **加仓 Modal** — 加权平均成本计算，执行记录追加
- ✅ Close Position Modal — 平仓价输入 + PnL 预览
- ✅ Delete Confirm Modal
- ✅ Position Drawer — 持仓详情，支持编辑 + 平仓 + **加仓**
- ✅ BX Drawer — 内联 12 色选色 · Slope 输入框按方向着色 · 数字与颜色独立
- ✅ **股票 / 加密货币 Logo** — 所有 Avatar 自动加载，文字兜底
- ✅ Journal 页 — 持仓日志流 + Notes 编辑（与抽屉笔记同步）
- ✅ Simulation 页 — 深蓝色主题，独立模拟仓，支持加仓
- ✅ Analytics 页 — 总资产曲线（日/周/月）+ 交易分析 + 动态财报日历
- ✅ Watchlist 页 — 观察标的管理
- ✅ LIVE TAPE — 实时今日涨跌幅，hover 暂停
- ✅ 实时行情 — Finnhub / Yahoo Finance / Polygon 三级优先链，每 30 秒刷新
- ✅ 跨设备同步 — Upstash Redis，密钥手动触发，本地优先
- ✅ localStorage 持久化 (`trendo_v4_*`)
- ✅ 财报日期自动获取 — Finnhub + Yahoo Finance 双源

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
git checkout 7c27bd2
# 或回到 v6.2
git checkout d027a7c
# 或回到 v6.1
git checkout v6.1-baseline
```

---

**此版本标志**: Logo 自动加载 · 内联选色 · Slope 着色 · 加仓功能 · 交易计划重设计 · 数据零丢失 ✅
