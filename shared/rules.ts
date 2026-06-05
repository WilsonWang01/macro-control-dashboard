import { metricDefinitions, metricMap } from "./metrics";
import type {
  Alert,
  ChartPoint,
  DashboardInterpretation,
  DashboardSnapshot,
  MetricDefinition,
  MetricGroup,
  MetricInterpretation,
  MetricSnapshot,
  MetricUnit,
  Observation,
  RiskState,
  SourceStatus
} from "./types";

const categoryWeights: Record<MetricGroup, number> = {
  rates: 30,
  credit: 25,
  inflation: 15,
  japan: 15,
  liquidity: 10,
  macro: 5,
  crosscheck: 0
};

const orderedStates: RiskState[] = ["normal", "watch", "risk", "crisis"];

export function evaluateDashboard(
  observations: Observation[],
  sourceStatuses: SourceStatus[] = []
): DashboardSnapshot {
  const grouped = groupByMetric(observations);
  const metrics = buildMetricSnapshots(grouped);
  const alerts: Alert[] = [];
  const categorySeverity: Record<MetricGroup, number> = {
    rates: 0,
    credit: 0,
    inflation: 0,
    japan: 0,
    liquidity: 0,
    macro: 0,
    crosscheck: 0
  };

  const addAlert = (alert: Alert, severity: number) => {
    alerts.push(alert);
    categorySeverity[alert.category] = Math.max(categorySeverity[alert.category], severity);
  };

  const ust10y = latest(metrics, "ust10y");
  const ust10yChange = metrics.ust10y?.change5d;
  const curve10y3m = latest(metrics, "curve_10y3m");
  const curve10y2y = latest(metrics, "curve_10y2y");
  const hyOas = latest(metrics, "hy_oas");
  const igOas = latest(metrics, "ig_oas");
  const hyChange = metrics.hy_oas?.change5d;
  const bei5y = latest(metrics, "bei5y");
  const vix = latest(metrics, "vix");
  const nfci = latest(metrics, "nfci");
  const rrp = latest(metrics, "rrp");
  const jgb10y = latest(metrics, "jgb10y");
  const usdjpy = latest(metrics, "usdjpy");
  const nfpChange = latest(metrics, "nfp_change");
  const aheMom = latest(metrics, "ahe_mom");
  const unrate = latest(metrics, "unrate");
  const ust2yChange1d = oneObservationChange(metrics, "ust2y");
  const ust10yChange1d = oneObservationChange(metrics, "ust10y");

  if (ust10y !== undefined && ust10y > 4.75) {
    setMetricStatus(metrics, "ust10y", "risk", "10Y 高于 4.75%，估值折现压力进入红区。");
    addAlert(
      makeAlert("ust10y-risk", "risk", "rates", ["ust10y"], "10Y 美债进入高压区", `10Y 美债为 ${fmt(ust10y)}%，高于 4.75% 红线。`, "继续压低长久期成长暴露，优先观察信用是否跟坏。"),
      1
    );
  } else if (ust10y !== undefined && ust10y > 4.6) {
    setMetricStatus(metrics, "ust10y", "watch", "10Y 高于 4.60%，估值压力增大。");
    addAlert(
      makeAlert("ust10y-watch", "watch", "rates", ["ust10y"], "10Y 美债高于预警线", `10Y 美债为 ${fmt(ust10y)}%，高于 4.60%。`, "降低估值扩张假设，观察 5Y/10Y 是否继续同步上行。"),
      0.55
    );
  }

  if (ust10yChange !== undefined && ust10yChange >= 0.2) {
    setMetricStatus(metrics, "ust10y", maxState(metrics.ust10y?.status, "watch"), "10Y 五个观测点上行超过 20bp。");
    addAlert(
      makeAlert("ust10y-momentum", "watch", "rates", ["ust10y"], "10Y 美债快速上行", `10Y 美债 5 个观测点变化为 ${fmt(ust10yChange * 100)}bp。`, "把这次调整优先解释为估值折现率冲击，而非信用危机。"),
      0.45
    );
  }

  if (
    nfpChange !== undefined &&
    nfpChange >= 150 &&
    (unrate ?? 99) <= 4.5 &&
    ((ust2yChange1d ?? 0) >= 0.08 || (ust10yChange1d ?? 0) >= 0.05)
  ) {
    setMetricStatus(metrics, "nfp_change", "watch", "非农新增就业高于 15 万，同时失业率没有上行。");
    setMetricStatus(metrics, "ust2y", maxState(metrics.ust2y?.status, "watch"), "2Y 美债单日上行，市场重新压低降息预期。");
    setMetricStatus(metrics, "ust10y", maxState(metrics.ust10y?.status, "watch"), "10Y 美债跟随非农走高，估值折现率压力上升。");
    if (aheMom !== undefined && aheMom >= 0.3) {
      setMetricStatus(metrics, "ahe_mom", "watch", "平均时薪环比不低，工资通胀没有给 Fed 明显宽松空间。");
    }
    addAlert(
      makeAlert(
        "jobs-rates-repricing",
        "watch",
        "rates",
        ["nfp_change", "unrate", "ahe_mom", "ust2y", "ust10y"],
        "强非农推动利率再定价",
        [
          `非农新增 ${fmt(nfpChange)}k`,
          `失业率 ${unrate !== undefined ? `${fmt(unrate)}%` : "--"}`,
          ust2yChange1d !== undefined ? `2Y 单日 ${formatMetricChange(ust2yChange1d, "percent")}` : "",
          ust10yChange1d !== undefined ? `10Y 单日 ${formatMetricChange(ust10yChange1d, "percent")}` : ""
        ].filter(Boolean).join("，") + "。",
        "把当前压力优先归因为 higher-for-longer 和估值折现率，而不是信用危机。"
      ),
      0.55
    );
  }

  if (curve10y3m !== undefined && curve10y3m < 0) {
    setMetricStatus(metrics, "curve_10y3m", "risk", "10s3m 重新转负。");
    addAlert(
      makeAlert("curve-10y3m-risk", "risk", "rates", ["curve_10y3m"], "10s3m 重新倒挂", `10s3m 为 ${fmt(curve10y3m)}bp。`, "观察是否由前端重新主导紧缩交易。"),
      0.85
    );
  } else if (curve10y3m !== undefined && curve10y3m < 25) {
    setMetricStatus(metrics, "curve_10y3m", "watch", "10s3m 接近零轴。");
    addAlert(
      makeAlert("curve-10y3m-watch", "watch", "rates", ["curve_10y3m"], "10s3m 接近零轴", `10s3m 为 ${fmt(curve10y3m)}bp，低于 25bp。`, "观察曲线是否从再陡峭化切回倒挂压力。"),
      0.5
    );
  }

  if (curve10y2y !== undefined && curve10y2y < -25) {
    setMetricStatus(metrics, "curve_10y2y", "watch", "10s2s 低于 -25bp。");
    addAlert(
      makeAlert("curve-10y2y-watch", "watch", "rates", ["curve_10y2y"], "10s2s 深度倒挂", `10s2s 为 ${fmt(curve10y2y)}bp。`, "提高对前端紧缩和增长回落叙事的关注。"),
      0.45
    );
  }

  if (hyOas !== undefined && hyOas > 450) {
    setMetricStatus(metrics, "hy_oas", "crisis", "HY OAS 高于 450bp，信用压力进入防守区。");
    addAlert(
      makeAlert("hy-oas-crisis", "crisis", "credit", ["hy_oas"], "高收益信用利差进入红区", `HY OAS 为 ${fmt(hyOas)}bp，高于 450bp。`, "把判断从估值修正切换到信用风险防守。"),
      1
    );
  } else if (hyOas !== undefined && hyOas > 350) {
    setMetricStatus(metrics, "hy_oas", "watch", "HY OAS 高于 350bp。");
    addAlert(
      makeAlert("hy-oas-watch", "watch", "credit", ["hy_oas"], "高收益信用利差走阔", `HY OAS 为 ${fmt(hyOas)}bp，高于 350bp。`, "降低总股票风险，观察 VIX 和失业率是否确认。"),
      0.55
    );
  }

  if (igOas !== undefined && igOas > 130) {
    setMetricStatus(metrics, "ig_oas", "risk", "IG OAS 高于 130bp。");
    addAlert(
      makeAlert("ig-oas-risk", "risk", "credit", ["ig_oas"], "投资级信用同步走弱", `IG OAS 为 ${fmt(igOas)}bp，高于 130bp。`, "确认融资条件是否由高收益扩散到优质信用。"),
      0.8
    );
  } else if (igOas !== undefined && igOas > 100) {
    setMetricStatus(metrics, "ig_oas", "watch", "IG OAS 高于 100bp。");
    addAlert(
      makeAlert("ig-oas-watch", "watch", "credit", ["ig_oas"], "投资级信用利差预警", `IG OAS 为 ${fmt(igOas)}bp。`, "关注信用走弱是否从边缘资产扩散。"),
      0.45
    );
  }

  if (hyChange !== undefined && hyChange > 30) {
    setMetricStatus(metrics, "hy_oas", maxState(metrics.hy_oas?.status, "watch"), "HY OAS 五个观测点走阔超过 30bp。");
    addAlert(
      makeAlert("hy-oas-momentum", "watch", "credit", ["hy_oas"], "高收益信用快速走阔", `HY OAS 5 个观测点变化为 ${fmt(hyChange)}bp。`, "检查这是否由个别事件扩散成系统性融资压力。"),
      0.5
    );
  }

  if (bei5y !== undefined && bei5y > 2.8) {
    setMetricStatus(metrics, "bei5y", "watch", "5Y BEI 高于 2.80%。");
    addAlert(
      makeAlert("bei5y-watch", "watch", "inflation", ["bei5y"], "近端通胀补偿偏高", `5Y BEI 为 ${fmt(bei5y)}%。`, "美联储宽松托底概率下降，继续压低估值扩张假设。"),
      0.55
    );
  } else if (bei5y !== undefined && bei5y < 2.4) {
    setMetricStatus(metrics, "bei5y", "normal", "5Y BEI 低于 2.40%，对成长估值更友好。");
  }

  if (jgb10y !== undefined && jgb10y > 3) {
    setMetricStatus(metrics, "jgb10y", "risk", "JGB 10Y 高于 3.00%。");
    addAlert(
      makeAlert("jgb10y-risk", "risk", "japan", ["jgb10y"], "JGB 10Y 进入红区", `JGB 10Y 为 ${fmt(jgb10y)}%，高于 3.00%。`, "上修全球长端期限溢价和日资回流风险。"),
      1
    );
  } else if (jgb10y !== undefined && jgb10y > 2.75) {
    setMetricStatus(metrics, "jgb10y", "watch", "JGB 10Y 高于 2.75%。");
    addAlert(
      makeAlert("jgb10y-watch", "watch", "japan", ["jgb10y"], "JGB 10Y 高于外溢阈值", `JGB 10Y 为 ${fmt(jgb10y)}%。`, "同步观察 USDJPY 与 UST10Y 是否形成三角联动。"),
      0.6
    );
  }

  if (usdjpy !== undefined && usdjpy > 160) {
    setMetricStatus(metrics, "usdjpy", "risk", "USDJPY 高于 160。");
    addAlert(
      makeAlert("usdjpy-risk", "risk", "japan", ["usdjpy"], "美元/日元进入干预敏感区", `USDJPY 为 ${fmt(usdjpy)}。`, "提高对日元套息交易和日本政策反应的监控频率。"),
      0.9
    );
  } else if (usdjpy !== undefined && usdjpy > 158) {
    setMetricStatus(metrics, "usdjpy", "watch", "USDJPY 高于 158。");
    addAlert(
      makeAlert("usdjpy-watch", "watch", "japan", ["usdjpy"], "美元/日元接近外溢阈值", `USDJPY 为 ${fmt(usdjpy)}。`, "若 JGB 同步上行，按日本外溢剧本处理。"),
      0.55
    );
  }

  if (vix !== undefined && vix > 30) {
    setMetricStatus(metrics, "vix", "risk", "VIX 高于 30，进入危机交易区。");
    addAlert(
      makeAlert("vix-risk", "risk", "liquidity", ["vix"], "波动率进入红区", `VIX 为 ${fmt(vix)}，高于 30。`, "检查期权保护、现金缓冲和信用指标是否同步恶化。"),
      1
    );
  } else if (vix !== undefined && vix > 22) {
    setMetricStatus(metrics, "vix", "watch", "VIX 高于 22。");
    addAlert(
      makeAlert("vix-watch", "watch", "liquidity", ["vix"], "波动率进入预警区", `VIX 为 ${fmt(vix)}。`, "风险偏好开始降温，观察是否扩散到信用。"),
      0.55
    );
  }

  if (nfci !== undefined && nfci > 0) {
    setMetricStatus(metrics, "nfci", "watch", "NFCI 高于 0，金融条件不再偏松。");
    addAlert(
      makeAlert("nfci-watch", "watch", "liquidity", ["nfci"], "金融条件转紧", `NFCI 为 ${fmt(nfci)}。`, "确认流动性压力是否开始影响信用和股票波动。"),
      0.5
    );
  }

  if (rrp !== undefined && rrp < 10) {
    setMetricStatus(metrics, "rrp", "watch", "RRP 低于 100 亿美元，流动性缓冲池偏低。");
    alerts.push(
      makeAlert("rrp-low", "watch", "liquidity", ["rrp"], "RRP 缓冲池接近耗尽", `ON RRP 为 ${fmt(rrp)} 十亿美元。`, "这是缓冲池提示，不单独升级为红色风险。")
    );
  }

  const unrateSeverity = evaluateUnemployment(grouped.get("unrate") ?? []);
  if (unrateSeverity) {
    setMetricStatus(metrics, "unrate", unrateSeverity.state, unrateSeverity.note);
    addAlert(
      makeAlert("unrate-rule", unrateSeverity.state, "macro", ["unrate"], "失业率触发周期预警", unrateSeverity.note, "若信用同步走阔，把风险判断从估值修正转向盈利/融资下修。"),
      unrateSeverity.state === "risk" ? 1 : 0.55
    );
  }

  if (
    hyOas !== undefined &&
    hyOas > 450 &&
    vix !== undefined &&
    vix > 30
  ) {
    addAlert(
      makeAlert("credit-vix-crisis", "crisis", "credit", ["hy_oas", "vix"], "信用与波动率共振", "HY OAS 和 VIX 同时进入红区。", "把看板剧本切换为信用风险/危机交易，优先管总风险。"),
      1
    );
  }

  if (
    jgb10y !== undefined &&
    jgb10y > 2.75 &&
    usdjpy !== undefined &&
    usdjpy > 158 &&
    (ust10yChange ?? 0) > 0
  ) {
    addAlert(
      makeAlert("japan-spillover-combo", "risk", "japan", ["jgb10y", "usdjpy", "ust10y"], "日本外溢组合触发", "JGB、USDJPY 与 UST10Y 形成同向压力。", "把美债长端上行优先视为全球期限溢价冲击。"),
      1
    );
  }

  const riskScore = scoreFromSeverity(categorySeverity);
  const riskState = stateFromScore(riskScore, alerts);
  const { regime, regimeNote } = classifyRegime(metrics);
  const actions = buildActions(regime, riskState, alerts);
  const generatedAt = new Date().toISOString();

  return {
    generatedAt,
    riskScore,
    riskState,
    regime,
    regimeNote,
    failedSources: sourceStatuses.filter((source) => !source.ok).length,
    alerts: alerts.sort((a, b) => orderedStates.indexOf(b.level) - orderedStates.indexOf(a.level)),
    actions,
    metrics,
    sourceStatuses,
    charts: buildCharts(grouped),
    interpretation: buildDashboardInterpretation({
      generatedAt,
      metrics,
      alerts,
      regime,
      regimeNote,
      riskState,
      riskScore
    })
  };
}

export function groupByMetric(observations: Observation[]): Map<string, Observation[]> {
  const map = new Map<string, Observation[]>();
  for (const observation of observations) {
    const existing = map.get(observation.metricId) ?? [];
    existing.push(observation);
    map.set(observation.metricId, existing);
  }

  for (const [metricId, series] of map.entries()) {
    map.set(
      metricId,
      series
        .filter((point) => Number.isFinite(point.value))
        .sort((a, b) => a.date.localeCompare(b.date))
    );
  }

  return map;
}

export function buildMetricSnapshots(grouped: Map<string, Observation[]>): Record<string, MetricSnapshot> {
  const snapshots: Record<string, MetricSnapshot> = {};
  for (const definition of metricDefinitions) {
    const series = grouped.get(definition.id) ?? [];
    const latestPoint = series.at(-1);
    const previousPoint = series.at(-2);
    const fiveBack = series.at(-6);
    const monthBack = series.at(-22);
    snapshots[definition.id] = {
      definition,
      latest: latestPoint,
      previous: previousPoint,
      change5d:
        latestPoint && fiveBack ? latestPoint.value - fiveBack.value : undefined,
      change1m:
        latestPoint && monthBack ? latestPoint.value - monthBack.value : undefined,
      percentile: latestPoint ? percentile(series, latestPoint.value) : undefined,
      status: latestPoint ? "normal" : "watch",
      note: latestPoint ? undefined : "暂无可用数据。"
    };
  }

  return snapshots;
}

function latest(metrics: Record<string, MetricSnapshot>, metricId: string): number | undefined {
  return metrics[metricId]?.latest?.value;
}

function oneObservationChange(metrics: Record<string, MetricSnapshot>, metricId: string): number | undefined {
  const latestPoint = metrics[metricId]?.latest;
  const previousPoint = metrics[metricId]?.previous;
  return latestPoint && previousPoint ? latestPoint.value - previousPoint.value : undefined;
}

function setMetricStatus(
  metrics: Record<string, MetricSnapshot>,
  metricId: string,
  status: RiskState,
  note: string
) {
  const metric = metrics[metricId];
  if (!metric) return;
  metric.status = maxState(metric.status, status);
  metric.note = metric.note && metric.note !== note ? `${metric.note} ${note}` : note;
}

function maxState(a: RiskState = "normal", b: RiskState): RiskState {
  return orderedStates[Math.max(orderedStates.indexOf(a), orderedStates.indexOf(b))] ?? b;
}

function makeAlert(
  id: string,
  level: RiskState,
  category: MetricGroup,
  metricIds: string[],
  title: string,
  message: string,
  action: string
): Alert {
  return { id, level, category, metricIds, title, message, action };
}

function scoreFromSeverity(categorySeverity: Record<MetricGroup, number>): number {
  const raw = Object.entries(categoryWeights).reduce((sum, [group, weight]) => {
    return sum + weight * categorySeverity[group as MetricGroup];
  }, 0);

  return Math.min(100, Math.round(raw));
}

function stateFromScore(score: number, alerts: Alert[]): RiskState {
  if (alerts.some((alert) => alert.level === "crisis")) return "crisis";
  if (alerts.some((alert) => alert.level === "risk")) return "risk";
  if (score >= 75) return "crisis";
  if (score >= 50) return "risk";
  if (score >= 25) return "watch";
  if (score >= 15 && alerts.some((alert) => alert.level === "watch")) return "watch";
  return "normal";
}

function classifyRegime(metrics: Record<string, MetricSnapshot>) {
  const ust10y = latest(metrics, "ust10y");
  const ust10yChange = metrics.ust10y?.change5d ?? 0;
  const ust2yChange1d = oneObservationChange(metrics, "ust2y") ?? 0;
  const ust10yChange1d = oneObservationChange(metrics, "ust10y") ?? 0;
  const hyOas = latest(metrics, "hy_oas");
  const vix = latest(metrics, "vix");
  const jgb10y = latest(metrics, "jgb10y");
  const usdjpy = latest(metrics, "usdjpy");
  const bei5y = latest(metrics, "bei5y");
  const nfpChange = latest(metrics, "nfp_change");
  const unrate = latest(metrics, "unrate");

  if ((hyOas ?? 0) > 450 && (vix ?? 0) > 30) {
    return {
      regime: "信用风险/危机交易",
      regimeNote: "信用利差和波动率同时进入红区，估值修正已升级为融资和风险偏好问题。"
    };
  }

  if ((jgb10y ?? 0) > 2.75 && (usdjpy ?? 0) > 158 && ust10yChange > 0) {
    return {
      regime: "日本外溢",
      regimeNote: "JGB、USDJPY 与 UST10Y 联动增强，长端期限溢价是第一观察变量。"
    };
  }

  if (
    (nfpChange ?? 0) >= 150 &&
    (unrate ?? 99) <= 4.5 &&
    (ust2yChange1d >= 0.08 || ust10yChange1d >= 0.05) &&
    (hyOas ?? 999) < 350 &&
    (vix ?? 99) < 22
  ) {
    return {
      regime: "强就业利率再定价",
      regimeNote: "非农强于趋势且失业率稳定，市场通过 2Y/10Y 上行重新定价 Fed 路径；这更像估值折现率压力，而不是信用或衰退危机。"
    };
  }

  if (((ust10y ?? 0) > 4.6 || ust10yChange >= 0.2) && (hyOas ?? 0) < 350) {
    return {
      regime: "坏陡峭化",
      regimeNote: "长端利率已是明确黄灯，主要压力在估值折现率和期限溢价；信用仍稳只说明尚未扩散为系统性信用危机。"
    };
  }

  if ((bei5y ?? 99) < 2.4 && (ust10y ?? 99) < 4.1 && (hyOas ?? 999) < 300) {
    return {
      regime: "成长友好回落",
      regimeNote: "通胀补偿和长端利率回落，同时信用未恶化，成长久期资产环境改善。"
    };
  }

  return {
    regime: "中性震荡",
    regimeNote: "核心指标未形成单一强剧本，继续观察长端利率、信用和日本外溢三条线。"
  };
}

function buildActions(regime: string, riskState: RiskState, alerts: Alert[]): string[] {
  const actions = new Set<string>();

  if (regime === "坏陡峭化") {
    actions.add("把利率端压力当成当前主风险源，不把它简单视为噪声。");
    actions.add("短线先调结构，降低长久期成长和高估值暴露。");
    actions.add("信用未转坏前，不把本轮直接解释为系统性熊市。");
  }

  if (regime === "强就业利率再定价") {
    actions.add("把强非农后的利率上行视为当前主压力，不把它简单归为风险偏好恶化。");
    actions.add("降低对快速降息和估值扩张的依赖，优先控制长久期成长敞口。");
    actions.add("只要信用和 VIX 未确认恶化，避免把它升级成全面信用危机交易。");
  }

  if (regime === "信用风险/危机交易" || riskState === "crisis") {
    actions.add("优先控制总股票风险和融资敏感敞口。");
    actions.add("检查指数保护、现金/T-bill 缓冲和高收益信用风险。");
  }

  if (regime === "日本外溢") {
    actions.add("把 JGB10Y、USDJPY、UST10Y 放在同一个监控窗口。");
    actions.add("避免过早用长债多头对冲长端利率继续上行。");
  }

  if (alerts.length === 0) {
    actions.add("维持中性监控，等待利率或信用给出方向确认。");
  }

  alerts.slice(0, 3).forEach((alert) => actions.add(alert.action));

  actions.add("本面板仅用于研究监控，不构成自动交易或投资建议。");
  return [...actions];
}

function buildDashboardInterpretation({
  generatedAt,
  metrics,
  alerts,
  regime,
  regimeNote,
  riskState,
  riskScore
}: {
  generatedAt: string;
  metrics: Record<string, MetricSnapshot>;
  alerts: Alert[];
  regime: string;
  regimeNote: string;
  riskState: RiskState;
  riskScore: number;
}): DashboardInterpretation {
  const metricReadings = metricDefinitions.map((definition) =>
    interpretMetric(definition, metrics[definition.id])
  );
  const ust10y = latest(metrics, "ust10y");
  const ust10yChange = metrics.ust10y?.change5d;
  const ust10yChange1d = oneObservationChange(metrics, "ust10y");
  const ust2y = latest(metrics, "ust2y");
  const ust2yChange1d = oneObservationChange(metrics, "ust2y");
  const curve10y2y = latest(metrics, "curve_10y2y");
  const curve10y3m = latest(metrics, "curve_10y3m");
  const igOas = latest(metrics, "ig_oas");
  const hyOas = latest(metrics, "hy_oas");
  const vix = latest(metrics, "vix");
  const nfci = latest(metrics, "nfci");
  const jgb10y = latest(metrics, "jgb10y");
  const usdjpy = latest(metrics, "usdjpy");
  const bei5y = latest(metrics, "bei5y");
  const rrp = latest(metrics, "rrp");
  const unrate = latest(metrics, "unrate");
  const nfpChange = latest(metrics, "nfp_change");
  const aheMom = latest(metrics, "ahe_mom");
  const dateOf = (metricId: string) => metrics[metricId]?.latest?.date;
  const topAlerts = alerts
    .filter((alert) => alert.id !== "rrp-low" || alerts.length === 1)
    .slice(0, 4)
    .map((alert) => `${alert.title}：${alert.message}`);

  const keyPoints =
    topAlerts.length > 0
      ? topAlerts
      : [
          "信用利差未触发预警，暂未看到融资压力升级。",
          "波动率和金融条件未进入红区，风险偏好仍可承受。",
          "长端利率和日本国债上行仍是近期最重要的观察线。"
        ];

  return {
    updatedAt: generatedAt,
    headline: `${regime}，综合风险 ${riskScore}/100（${stateLabel(riskState)}）`,
    summary: [
      `当前主剧本是“${regime}”。${regimeNote}`,
      [
        "就业与利率再定价方面",
        dateOf("nfp_change") || dateOf("ust2y") || dateOf("ust10y")
          ? `（非农 ${dateOf("nfp_change") ?? "--"}，利率 ${dateOf("ust10y") ?? "--"}）`
          : "",
        "：",
        nfpChange !== undefined ? `非农新增 ${fmt(nfpChange)}k` : "非农新增暂无数据",
        unrate !== undefined ? `，失业率 ${fmt(unrate)}%` : "",
        aheMom !== undefined ? `，平均时薪环比 ${fmt(aheMom)}%` : "",
        ust2y !== undefined ? `；2Y 美债 ${fmt(ust2y)}%` : "",
        ust2yChange1d !== undefined ? `，单日 ${formatMetricChange(ust2yChange1d, "percent")}` : "",
        ust10y !== undefined ? `；10Y 美债 ${fmt(ust10y)}%` : "",
        ust10yChange1d !== undefined ? `，单日 ${formatMetricChange(ust10yChange1d, "percent")}` : "",
        "。强就业叠加前端利率上行时，风险主要来自降息预期后移和估值折现率上升。"
      ].join(""),
      [
        "利率与曲线方面",
        dateOf("ust10y") ? `（美债 ${dateOf("ust10y")}）` : "",
        "：",
        ust10y !== undefined ? `10Y 美债 ${fmt(ust10y)}%` : "10Y 美债暂无数据",
        ust10yChange !== undefined ? `，5个观测点变化 ${formatMetricChange(ust10yChange, "percent")}` : "",
        curve10y2y !== undefined ? `；10s2s ${fmt(curve10y2y)}bp` : "",
        curve10y3m !== undefined ? `，10s3m ${fmt(curve10y3m)}bp` : "",
        "。如果长端继续上行而信用仍稳，主要影响会先落在估值和风格切换，而不是马上进入信用危机。"
      ].join(""),
      [
        "信用与流动性方面",
        dateOf("hy_oas") || dateOf("vix") || dateOf("rrp")
          ? `（信用 ${dateOf("hy_oas") ?? "--"}，VIX ${dateOf("vix") ?? "--"}，RRP ${dateOf("rrp") ?? "--"}）`
          : "",
        "：",
        hyOas !== undefined ? `HY OAS ${fmt(hyOas)}bp` : "HY OAS 暂无数据",
        igOas !== undefined ? `，IG OAS ${fmt(igOas)}bp` : "",
        vix !== undefined ? `，VIX ${fmt(vix)}` : "",
        nfci !== undefined ? `，NFCI ${fmt(nfci)}` : "",
        rrp !== undefined && rrp < 10 ? "；RRP 缓冲池已经很低，是边际流动性黄灯" : "",
        "。信用和波动率没有同步进入预警区，说明压力尚未扩散成信用/流动性危机，但这不是低风险环境。"
      ].join(""),
      [
        "通胀、日本与宏观确认方面",
        dateOf("bei5y") || dateOf("jgb10y") || dateOf("usdjpy")
          ? `（BEI ${dateOf("bei5y") ?? "--"}，日债 ${dateOf("jgb10y") ?? "--"}，汇率 ${dateOf("usdjpy") ?? "--"}）`
          : "",
        "：",
        bei5y !== undefined ? `5Y BEI ${fmt(bei5y)}%` : "5Y BEI 暂无数据",
        jgb10y !== undefined ? `，JGB10Y ${fmt(jgb10y)}%` : "",
        usdjpy !== undefined ? `，USDJPY ${fmt(usdjpy)}` : "",
        unrate !== undefined ? `，美国失业率 ${fmt(unrate)}%` : "",
        "。近期重点是看通胀补偿、日本长端利率和美元/日元是否同时把美债长端再推高。"
      ].join("")
    ].join("\n"),
    keyPoints,
    metricReadings
  };
}

function interpretMetric(
  definition: MetricDefinition,
  snapshot: MetricSnapshot | undefined
): MetricInterpretation {
  const value = snapshot?.latest?.value;
  const valueLabel = value === undefined ? "--" : formatMetricValue(value, definition.unit);
  const change5dLabel =
    snapshot?.change5d === undefined
      ? undefined
      : formatMetricChange(snapshot.change5d, definition.unit);
  const latestDate = snapshot?.latest?.date;
  const base = value === undefined
    ? `${definition.label}暂无最新观测，先检查对应数据源。`
    : `${definition.label}为 ${valueLabel}${latestDate ? `（${latestDate}）` : ""}。`;
  const summary = snapshot?.note ?? normalMetricSummary(definition, valueLabel, value);

  return {
    metricId: definition.id,
    title: definition.label,
    group: definition.group,
    state: snapshot?.status ?? "watch",
    valueLabel,
    date: snapshot?.latest?.date,
    change5dLabel,
    summary: `${base}${change5dLabel ? ` 5个观测点变化 ${change5dLabel}。` : ""}`,
    implication: summary
  };
}

function normalMetricSummary(
  definition: MetricDefinition,
  valueLabel: string,
  value: number | undefined
): string {
  if (value === undefined) return "数据缺失时不参与风险打分。";

  switch (definition.id) {
    case "ust3m":
      return "短端仍代表现金/短债替代收益，偏高会抬高股票机会成本。";
    case "ust2y":
      return "2年端反映终端政策预期，当前未触发前端重新紧缩预警。";
    case "ust5y":
      return "5年端影响成长股折现率，当前重点看是否继续向 10年端传导。";
    case "ust10y":
      return "10年端是估值锚；低于 4.60% 时尚未进入看板预警区。";
    case "curve_10y2y":
      return value < 0 ? "10s2s 倒挂提示前端紧缩压力仍在。" : "10s2s 为正，曲线处于再陡峭化状态。";
    case "curve_10y3m":
      return value < 25 ? "10s3m 接近零轴，需要警惕曲线重新转负。" : "10s3m 仍为正，当前不像典型倒挂衰退交易。";
    case "ig_oas":
      return "投资级利差低于预警线，优质信用尚未显示系统性融资压力。";
    case "hy_oas":
      return "高收益利差低于 350bp，信用暂未把利率压力升级成危机信号。";
    case "ig_yield":
      return "投资级有效收益率代表企业融资成本，水平偏高但利差未同步失控。";
    case "hy_yield":
      return "高收益有效收益率显示风险企业融资成本，需结合 HY OAS 判断是否恶化。";
    case "bei5y":
      return value > 2.4 ? "5年通胀补偿仍偏高，Fed 快速宽松空间有限。" : "5年通胀补偿回落，对成长股估值更友好。";
    case "bei10y":
      return "10年通胀补偿观察长期通胀锚，当前未单独触发风险阈值。";
    case "vix":
      return value > 22 ? "VIX 已进入风险偏好降温区。" : "VIX 低于 22，波动率未进入预警区。";
    case "nfci":
      return value > 0 ? "金融条件转紧，需要下调风险偏好。" : "NFCI 为负，金融条件仍较平均水平宽松。";
    case "fed_assets":
      return "Fed 资产负债表用于观察系统流动性背景，需结合 RRP 和长端供给看。";
    case "rrp":
      return value < 10 ? "RRP 缓冲池很薄，是边际流动性提醒，但不单独构成危机信号。" : "RRP 仍提供一定流动性缓冲。";
    case "usdjpy":
      return value > 158 ? "美元/日元接近日元政策和套息交易敏感区。" : "美元/日元未触发日本外溢阈值。";
    case "jgb1y":
    case "jgb2y":
    case "jgb5y":
      return "日本曲线中短端用于观察 BoJ 正常化压力。";
    case "jgb10y":
      return value > 2.75 ? "JGB10Y 已触发日本外溢预警。" : "JGB10Y 尚未突破 2.75%，但若继续上行需盯住美债长端。";
    case "jgb30y":
    case "jgb40y":
      return "日本超长端上行会强化全球期限溢价压力。";
    case "tic_japan_ust":
      return "日本持有美债是慢变量，用来观察资金回流是否落地。";
    case "fed_upper":
      return "政策利率上限说明 Fed 尚未提供明显快速宽松托底。";
    case "nfp_change":
      return value >= 150 ? "非农新增高于 15 万，说明就业韧性仍强，降息交易容易被压制。" : "非农新增未显示过热，更多用于确认就业是否降温。";
    case "ahe_mom":
      return value >= 0.3 ? "平均时薪环比不低，工资通胀没有给 Fed 明显宽松空间。" : "平均时薪环比温和，对降息预期的压力较小。";
    case "unrate":
      return "失业率未触发周期预警时，盈利下修压力尚未得到宏观确认。";
    case "real_gdp":
      return "实际 GDP 是慢变量，用于确认经济扩张或收缩背景。";
    default:
      return `${definition.shortLabel} 当前值 ${valueLabel}，未触发单项风险解释。`;
  }
}

function stateLabel(state: RiskState): string {
  return {
    normal: "正常",
    watch: "观察",
    risk: "风险",
    crisis: "危机"
  }[state];
}

function formatMetricValue(value: number, unit: MetricUnit): string {
  const number = fmt(value);
  if (unit === "percent") return `${number}%`;
  if (unit === "bp") return `${number}bp`;
  if (unit === "thousand_jobs") return `${number}k`;
  if (unit === "usd_billion") return `$${number}B`;
  if (unit === "usd_trillion") return `$${number}T`;
  return number;
}

function formatMetricChange(value: number, unit: MetricUnit): string {
  if (unit === "percent") return `${value >= 0 ? "+" : ""}${fmt(value * 100)}bp`;
  if (unit === "bp") return `${value >= 0 ? "+" : ""}${fmt(value)}bp`;
  if (unit === "thousand_jobs") return `${value >= 0 ? "+" : ""}${fmt(value)}k`;
  return `${value >= 0 ? "+" : ""}${fmt(value)}`;
}

function buildCharts(grouped: Map<string, Observation[]>): Record<string, ChartPoint[]> {
  return {
    rates: mergeSeries(grouped, ["ust3m", "ust2y", "ust5y", "ust10y"], 180),
    curve: mergeSeries(grouped, ["curve_10y2y", "curve_10y3m"], 180),
    credit: mergeSeries(grouped, ["ig_oas", "hy_oas"], 180),
    liquidity: mergeSeries(grouped, ["vix", "nfci"], 180),
    japan: mergeSeries(grouped, ["jgb10y", "usdjpy", "ust10y"], 180),
    inflation: mergeSeries(grouped, ["bei5y", "bei10y"], 180),
    macro: mergeSeries(grouped, ["nfp_change", "ahe_mom", "unrate"], 36)
  };
}

function mergeSeries(
  grouped: Map<string, Observation[]>,
  metricIds: string[],
  limit: number
): ChartPoint[] {
  const points = new Map<string, ChartPoint>();
  for (const metricId of metricIds) {
    const series = (grouped.get(metricId) ?? []).slice(-limit);
    for (const observation of series) {
      const point = points.get(observation.date) ?? { date: observation.date };
      point[metricId] = observation.value;
      points.set(observation.date, point);
    }
  }

  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-limit);
}

function percentile(series: Observation[], value: number): number {
  if (series.length < 5) return 50;
  const sorted = series.map((point) => point.value).sort((a, b) => a - b);
  const below = sorted.filter((point) => point <= value).length;
  return Math.round((below / sorted.length) * 100);
}

function evaluateUnemployment(series: Observation[]) {
  if (series.length < 12) return undefined;
  const last12 = series.slice(-12);
  const last3 = series.slice(-3);
  const avg3 = average(last3.map((point) => point.value));
  const low12 = Math.min(...last12.map((point) => point.value));
  const gap = avg3 - low12;

  if (gap >= 0.5) {
    return {
      state: "risk" as RiskState,
      note: `失业率 3 个月均值较 12 个月低点上升 ${fmt(gap)}pp，高于 0.5pp。`
    };
  }

  if (gap >= 0.3) {
    return {
      state: "watch" as RiskState,
      note: `失业率 3 个月均值较 12 个月低点上升 ${fmt(gap)}pp，高于 0.3pp。`
    };
  }

  return undefined;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fmt(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2
  }).format(value);
}

export function getDefinition(metricId: string) {
  return metricMap.get(metricId);
}
