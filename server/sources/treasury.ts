import { fetchText } from "../lib/http";
import type { Observation, SourceResult } from "../../shared/types";

export async function fetchTreasuryCrosscheck(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const year = new Date().getFullYear();
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
  const xml = await fetchText(url, 7000);
  const observations = parseTreasuryYieldCurveXml(xml, fetchedAt);

  return {
    source: {
      id: "treasury",
      label: "U.S. Treasury Rates",
      ok: observations.length > 0,
      lastUpdated: fetchedAt,
      observations: observations.length,
      message:
        observations.length > 0
          ? "Daily Treasury Par Yield Curve XML"
          : "No current year XML rows parsed"
    },
    observations
  };
}

export function parseTreasuryYieldCurveXml(xml: string, fetchedAt: string): Observation[] {
  const observations: Observation[] = [];
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  const fields = [
    ["ust3m", "BC_3MONTH"],
    ["ust2y", "BC_2YEAR"],
    ["ust5y", "BC_5YEAR"],
    ["ust10y", "BC_10YEAR"]
  ] as const;

  for (const entry of entries) {
    const rawDate = tagValue(entry, "NEW_DATE");
    const date = rawDate?.slice(0, 10);
    if (!date) continue;

    const values: Partial<Record<(typeof fields)[number][0], number>> = {};

    for (const [metricId, tag] of fields) {
      const rawValue = tagValue(entry, tag);
      const value = rawValue === undefined ? undefined : Number(rawValue);
      if (!Number.isFinite(value)) continue;

      values[metricId] = value;
      observations.push({
        metricId,
        date,
        value: value as number,
        source: "Treasury:DailyTreasuryYieldCurveRateData",
        quality: "ok",
        fetchedAt
      });
    }

    const curve10y2y = spreadBp(values.ust10y, values.ust2y);
    const curve10y3m = spreadBp(values.ust10y, values.ust3m);

    if (curve10y2y !== undefined) {
      observations.push({
        metricId: "curve_10y2y",
        date,
        value: curve10y2y,
        source: "Treasury:DailyTreasuryYieldCurveRateData:derived",
        quality: "ok",
        fetchedAt
      });
    }

    if (curve10y3m !== undefined) {
      observations.push({
        metricId: "curve_10y3m",
        date,
        value: curve10y3m,
        source: "Treasury:DailyTreasuryYieldCurveRateData:derived",
        quality: "ok",
        fetchedAt
      });
    }
  }

  return observations;
}

function spreadBp(longRate: number | undefined, shortRate: number | undefined): number | undefined {
  if (longRate === undefined || shortRate === undefined) return undefined;
  return Number(((longRate - shortRate) * 100).toFixed(6));
}

function tagValue(entry: string, tag: string): string | undefined {
  return entry.match(new RegExp(`<d:${tag}[^>]*>([^<]+)<\\/d:${tag}>`))?.[1];
}
