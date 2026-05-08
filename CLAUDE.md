# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Trendo** — a personal swing trading dashboard deployed as a static site on Vercel with serverless API routes. No build step, no bundler, no tests. All source lives under `project/`.

## Deployment

Push to `main` → Vercel auto-deploys. There is no `vercel.json`; Vercel detects the `project/api/` directory as serverless functions automatically.

To preview locally, use the Vercel CLI:
```
cd project && vercel dev
```

## Architecture

### Data flow

All portfolio state lives in the browser. `data.js` (loaded before `desk.js`) declares the global arrays `window.HOLDINGS`, `window.CLOSED_POSITIONS`, `window.SIM_HOLDINGS`, `window.SIM_CLOSED` on `window`, plus helper functions (`progressBucket`, `BUCKET_STATUS`, `COLS`, `DEFAULT_BX`).

`desk.js` is a single large IIFE that owns all rendering and interaction logic. It reads/writes those global arrays directly and persists them to `localStorage` via `saveToStorage()` / `loadFromStorage()`. Cloud sync is optional (Upstash Redis via `/api/data`).

### Pages

`switchPage(page)` toggles visibility of named `<div id="*-view">` elements. Pages: `desk` (main holdings table), `journal`, `sim` (paper trading), `analytics`, `watchlist`, `market`.

### Live prices

`fetchPrices()` fires every 30 s. It batches `[...SIM_HOLDINGS, ...HOLDINGS]` (SIM first to prevent cutoff), calls `/api/quote?stocks=...&crypto=...`, then calls `recomputeHolding(h, notional)` on changed positions. Max 50 stock symbols per call.

### Position state fields

Each holding `h` carries: `sym`, `name`, `kind` (`"equity"` | `"etf"` | `"crypto"`), `cost`, `last`, `qty`, `stop`, `target`, `entry`, `pnlDollar`, `pnlPct`, `prevClose`, `size` (% of notional), `bx` (BX score block), `kind`.

Closed positions add: `closedAt`, `closePrice`, `pnlFinal`.

### `progressBucket(h)` — dual-axis status

- Loss zone (`last < cost`): `lp = (cost−last)/(cost−stop)` → `"Pullback"` (<50%) or `"Near Stop"` (≥50%)
- Profit zone: `pp = (last−cost)/(target−cost)` → `"Early"` / `"Midway"` / `"On Track"` / `"Near Target"`

### Filters

Two static HTML filter groups per table (open tab / closed tab) toggled with `style.display`:
- Real holdings: `#filters-open` uses `data-filter`, `#filters-closed` uses `data-filter-closed`
- Sim: `#sim-filters-open` uses `data-simfilter`, `#sim-filters-closed` uses `data-simfilter-closed`

Closed-tab chips filter by `pnlFinal ?? pnlDollar`: `profit` (>0) / `loss` (≤0).

## Serverless API routes (`project/api/`)

| File | Purpose | Key env vars |
|------|---------|-------------|
| `quote.js` | Real-time prices — Finnhub → Yahoo Finance → Polygon fallback chain | `FINNHUB_API_KEY`, `POLYGON_API_KEY` |
| `history.js` | Historical daily closes from Yahoo Finance | — |
| `holdings.js` | Static ETF constituent weights (top 20 per fund) | — |
| `earnings.js` | Next earnings date — Finnhub → Yahoo fallback | `FINNHUB_API_KEY` |
| `feargreed.js` | CNN Fear & Greed proxy (CORS bypass) | — |
| `data.js` | Cross-device sync via Upstash Redis | `KV_REST_API_URL`, `KV_REST_API_TOKEN` |

## ETF holdings (`api/holdings.js`)

Static data, updated manually. Sources: StockAnalysis, Global X, iShares, VanEck. When updating, check current top-20 weights and note the data date at the top of the file. Covered ETFs: VOO, XLK, XLY, XLV, XLF, XLB, XLP, XLE, XLI, COPX, ITA, and others.

## Key UI patterns

- CSS variables on `:root` for the entire palette — use `var(--up)`, `var(--down)`, `var(--warn)` etc. for semantic colors. Never hardcode colors.
- `oklch()` color space throughout. Pullback = `oklch(0.76 0.13 18)`, Near Stop = `oklch(0.58 0.23 18)`.
- Density modes via `body[data-density]` and font mode via `body[data-font]` — all sizing uses CSS vars, never px literals in JS.
- `renderTable()` and `renderSimTable()` are full re-renders; call them after any state mutation.
- After adding/removing holdings always call both `render*Table()` and `render*Overview()` and `saveToStorage()`.
