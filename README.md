# 宏观利率风险监控 Dashboard

本地 Web App，用于监控美债曲线、信用利差、通胀补偿、日本国债/汇率外溢、流动性和宏观确认信号。输出是研究监控信号，不构成自动交易或投资建议。

界面采用中文三页签：`总览` 聚合核心联动模块和指标解读，`联动监控` 集中展示图表和关键指标，`规则与数据` 展示阈值和数据源健康。

## Run

```bash
npm install
npm run dev
```

默认地址：

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8787`

可选配置：

```bash
cp .env.example .env
```

`FRED_API_KEY` 留空时，服务端会使用 FRED 的公开 CSV graph endpoint；填写后使用 FRED 官方 API。

## Data Sources

- FRED: 美债、曲线、ICE BofA 信用、BEI、NFCI、Fed 资产负债表、RRP、USDJPY、失业率、GDP、Fed target upper。
- Cboe: VIX historical daily CSV。
- Japan MOF: JGB current month CSV，包含 1Y/2Y/5Y/10Y/30Y/40Y。
- U.S. Treasury TIC: Major Foreign Holders table，月频慢变量。
- U.S. Treasury rates: Daily Treasury Par Yield Curve XML，用作美债 3M/2Y/5Y/10Y 的更高优先级补充源；失败时不阻断 FRED。
- ECB FX: EUR reference rates 计算 USDJPY，用作 FRED DEXJPUS 的更高频补充源。

缓存写入 `.cache/macro-data.json`。`GET /api/dashboard` 会优先使用 6 小时内缓存；`POST /api/refresh` 强制刷新。

## API

- `GET /api/dashboard`: 当前快照、综合分数、剧本、告警、图表和数据源状态。
- `POST /api/refresh`: 强制刷新所有数据源并返回新快照。
- `GET /api/series?ids=ust10y,hy_oas&start=2025-01-01`: 标准化时间序列。
- `GET /api/sources`: 数据源健康。

## Risk Rules

- UST10Y: `>4.60%` watch，`>4.75%` risk；5 个观测点上行 `>=20bp` watch。
- 10s3m: `<25bp` watch，`<0bp` risk。
- 10s2s: `<-25bp` watch。
- HY OAS: `>350bp` watch，`>450bp` risk/crisis。
- IG OAS: `>100bp` watch，`>130bp` risk。
- 5Y BEI: `>2.80%` watch；`<2.40%` growth-friendly。
- JGB10Y: `>2.75%` watch，`>3.00%` risk。
- USDJPY: `>158` watch，`>160` risk。
- VIX: `>22` watch，`>30` risk。
- NFCI: `>0` watch。
- RRP: `<$10B` 仅提示缓冲池偏低。
- Unrate: 3 个月均值较 12 个月低点上升 `>=0.3pp` watch，`>=0.5pp` risk。

综合分数权重：利率/曲线 30%，信用 25%，通胀 15%，日本/汇率 15%，流动性/波动 10%，宏观 5%。

## Scripts

```bash
npm run dev
npm run build
npm run test
npm run refresh:daily
```

`npm run refresh:daily` 会强制刷新数据、重新计算所有指标解读，并把完整快照写入 `.cache/latest-dashboard-snapshot.json`，供每日定时任务使用。
