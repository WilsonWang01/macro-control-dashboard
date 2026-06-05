import type { MetricDefinition } from "./types";

export const metricDefinitions: MetricDefinition[] = [
  {
    id: "ust3m",
    label: "美国国债 3个月",
    shortLabel: "UST 3M",
    group: "rates",
    unit: "percent",
    frequency: "daily",
    source: "FRED DGS3MO / U.S. Treasury",
    description: "现金利率和短端政策压力。"
  },
  {
    id: "ust2y",
    label: "美国国债 2年",
    shortLabel: "UST 2Y",
    group: "rates",
    unit: "percent",
    frequency: "daily",
    source: "FRED DGS2 / U.S. Treasury",
    description: "终端利率预期和短中期折现率锚。"
  },
  {
    id: "ust5y",
    label: "美国国债 5年",
    shortLabel: "UST 5Y",
    group: "rates",
    unit: "percent",
    frequency: "daily",
    source: "FRED DGS5 / U.S. Treasury",
    description: "成长股估值敏感的中段利率。"
  },
  {
    id: "ust10y",
    label: "美国国债 10年",
    shortLabel: "UST 10Y",
    group: "rates",
    unit: "percent",
    frequency: "daily",
    source: "FRED DGS10 / U.S. Treasury",
    description: "全市场长久期折现率与股权风险溢价锚。",
    thresholds: [{ watch: 4.6, risk: 4.75, direction: "above" }]
  },
  {
    id: "curve_10y2y",
    label: "10Y-2Y 利差",
    shortLabel: "10s2s",
    group: "rates",
    unit: "bp",
    frequency: "daily",
    source: "FRED T10Y2Y / U.S. Treasury derived",
    description: "曲线倒挂和前端紧缩压力。"
  },
  {
    id: "curve_10y3m",
    label: "10Y-3M 利差",
    shortLabel: "10s3m",
    group: "rates",
    unit: "bp",
    frequency: "daily",
    source: "FRED T10Y3M / U.S. Treasury derived",
    description: "衰退交易和曲线再陡峭化状态。"
  },
  {
    id: "ig_oas",
    label: "投资级 OAS",
    shortLabel: "IG OAS",
    group: "credit",
    unit: "bp",
    frequency: "daily",
    source: "FRED BAMLC0A0CM",
    description: "投资级企业债信用风险溢价。",
    thresholds: [{ watch: 100, risk: 130, direction: "above" }]
  },
  {
    id: "hy_oas",
    label: "高收益 OAS",
    shortLabel: "HY OAS",
    group: "credit",
    unit: "bp",
    frequency: "daily",
    source: "FRED BAMLH0A0HYM2",
    description: "风险资产融资压力和信用周期温度计。",
    thresholds: [{ watch: 350, risk: 450, direction: "above" }]
  },
  {
    id: "ig_yield",
    label: "投资级有效收益率",
    shortLabel: "IG Yield",
    group: "credit",
    unit: "percent",
    frequency: "daily",
    source: "FRED BAMLC0A0CMEY",
    description: "投资级企业融资成本。"
  },
  {
    id: "hy_yield",
    label: "高收益有效收益率",
    shortLabel: "HY Yield",
    group: "credit",
    unit: "percent",
    frequency: "daily",
    source: "FRED BAMLH0A0HYM2EY",
    description: "高收益债融资成本。"
  },
  {
    id: "bei5y",
    label: "5年盈亏平衡通胀",
    shortLabel: "5Y BEI",
    group: "inflation",
    unit: "percent",
    frequency: "daily",
    source: "FRED T5YIE",
    description: "近中期通胀补偿。"
  },
  {
    id: "bei10y",
    label: "10年盈亏平衡通胀",
    shortLabel: "10Y BEI",
    group: "inflation",
    unit: "percent",
    frequency: "daily",
    source: "FRED T10YIE",
    description: "长期通胀预期锚。"
  },
  {
    id: "vix",
    label: "VIX",
    shortLabel: "VIX",
    group: "liquidity",
    unit: "index",
    frequency: "daily",
    source: "Cboe",
    description: "标普 500 期权隐含波动率。"
  },
  {
    id: "nfci",
    label: "芝加哥联储 NFCI",
    shortLabel: "NFCI",
    group: "liquidity",
    unit: "score",
    frequency: "weekly",
    source: "FRED NFCI",
    description: "综合金融条件，0 以上代表偏紧。"
  },
  {
    id: "fed_assets",
    label: "Fed 总资产",
    shortLabel: "Fed Assets",
    group: "liquidity",
    unit: "usd_trillion",
    frequency: "weekly",
    source: "FRED WALCL",
    description: "美联储资产负债表规模。"
  },
  {
    id: "rrp",
    label: "ON RRP",
    shortLabel: "RRP",
    group: "liquidity",
    unit: "usd_billion",
    frequency: "daily",
    source: "FRED RRPONTSYD",
    description: "隔夜逆回购余额，低位代表流动性缓冲池耗尽。"
  },
  {
    id: "usdjpy",
    label: "美元/日元",
    shortLabel: "USDJPY",
    group: "japan",
    unit: "yen_per_usd",
    frequency: "daily",
    source: "FRED DEXJPUS / ECB",
    description: "弱日元与日本政策压力通道。"
  },
  {
    id: "jgb1y",
    label: "日本国债 1年",
    shortLabel: "JGB 1Y",
    group: "japan",
    unit: "percent",
    frequency: "daily",
    source: "Japan MOF",
    description: "日本短端国债收益率。"
  },
  {
    id: "jgb2y",
    label: "日本国债 2年",
    shortLabel: "JGB 2Y",
    group: "japan",
    unit: "percent",
    frequency: "daily",
    source: "Japan MOF",
    description: "日本短中端国债收益率。"
  },
  {
    id: "jgb5y",
    label: "日本国债 5年",
    shortLabel: "JGB 5Y",
    group: "japan",
    unit: "percent",
    frequency: "daily",
    source: "Japan MOF",
    description: "日本中段国债收益率。"
  },
  {
    id: "jgb10y",
    label: "日本国债 10年",
    shortLabel: "JGB 10Y",
    group: "japan",
    unit: "percent",
    frequency: "daily",
    source: "Japan MOF / FRED fallback",
    description: "日本外溢至全球长端期限溢价的核心变量。",
    thresholds: [{ watch: 2.75, risk: 3, direction: "above" }]
  },
  {
    id: "jgb30y",
    label: "日本国债 30年",
    shortLabel: "JGB 30Y",
    group: "japan",
    unit: "percent",
    frequency: "daily",
    source: "Japan MOF",
    description: "日本超长端国债收益率。"
  },
  {
    id: "jgb40y",
    label: "日本国债 40年",
    shortLabel: "JGB 40Y",
    group: "japan",
    unit: "percent",
    frequency: "daily",
    source: "Japan MOF",
    description: "日本曲线最远端压力。"
  },
  {
    id: "tic_japan_ust",
    label: "日本持有美债",
    shortLabel: "Japan TIC",
    group: "japan",
    unit: "usd_billion",
    frequency: "monthly",
    source: "U.S. Treasury TIC",
    description: "日本对美国国债持有额，慢变量。"
  },
  {
    id: "fed_upper",
    label: "联邦基金目标上限",
    shortLabel: "Fed Upper",
    group: "macro",
    unit: "percent",
    frequency: "daily",
    source: "FRED DFEDTARU",
    description: "美联储目标利率区间上限。"
  },
  {
    id: "nfp_change",
    label: "非农新增就业",
    shortLabel: "NFP",
    group: "macro",
    unit: "thousand_jobs",
    frequency: "monthly",
    source: "FRED PAYEMS derived",
    description: "非农就业月度变化，用来确认增长韧性或就业降温。"
  },
  {
    id: "ahe_mom",
    label: "平均时薪环比",
    shortLabel: "AHE MoM",
    group: "macro",
    unit: "percent",
    frequency: "monthly",
    source: "FRED CES0500000003 derived",
    description: "私人非农平均时薪月度变化，用来观察工资通胀压力。"
  },
  {
    id: "unrate",
    label: "美国失业率",
    shortLabel: "Unrate",
    group: "macro",
    unit: "percent",
    frequency: "monthly",
    source: "FRED UNRATE",
    description: "就业周期和衰退确认变量。"
  },
  {
    id: "real_gdp",
    label: "美国实际 GDP",
    shortLabel: "Real GDP",
    group: "macro",
    unit: "usd_billion",
    frequency: "quarterly",
    source: "FRED GDPC1",
    description: "实际经济增长慢变量。"
  }
];

export const metricMap = new Map(metricDefinitions.map((metric) => [metric.id, metric]));
