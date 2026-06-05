import { describe, expect, it } from "vitest";
import { evaluateDashboard } from "./rules";
import type { Observation } from "./types";

describe("macro risk rules", () => {
  it("classifies high UST10Y with calm credit as bear steepening, not crisis", () => {
    const snapshot = evaluateDashboard([
      ...series("ust10y", [4.5, 4.55, 4.6, 4.65, 4.7, 4.8]),
      ...series("hy_oas", [280, 280, 280, 280, 280, 280]),
      ...series("vix", [17, 17, 17, 17, 17, 17])
    ]);

    expect(snapshot.regime).toBe("坏陡峭化");
    expect(snapshot.riskState).not.toBe("crisis");
  });

  it("escalates HY OAS and VIX red-zone combo to crisis trading", () => {
    const snapshot = evaluateDashboard([
      ...series("hy_oas", [430, 440, 450, 455, 458, 460]),
      ...series("vix", [24, 25, 28, 30, 31, 31]),
      ...series("ust10y", [4.4, 4.4, 4.4, 4.4, 4.4, 4.4])
    ]);

    expect(snapshot.regime).toBe("信用风险/危机交易");
    expect(snapshot.riskState).toBe("crisis");
  });

  it("detects Japan spillover when JGB, USDJPY and UST10Y move together", () => {
    const snapshot = evaluateDashboard([
      ...series("jgb10y", [2.7, 2.75, 2.8, 2.85, 2.88, 2.9]),
      ...series("usdjpy", [158, 158.5, 159, 159.5, 160, 160]),
      ...series("ust10y", [4.3, 4.32, 4.34, 4.36, 4.38, 4.4]),
      ...series("hy_oas", [280, 280, 280, 280, 280, 280]),
      ...series("vix", [17, 17, 17, 17, 17, 17])
    ]);

    expect(snapshot.regime).toBe("日本外溢");
    expect(snapshot.alerts.some((alert) => alert.id === "japan-spillover-combo")).toBe(true);
  });

  it("flags strong payrolls and rising rates as repricing pressure", () => {
    const snapshot = evaluateDashboard([
      ...series("nfp_change", [115, 172]),
      ...series("ahe_mom", [0.2, 0.3]),
      ...series("unrate", [4.3, 4.3]),
      ...series("ust2y", [4.05, 4.15]),
      ...series("ust10y", [4.47, 4.54]),
      ...series("hy_oas", [275, 275]),
      ...series("vix", [15, 15])
    ]);

    expect(snapshot.alerts.some((alert) => alert.id === "jobs-rates-repricing")).toBe(true);
    expect(snapshot.regime).toBe("强就业利率再定价");
    expect(snapshot.riskState).toBe("watch");
  });
});

function series(metricId: string, values: number[]): Observation[] {
  return values.map((value, index) => ({
    metricId,
    date: `2026-05-${String(10 + index).padStart(2, "0")}`,
    value,
    source: "test",
    quality: "ok",
    fetchedAt: "2026-05-17T00:00:00.000Z"
  }));
}
