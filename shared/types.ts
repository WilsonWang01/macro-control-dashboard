export type RiskState = "normal" | "watch" | "risk" | "crisis";

export type MetricGroup =
  | "rates"
  | "credit"
  | "inflation"
  | "japan"
  | "liquidity"
  | "macro"
  | "crosscheck";

export type MetricUnit =
  | "percent"
  | "bp"
  | "index"
  | "thousand_jobs"
  | "usd_billion"
  | "usd_trillion"
  | "yen_per_usd"
  | "score";

export type DataQuality =
  | "ok"
  | "stale"
  | "fallback"
  | "low-frequency"
  | "unavailable";

export interface Threshold {
  watch?: number;
  risk?: number;
  crisis?: number;
  direction: "above" | "below";
}

export interface MetricDefinition {
  id: string;
  label: string;
  shortLabel: string;
  group: MetricGroup;
  unit: MetricUnit;
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  source: string;
  description: string;
  thresholds?: Threshold[];
}

export interface Observation {
  metricId: string;
  date: string;
  value: number;
  source: string;
  quality: DataQuality;
  fetchedAt: string;
}

export interface SourceStatus {
  id: string;
  label: string;
  ok: boolean;
  lastUpdated?: string;
  message?: string;
  observations?: number;
}

export interface MetricSnapshot {
  definition: MetricDefinition;
  latest?: Observation;
  previous?: Observation;
  change5d?: number;
  change1m?: number;
  percentile?: number;
  status: RiskState;
  note?: string;
}

export interface Alert {
  id: string;
  level: RiskState;
  category: MetricGroup;
  metricIds: string[];
  title: string;
  message: string;
  action: string;
}

export interface ChartPoint {
  date: string;
  [metricId: string]: string | number | null;
}

export interface MetricInterpretation {
  metricId: string;
  title: string;
  group: MetricGroup;
  state: RiskState;
  valueLabel: string;
  date?: string;
  change5dLabel?: string;
  summary: string;
  implication: string;
}

export interface DashboardInterpretation {
  updatedAt: string;
  headline: string;
  summary: string;
  keyPoints: string[];
  metricReadings: MetricInterpretation[];
}

export interface DashboardSnapshot {
  generatedAt: string;
  riskScore: number;
  riskState: RiskState;
  regime: string;
  regimeNote: string;
  failedSources: number;
  alerts: Alert[];
  actions: string[];
  metrics: Record<string, MetricSnapshot>;
  sourceStatuses: SourceStatus[];
  charts: Record<string, ChartPoint[]>;
  interpretation: DashboardInterpretation;
}

export interface SourceResult {
  source: SourceStatus;
  observations: Observation[];
}
