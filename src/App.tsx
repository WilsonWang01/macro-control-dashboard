import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Database,
  Info,
  RefreshCw,
  ShieldAlert,
  TrendingUp
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useState, type ReactNode } from "react";
import { fetchDashboard, refreshDashboard } from "./api";
import type {
  Alert,
  ChartPoint,
  DashboardSnapshot,
  MetricSnapshot,
  MetricUnit,
  RiskState
} from "../shared/types";

const tabs = [
  { id: "overview", label: "总览" },
  { id: "matrix", label: "联动监控" },
  { id: "rules", label: "规则与数据" }
] as const;

type TabId = (typeof tabs)[number]["id"];

const stateCopy: Record<RiskState, { label: string; className: string; dot: string }> = {
  normal: {
    label: "正常",
    className: "border-sage/30 bg-emerald-50 text-sage",
    dot: "bg-sage"
  },
  watch: {
    label: "观察",
    className: "border-amber/30 bg-amber-50 text-amber",
    dot: "bg-amber"
  },
  risk: {
    label: "风险",
    className: "border-danger/30 bg-red-50 text-danger",
    dot: "bg-danger"
  },
  crisis: {
    label: "危机",
    className: "border-danger bg-red-100 text-danger",
    dot: "bg-danger"
  }
};

const lineColors = ["#315ea8", "#b7791f", "#2f7d5c", "#b42318", "#7f56d9", "#667085"];

export default function App() {
  const queryClient = useQueryClient();
  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard
  });
  const refreshMutation = useMutation({
    mutationFn: refreshDashboard,
    onSuccess: (data) => {
      queryClient.setQueryData(["dashboard"], data);
    }
  });
  const [activeTab, setActiveTab] = useStateWithFallback<TabId>("overview");

  if (dashboardQuery.isLoading) {
    return <LoadingShell />;
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <Shell>
        <div className="rounded border border-danger/30 bg-red-50 p-4 text-danger">
          API 暂时不可用：{dashboardQuery.error?.message ?? "未知错误"}
        </div>
      </Shell>
    );
  }

  const dashboard = dashboardQuery.data;

  return (
    <Shell>
      <Header
        dashboard={dashboard}
        isRefreshing={refreshMutation.isPending || dashboardQuery.isFetching}
        onRefresh={() => refreshMutation.mutate()}
      />

      <div className="mb-4">
        <InterpretationPanel dashboard={dashboard} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <RiskPanel dashboard={dashboard} />
        <SignalPanel dashboard={dashboard} />
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto border-b border-line pb-0 scrollbar-thin">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "border-signal text-signal"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="mt-4">
        {activeTab === "overview" && <Overview dashboard={dashboard} />}
        {activeTab === "matrix" && <MonitorMatrix dashboard={dashboard} />}
        {activeTab === "rules" && <Rules dashboard={dashboard} />}
      </main>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#eef1f5]">
      <div className="mx-auto max-w-[1480px] px-4 py-4 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}

function LoadingShell() {
  return (
    <Shell>
      <div className="grid min-h-[70vh] place-items-center">
        <div className="rounded border border-line bg-white p-6 shadow-crisp">
          <div className="flex items-center gap-3 text-ink">
            <RefreshCw className="h-5 w-5 animate-spin text-signal" />
            正在同步宏观数据...
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Header({
  dashboard,
  isRefreshing,
  onRefresh
}: {
  dashboard: DashboardSnapshot;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const state = stateCopy[dashboard.riskState];
  const dataCutoff = getDataCutoffLabel(dashboard);

  return (
    <header className="mb-4 rounded border border-line bg-white p-4 shadow-crisp">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded border px-2.5 py-1 text-sm font-semibold ${state.className}`}>
              <span className={`h-2 w-2 rounded-full ${state.dot}`} />
              {state.label}
            </span>
            <span className="text-sm text-muted">宏观利率风险监控</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal text-ink">
            {dashboard.regime}
          </h1>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-muted">
            {dashboard.regimeNote}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill icon={<Clock3 className="h-4 w-4" />} label={`更新时间：${formatDateTime(dashboard.generatedAt)}`} />
          <StatusPill icon={<Database className="h-4 w-4" />} label={`数据截至：${dataCutoff}`} />
          <StatusPill icon={<Database className="h-4 w-4" />} label={`${dashboard.failedSources} 个数据源异常`} />
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex h-10 items-center gap-2 rounded border border-signal bg-signal px-3 text-sm font-semibold text-white shadow-crisp disabled:cursor-wait disabled:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>
    </header>
  );
}

function RiskPanel({ dashboard }: { dashboard: DashboardSnapshot }) {
  return (
    <section className="rounded border border-line bg-white p-4 shadow-crisp">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-muted">综合风险分数</div>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-5xl font-semibold text-ink">{dashboard.riskScore}</span>
            <span className="pb-2 text-sm text-muted">/ 100</span>
          </div>
        </div>
        <Gauge score={dashboard.riskScore} state={dashboard.riskState} />
      </div>
      <div className="mt-4 h-2 rounded bg-[#e6eaf0]">
        <div
          className={`h-2 rounded ${dashboard.riskState === "normal" ? "bg-sage" : dashboard.riskState === "watch" ? "bg-amber" : "bg-danger"}`}
          style={{ width: `${Math.max(4, dashboard.riskScore)}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {["ust10y", "hy_oas", "jgb10y", "vix"].map((id) => (
          <MiniMetric key={id} metric={dashboard.metrics[id]} />
        ))}
      </div>
    </section>
  );
}

function SignalPanel({ dashboard }: { dashboard: DashboardSnapshot }) {
  const topAlerts = dashboard.alerts.slice(0, 4);

  return (
    <section className="rounded border border-line bg-white p-4 shadow-crisp">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">触发原因</h2>
        <span className="text-sm text-muted">{dashboard.alerts.length} 条信号</span>
      </div>
      <div className="mt-3 space-y-2">
        {topAlerts.length === 0 ? (
          <EmptyLine text="当前没有核心红黄阈值触发。" />
        ) : (
          topAlerts.map((alert) => <AlertRow key={alert.id} alert={alert} />)
        )}
      </div>
    </section>
  );
}

function Overview({ dashboard }: { dashboard: DashboardSnapshot }) {
  return (
    <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1fr_420px]">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <MetricCluster
          title="利率曲线与估值压力"
          description="同时看短端现金吸引力、长端折现率和曲线形状，判断是估值压缩还是衰退交易。"
          metricIds={["ust3m", "ust2y", "ust5y", "ust10y", "curve_10y2y", "curve_10y3m"]}
          chartTitle="美债关键期限"
          chartData={dashboard.charts.rates}
          chartMetricIds={["ust3m", "ust2y", "ust5y", "ust10y"]}
          metrics={dashboard.metrics}
          reference={4.6}
        />
        <MetricCluster
          title="信用、波动与流动性"
          description="信用利差决定利率冲击是否升级，VIX/NFCI/RRP 负责确认风险偏好和流动性条件。"
          metricIds={["hy_oas", "ig_oas", "vix", "nfci", "rrp", "fed_assets"]}
          chartTitle="信用利差"
          chartData={dashboard.charts.credit}
          chartMetricIds={["ig_oas", "hy_oas"]}
          metrics={dashboard.metrics}
          reference={350}
        />
        <MetricCluster
          title="日本外溢三角"
          description="JGB10Y、USDJPY 与 UST10Y 联动时，长端期限溢价和日资回流风险会放大。"
          metricIds={["jgb10y", "usdjpy", "ust10y", "jgb2y", "jgb5y", "tic_japan_ust"]}
          chartTitle="JGB / 汇率 / 美债"
          chartData={dashboard.charts.japan}
          chartMetricIds={["jgb10y", "usdjpy", "ust10y"]}
          metrics={dashboard.metrics}
          reference={2.75}
        />
        <MetricCluster
          title="通胀、就业与政策确认"
          description="通胀补偿影响 Fed 托底空间，非农/薪资和失业率判断利率压力来自韧性还是衰退。"
          metricIds={["bei5y", "bei10y", "nfp_change", "ahe_mom", "fed_upper", "unrate"]}
          chartTitle="通胀补偿"
          chartData={dashboard.charts.inflation}
          chartMetricIds={["bei5y", "bei10y"]}
          metrics={dashboard.metrics}
          reference={2.8}
        />
      </div>
      <div className="space-y-4">
        <ActionCard actions={dashboard.actions} />
        <SourceHealth dashboard={dashboard} />
      </div>
    </div>
  );
}

function MonitorMatrix({ dashboard }: { dashboard: DashboardSnapshot }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="美债期限结构" data={dashboard.charts.rates} metricIds={["ust3m", "ust2y", "ust5y", "ust10y"]} metrics={dashboard.metrics} reference={4.6} />
        <ChartCard title="曲线形状" data={dashboard.charts.curve} metricIds={["curve_10y2y", "curve_10y3m"]} metrics={dashboard.metrics} reference={0} />
        <ChartCard title="信用利差" data={dashboard.charts.credit} metricIds={["ig_oas", "hy_oas"]} metrics={dashboard.metrics} reference={350} />
        <ChartCard title="波动率与金融条件" data={dashboard.charts.liquidity} metricIds={["vix", "nfci"]} metrics={dashboard.metrics} reference={22} />
        <ChartCard title="日本外溢三角" data={dashboard.charts.japan} metricIds={["jgb10y", "usdjpy", "ust10y"]} metrics={dashboard.metrics} reference={2.75} />
        <ChartCard title="通胀补偿" data={dashboard.charts.inflation} metricIds={["bei5y", "bei10y"]} metrics={dashboard.metrics} reference={2.8} />
        <ChartCard title="就业确认" data={dashboard.charts.macro} metricIds={["nfp_change", "ahe_mom", "unrate"]} metrics={dashboard.metrics} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          "ust10y",
          "curve_10y3m",
          "hy_oas",
          "ig_oas",
          "vix",
          "jgb10y",
          "usdjpy",
          "bei5y",
          "nfci",
          "rrp",
          "nfp_change",
          "ahe_mom",
          "unrate",
          "fed_upper"
        ].map((id) => (
          <MetricCard key={id} metric={dashboard.metrics[id]} />
        ))}
      </div>
    </div>
  );
}

function Rates({ dashboard }: { dashboard: DashboardSnapshot }) {
  return (
    <SectionLayout
      cards={["ust3m", "ust2y", "ust5y", "ust10y", "curve_10y2y", "curve_10y3m"].map((id) => (
        <MetricCard key={id} metric={dashboard.metrics[id]} />
      ))}
      charts={
        <>
          <ChartCard title="美国国债关键期限" data={dashboard.charts.rates} metricIds={["ust3m", "ust2y", "ust5y", "ust10y"]} metrics={dashboard.metrics} reference={4.6} />
          <ChartCard title="曲线形状" data={dashboard.charts.curve} metricIds={["curve_10y2y", "curve_10y3m"]} metrics={dashboard.metrics} reference={0} />
        </>
      }
    />
  );
}

function Credit({ dashboard }: { dashboard: DashboardSnapshot }) {
  return (
    <SectionLayout
      cards={["ig_oas", "hy_oas", "ig_yield", "hy_yield", "vix", "nfci", "fed_assets", "rrp"].map((id) => (
        <MetricCard key={id} metric={dashboard.metrics[id]} />
      ))}
      charts={
        <>
          <ChartCard title="信用利差" data={dashboard.charts.credit} metricIds={["ig_oas", "hy_oas"]} metrics={dashboard.metrics} reference={350} />
          <ChartCard title="风险情绪与金融条件" data={dashboard.charts.liquidity} metricIds={["vix", "nfci"]} metrics={dashboard.metrics} reference={22} />
        </>
      }
    />
  );
}

function Japan({ dashboard }: { dashboard: DashboardSnapshot }) {
  return (
    <SectionLayout
      cards={["jgb1y", "jgb2y", "jgb5y", "jgb10y", "jgb30y", "jgb40y", "usdjpy", "tic_japan_ust"].map((id) => (
        <MetricCard key={id} metric={dashboard.metrics[id]} />
      ))}
      charts={
        <>
          <ChartCard title="日本外溢三角" data={dashboard.charts.japan} metricIds={["jgb10y", "usdjpy", "ust10y"]} metrics={dashboard.metrics} reference={2.75} />
          <div className="rounded border border-line bg-white p-4 shadow-crisp">
            <h3 className="text-base font-semibold text-ink">日本外溢判定</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              当 JGB10Y 高于 2.75%、USDJPY 高于 158，且 UST10Y 五个观测点上行时，面板切换为日本外溢剧本。
            </p>
          </div>
        </>
      }
    />
  );
}

function Macro({ dashboard }: { dashboard: DashboardSnapshot }) {
  return (
    <SectionLayout
      cards={["bei5y", "bei10y", "nfp_change", "ahe_mom", "fed_upper", "unrate", "real_gdp"].map((id) => (
        <MetricCard key={id} metric={dashboard.metrics[id]} />
      ))}
      charts={
        <>
          <ChartCard title="通胀补偿" data={dashboard.charts.inflation} metricIds={["bei5y", "bei10y"]} metrics={dashboard.metrics} reference={2.8} />
          <ChartCard title="就业确认" data={dashboard.charts.macro} metricIds={["nfp_change", "ahe_mom", "unrate"]} metrics={dashboard.metrics} />
        </>
      }
    />
  );
}

function Rules({ dashboard }: { dashboard: DashboardSnapshot }) {
  const rows = [
    ["UST10Y", ">4.60% 观察，>4.75% 风险"],
    ["UST10Y 5日", "上行 >=20bp 观察"],
    ["10s3m", "<25bp 观察，<0bp 风险"],
    ["10s2s", "<-25bp 观察"],
    ["HY OAS", ">350bp 观察，>450bp 风险/危机"],
    ["IG OAS", ">100bp 观察，>130bp 风险"],
    ["5Y BEI", ">2.80% 观察，<2.40% 成长友好"],
    ["JGB10Y", ">2.75% 观察，>3.00% 风险"],
    ["USDJPY", ">158 观察，>160 风险"],
    ["VIX", ">22 观察，>30 风险"],
    ["NFCI", ">0 观察"],
    ["RRP", "<100 亿美元仅提示缓冲池低"],
    ["非农 + 利率", "非农新增 >=150k、失业率 <=4.5%，且 2Y 单日上行 >=8bp 或 10Y 单日上行 >=5bp：观察"],
    ["平均时薪", "环比 >=0.3% 时作为 Fed 宽松空间不足的确认项"],
    ["失业率", "3个月均值较12个月低点：>=0.3pp 观察，>=0.5pp 风险"]
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
        <ScoringLogic dashboard={dashboard} />
        <AnalysisFramework dashboard={dashboard} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        <section className="rounded border border-line bg-white p-4 shadow-crisp">
          <h2 className="text-base font-semibold text-ink">阈值规则</h2>
          <div className="mt-3 overflow-hidden rounded border border-line">
            <table className="w-full text-left text-sm">
              <tbody>
                {rows.map(([metric, rule]) => (
                  <tr key={metric} className="border-b border-line last:border-b-0">
                    <th className="w-40 bg-panel px-3 py-2 font-semibold text-ink">{metric}</th>
                    <td className="px-3 py-2 text-muted">{rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded border border-line bg-white p-4 shadow-crisp">
          <h2 className="text-base font-semibold text-ink">数据源状态</h2>
          <div className="mt-3 space-y-2">
            {dashboard.sourceStatuses.map((source) => (
              <div key={source.id} className="rounded border border-line p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-ink">{source.label}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${source.ok ? "bg-emerald-50 text-sage" : "bg-red-50 text-danger"}`}>
                    {source.ok ? "正常" : "异常"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted">{source.message}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ScoringLogic({ dashboard }: { dashboard: DashboardSnapshot }) {
  const scoredGroups = [
    { label: "利率/曲线", weight: 30, state: maxMetricState(dashboard, ["ust10y", "curve_10y2y", "curve_10y3m"]) },
    { label: "信用", weight: 25, state: maxMetricState(dashboard, ["hy_oas", "ig_oas"]) },
    { label: "通胀", weight: 15, state: maxMetricState(dashboard, ["bei5y", "bei10y"]) },
    { label: "日本/汇率", weight: 15, state: maxMetricState(dashboard, ["jgb10y", "usdjpy"]) },
    { label: "流动性/波动", weight: 10, state: maxMetricState(dashboard, ["vix", "nfci", "rrp"]) },
    { label: "宏观确认", weight: 5, state: maxMetricState(dashboard, ["nfp_change", "ahe_mom", "unrate", "real_gdp", "fed_upper"]) }
  ];

  return (
    <section className="rounded border border-line bg-white p-4 shadow-crisp">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Activity className="h-4 w-4 text-signal" />
            打分逻辑
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            分数不是简单平均，而是按宏观传导重要性给六个模块加权；每个模块取当前最严重的触发项，风险/危机级别告警会直接抬升状态，RRP 低位只提示缓冲池。
          </p>
        </div>
        <span className={`rounded border px-3 py-1 text-sm font-semibold ${stateCopy[dashboard.riskState].className}`}>
          当前 {dashboard.riskScore}/100 · {stateCopy[dashboard.riskState].label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {scoredGroups.map((group) => (
          <div key={group.label} className="rounded border border-line bg-panel p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-ink">{group.label}</span>
              <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${stateCopy[group.state].className}`}>
                {stateCopy[group.state].label}
              </span>
            </div>
            <div className="mt-2 h-2 rounded bg-[#dde3ec]">
              <div className="h-2 rounded bg-signal" style={{ width: `${group.weight * 3.3}%` }} />
            </div>
            <div className="mt-2 text-xs text-muted">权重 {group.weight}%</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
        {[
          ["0-24", "正常", "未形成组合压力"],
          ["25-49", "观察", "黄灯，需要调结构"],
          ["50-74", "风险", "多模块共振或红色告警"],
          ["75-100", "危机", "信用/波动/宏观同时失控"]
        ].map(([range, label, note]) => (
          <div key={range} className="rounded border border-line p-3">
            <div className="text-sm font-semibold text-ink">{range}</div>
            <div className="mt-1 text-xs font-medium text-muted">{label}</div>
            <div className="mt-2 text-xs leading-5 text-muted">{note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnalysisFramework({ dashboard }: { dashboard: DashboardSnapshot }) {
  const steps = [
    ["一、先判定冲击源", "利率、信用、通胀、日本外溢、流动性、宏观确认六条线分开看，避免把单一指标当成完整剧本。"],
    ["二、再看传导链", "利率冲击先压估值，信用走阔才升级为融资压力；JGB 与 USDJPY 同向时，期限溢价风险会放大。"],
    ["三、最后落到剧本", "按信用危机、日本外溢、坏陡峭化、成长友好回落、中性震荡的顺序归类，优先处理更具破坏力的组合。"],
    ["四、输出观察纪律", "结论只给风险监控和仓位纪律，不自动给交易指令；数据日期不同步时，在摘要中明确各模块截至日。"]
  ];

  return (
    <section className="rounded border border-line bg-white p-4 shadow-crisp">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <Info className="h-4 w-4 text-signal" />
        分析框架
      </h2>
      <div className="mt-3 rounded border border-line bg-panel p-3">
        <div className="text-sm font-semibold text-ink">当前归因</div>
        <p className="mt-2 text-sm leading-6 text-muted">
          当前剧本是「{dashboard.regime}」。看板把它作为主剧本，是因为触发项里最重要的组合是：
          {dashboard.alerts.slice(0, 3).map((alert) => alert.title).join("、") || "暂无核心触发项"}。
        </p>
      </div>
      <div className="mt-3 space-y-2">
        {steps.map(([title, body]) => (
          <div key={title} className="rounded border border-line p-3">
            <div className="text-sm font-semibold text-ink">{title}</div>
            <p className="mt-1 text-xs leading-5 text-muted">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCluster({
  title,
  description,
  metricIds,
  chartTitle,
  chartData,
  chartMetricIds,
  metrics,
  reference
}: {
  title: string;
  description: string;
  metricIds: string[];
  chartTitle: string;
  chartData: ChartPoint[] | undefined;
  chartMetricIds: string[];
  metrics: DashboardSnapshot["metrics"];
  reference?: number;
}) {
  return (
    <section className="min-w-0 rounded border border-line bg-white p-4 shadow-crisp">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="text-sm leading-6 text-muted">{description}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
        {metricIds.map((id) => (
          <MiniMetric key={id} metric={metrics[id]} />
        ))}
      </div>
      <div className="mt-4">
        <ChartCard
          title={chartTitle}
          data={chartData}
          metricIds={chartMetricIds}
          metrics={metrics}
          reference={reference}
          compact
        />
      </div>
    </section>
  );
}

function InterpretationPanel({ dashboard }: { dashboard: DashboardSnapshot }) {
  const interpretation = dashboard.interpretation;
  const grouped = groupMetricReadings(interpretation.metricReadings);

  return (
    <section className="rounded border border-line bg-white p-4 shadow-crisp">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_420px]">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Info className="h-4 w-4 text-signal" />
            全指标汇总解读
          </h2>
          <div className="mt-3 rounded border border-line bg-panel p-4">
            <div className="text-lg font-semibold text-ink">{interpretation.headline}</div>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-ink">{interpretation.summary}</p>
            <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
              {interpretation.keyPoints.map((point) => (
                <div key={point} className="flex gap-2 rounded border border-line bg-white p-2 text-xs leading-5 text-muted">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                  {point}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-semibold text-ink">分模块状态</div>
          {grouped.map((group) => (
            <details key={group.label} className="group rounded border border-line bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded bg-panel px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{group.label}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {group.items.length} 个指标 · {group.counts}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${stateCopy[group.state].className}`}>
                    {stateCopy[group.state].label}
                  </span>
                  <span className="text-xs text-muted group-open:hidden">展开</span>
                  <span className="hidden text-xs text-muted group-open:inline">收起</span>
                </div>
              </summary>
              <div className="divide-y divide-line">
                {group.items.map((item) => (
                  <div key={item.metricId} className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-ink">{item.title}</div>
                        <div className="mt-1 text-xs text-muted">
                          {item.valueLabel}
                          {item.date ? ` · ${item.date}` : ""}
                          {item.change5dLabel ? ` · 5日 ${item.change5dLabel}` : ""}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-semibold ${stateCopy[item.state].className}`}>
                        {stateCopy[item.state].label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted">{item.summary}</p>
                    <p className="mt-1 text-xs leading-5 text-ink">{item.implication}</p>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function groupMetricReadings(readings: DashboardSnapshot["interpretation"]["metricReadings"]) {
  const labels = {
    rates: "利率与曲线",
    credit: "信用",
    inflation: "通胀",
    japan: "日本与汇率",
    liquidity: "流动性与波动",
    macro: "宏观",
    crosscheck: "交叉校验"
  };
  const order = ["rates", "credit", "inflation", "japan", "liquidity", "macro", "crosscheck"];

  return order
    .map((group) => {
      const items = readings.filter((item) => item.group === group);
      return {
        label: labels[group as keyof typeof labels],
        items,
        state: maxReadingState(items),
        counts: formatStateCounts(items)
      };
    })
    .filter((group) => group.items.length > 0);
}

function maxReadingState(readings: DashboardSnapshot["interpretation"]["metricReadings"]): RiskState {
  const order: RiskState[] = ["normal", "watch", "risk", "crisis"];
  return readings.reduce<RiskState>((max, item) => {
    return order.indexOf(item.state) > order.indexOf(max) ? item.state : max;
  }, "normal");
}

function formatStateCounts(readings: DashboardSnapshot["interpretation"]["metricReadings"]): string {
  const counts = readings.reduce<Record<RiskState, number>>(
    (acc, item) => {
      acc[item.state] += 1;
      return acc;
    },
    { normal: 0, watch: 0, risk: 0, crisis: 0 }
  );
  return [
    counts.crisis ? `危机 ${counts.crisis}` : "",
    counts.risk ? `风险 ${counts.risk}` : "",
    counts.watch ? `观察 ${counts.watch}` : "",
    counts.normal ? `正常 ${counts.normal}` : ""
  ]
    .filter(Boolean)
    .join(" / ");
}

function maxMetricState(dashboard: DashboardSnapshot, metricIds: string[]): RiskState {
  const order: RiskState[] = ["normal", "watch", "risk", "crisis"];
  return metricIds.reduce<RiskState>((max, id) => {
    const state = dashboard.metrics[id]?.status ?? "normal";
    return order.indexOf(state) > order.indexOf(max) ? state : max;
  }, "normal");
}

function SectionLayout({ cards, charts }: { cards: ReactNode[]; charts: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">{cards}</div>
      <div className="min-w-0 space-y-4">{charts}</div>
    </div>
  );
}

function MetricCard({ metric }: { metric?: MetricSnapshot }) {
  if (!metric) return null;
  const state = stateCopy[metric.status];
  const change = metric.change5d;

  return (
    <article className="rounded border border-line bg-white p-3 shadow-crisp">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{metric.definition.label}</h3>
          <p className="mt-1 text-xs text-muted">{metric.definition.source}</p>
        </div>
        <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-semibold ${state.className}`}>
          {state.label}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-2xl font-semibold text-ink">
          {metric.latest ? formatValue(metric.latest.value, metric.definition.unit) : "--"}
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${change >= 0 ? "text-danger" : "text-sage"}`}>
            {change >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {formatChange(change, metric.definition.unit)}
          </div>
        )}
      </div>
      <div className="mt-2 min-h-10 text-xs leading-5 text-muted">{metric.note ?? metric.definition.description}</div>
    </article>
  );
}

function MiniMetric({ metric }: { metric?: MetricSnapshot }) {
  if (!metric) return null;
  return (
    <div className="rounded border border-line bg-panel p-3">
      <div className="text-xs font-medium text-muted">{metric.definition.shortLabel}</div>
      <div className="mt-1 text-lg font-semibold text-ink">
        {metric.latest ? formatValue(metric.latest.value, metric.definition.unit) : "--"}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  data,
  metricIds,
  metrics,
  reference,
  compact = false
}: {
  title: string;
  data: ChartPoint[] | undefined;
  metricIds: string[];
  metrics: DashboardSnapshot["metrics"];
  reference?: number;
  compact?: boolean;
}) {
  const chartData = data ?? [];

  return (
    <section className="min-w-0 rounded border border-line bg-white p-4 shadow-crisp">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <div className="flex flex-wrap gap-2">
          {metricIds.map((id, index) => (
            <span key={id} className="inline-flex items-center gap-1 text-xs text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: lineColors[index % lineColors.length] }} />
              {metrics[id]?.definition.shortLabel ?? id}
            </span>
          ))}
        </div>
      </div>
      <div className={`${compact ? "h-[240px] min-h-[240px]" : "h-[320px] min-h-[320px]"} min-w-0 w-full`}>
        {chartData.length === 0 ? (
          <div className="grid h-full place-items-center rounded border border-dashed border-line text-sm text-muted">
            暂无图表数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={compact ? 240 : 320}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e4e8ef" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={36} />
              <YAxis tick={{ fontSize: 11 }} width={48} />
              <Tooltip
                contentStyle={{ border: "1px solid #d9dee8", borderRadius: 6, boxShadow: "0 1px 2px rgba(16,24,40,.08)" }}
                formatter={(value, name) => {
                  const metric = metrics[String(name)];
                  return [formatValue(Number(value), metric?.definition.unit ?? "percent"), metric?.definition.shortLabel ?? name];
                }}
              />
              {reference !== undefined && <ReferenceLine y={reference} stroke="#b7791f" strokeDasharray="4 4" />}
              {metricIds.map((id, index) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  stroke={lineColors[index % lineColors.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const icon =
    alert.level === "crisis" || alert.level === "risk" ? (
      <ShieldAlert className="h-4 w-4" />
    ) : (
      <AlertTriangle className="h-4 w-4" />
    );

  return (
    <div className={`rounded border p-3 ${stateCopy[alert.level].className}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5">{icon}</span>
        <div>
          <div className="text-sm font-semibold">{alert.title}</div>
          <div className="mt-1 text-sm leading-5 opacity-90">{alert.message}</div>
          <div className="mt-2 text-xs leading-5 opacity-90">{alert.action}</div>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ actions }: { actions: string[] }) {
  return (
    <section className="rounded border border-line bg-white p-4 shadow-crisp">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <Activity className="h-4 w-4 text-signal" />
        观察纪律
      </h2>
      <div className="mt-3 space-y-2">
        {actions.map((action) => (
          <div key={action} className="flex gap-2 rounded border border-line bg-panel p-2 text-sm leading-5 text-ink">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
            {action}
          </div>
        ))}
      </div>
    </section>
  );
}

function SourceHealth({ dashboard }: { dashboard: DashboardSnapshot }) {
  return (
    <section className="rounded border border-line bg-white p-4 shadow-crisp">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <Database className="h-4 w-4 text-signal" />
        数据源健康
      </h2>
      <div className="mt-3 space-y-2">
        {dashboard.sourceStatuses.map((source) => (
          <div key={source.id} className="flex items-start justify-between gap-3 rounded border border-line p-2">
            <div>
              <div className="text-sm font-medium text-ink">{source.label}</div>
              <div className="mt-1 text-xs text-muted">
                {source.observations ?? 0} 条观测 · 刷新 {source.lastUpdated ? formatDateTime(source.lastUpdated) : "--"}
              </div>
            </div>
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${source.ok ? "bg-emerald-50 text-sage" : "bg-red-50 text-danger"}`}>
              {source.ok ? "正常" : "异常"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusPill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded border border-line bg-panel px-3 text-sm text-muted">
      {icon}
      {label}
    </span>
  );
}

function Gauge({ score, state }: { score: number; state: RiskState }) {
  return (
    <div className={`grid h-20 w-20 place-items-center rounded border ${stateCopy[state].className}`}>
      <TrendingUp className="h-6 w-6" />
      <span className="text-xs font-semibold">{score}</span>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded border border-line bg-panel p-3 text-sm text-muted">
      <Info className="h-4 w-4" />
      {text}
    </div>
  );
}

function formatValue(value: number, unit: MetricUnit): string {
  const number = new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: unit === "bp" || unit === "index" ? 0 : 2
  }).format(value);

  if (unit === "percent") return `${number}%`;
  if (unit === "bp") return `${number}bp`;
  if (unit === "thousand_jobs") return `${number}k`;
  if (unit === "usd_billion") return `$${number}B`;
  if (unit === "usd_trillion") return `$${number}T`;
  if (unit === "yen_per_usd") return number;
  return number;
}

function formatChange(value: number, unit: MetricUnit): string {
  if (unit === "percent") return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(0)}bp`;
  if (unit === "bp") return `${value >= 0 ? "+" : ""}${value.toFixed(0)}bp`;
  if (unit === "thousand_jobs") return `${value >= 0 ? "+" : ""}${value.toFixed(0)}k`;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}

function getDataCutoffLabel(dashboard: DashboardSnapshot): string {
  const dateOf = (id: string) => dashboard.metrics[id]?.latest?.date ?? "--";
  return [
    `美债 ${dateOf("ust10y")}`,
    `就业 ${dateOf("nfp_change")}`,
    `信用 ${dateOf("hy_oas")}`,
    `VIX ${dateOf("vix")}`,
    `日债 ${dateOf("jgb10y")}`
  ].join(" / ");
}

function useStateWithFallback<T>(initial: T): [T, (next: T) => void] {
  return useState<T>(initial);
}
