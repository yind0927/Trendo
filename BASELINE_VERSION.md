# Trendo v1.0 Baseline Version

**记录时间**: 2026-04-23  
**Git Commit**: `44c1f78`  
**Git Tag**: `v1.0-baseline`  
**状态**: ✅ 完全功能 + 已部署到 Vercel

## 功能清单

### 核心功能
- ✅ **Portfolio Overview** — 6张总览卡 + 饼图分布
  - 总资产 (Equity NAV)
  - 今日盈亏
  - 总浮盈/浮亏
  - 当前持仓数
  - 总风险敞口
  - 本周纪律分

- ✅ **Holdings Table** — 15笔持仓 + 完整交互
  - 排序、筛选、搜索
  - 实时 sparkline
  - R倍数可视化
  - 状态标签（5种）
  
- ✅ **Position Drawer** — 5个部分详情面板
  - §01 持仓概况
  - §02 **BX Trend & 市场背景**（新功能）
    - Daily BX: 0-5 / 5-15 / 15+ bars
    - Weekly BX: -2 Bearish 到 +2 Bullish
    - Monthly BX: 同周线BX
    - Sector: 颜色、名称、得分、斜率
    - Overall vs VOO: 得分、斜率
  - §03 交易计划
  - §04 执行记录（时间轴）
  - §05 复盘笔记

- ✅ **Weekly Review** — 本周统计
  - 胜率、平均盈亏比、平均持仓天数
  - Setup 表现对比
  - 错误标签云
  - 事件日历（财报提醒）
  - Setup 冠亚军

### 设计与交互
- ✅ **深色/浅色主题** — 完整响应
- ✅ **3档信息密度** — compact/medium/loose
- ✅ **字体切换** — Sans-heavy / Mono-heavy
- ✅ **强调色调节** — 0-360° 色相滑杆
- ✅ **表格列隐显** — 12列可选
- ✅ **Tweaks 面板** — 右下角齿轮
- ✅ **键盘快捷键** — `/` 搜索，`Esc` 关抽屉
- ✅ **LIVE TAPE** — 顶部行情条滚动

### 数据层
- ✅ **15笔持仓** — 10美股 + 5加密
- ✅ **完整BX数据** — 所有15笔持仓都有BX Trend值
- ✅ **模拟数据** — 交易计划、执行记录、复盘笔记

## 技术栈

| 层 | 技术 |
|---|---|
| **HTML** | Semantic HTML5，无框架 |
| **CSS** | OKLCH 颜色系统，CSS 变量，深浅主题 |
| **JS** | Vanilla JS (IIFE)，无依赖 |
| **字体** | Geist Sans, JetBrains Mono |
| **部署** | Vercel (静态站点) |

## 文件结构

```
project/
├── index.html          # 主入口 (原 Dashboard.html)
├── data.js             # 15笔持仓 + 配置 + BX数据
├── desk.js             # 渲染逻辑 + BX交互
└── scraps/             # 设计稿 (napkin 文件)
```

## BX Trend 实现细节

**新增字段到每笔持仓**:
```js
h.bx = {
  dailyBars: "5-15",  // "0-5" | "5-15" | "15+"
  weekly: 2,          // -2..+2
  monthly: 2,         // -2..+2
  sector: {
    name: "Semi / AI",
    color: "oklch(...)",
    score: "82",
    slope: "up"       // "up" | "flat" | "down"
  },
  overall: {
    score: "75",
    slope: "up"
  }
}
```

**交互**:
- 点击 Daily BX 按钮：切换bars桶
- 点击 Weekly/Monthly 按钮：切换BX分数 (-2..+2)
- 点击 Sector 颜色块：循环8个预设颜色
- 编辑 Sector 名称：contenteditable
- 编辑 Score 数字：contenteditable，blur时保存
- 点击 Slope 按钮：循环 up → flat → down

## 关键CSS类

| 类 | 用途 |
|---|---|
| `.bx-row` | BX行容器 |
| `.bx-daily-btn` | 日线BX按钮 (3个) |
| `.bx-score-btn` | BX分数按钮 (5个，有5种颜色状态) |
| `.bx-swatch` | 颜色选择器 |
| `.bx-chip-score` | 得分输入 |
| `.bx-chip-slope` | 斜率指示 |

## 已知限制

1. **无持久化** — 刷新页面BX更改会丢失（在内存中）
2. **无后端** — 所有数据都是前端模拟
3. **静态数据** — 15笔持仓是硬编码的

## 回到此版本

如果后续修改了代码，要回到这个基线版本：

```bash
# 查看标签
git tag -l

# 检出此版本
git checkout v1.0-baseline

# 或看日志
git log --oneline | grep "Rename Dashboard"
```

## 部署信息

- **Vercel 项目**: yind0927/Trendo
- **连接状态**: GitHub 自动部署
- **Root Directory**: project/
- **Entry Point**: index.html
- **构建命令**: (无，静态站点)

---

**此版本标志**: 功能完整 + 设计精致 + 已投产 ✅
