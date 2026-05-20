import { parseCsv, parseNumber } from "../lib/csv";
import { fetchDecodedText } from "../lib/http";
import type { Observation, SourceResult } from "../../shared/types";

const currentMonthUrl = "https://www.mof.go.jp/jgbs/reference/interest_rate/jgbcm.csv";

const columns: Array<{ index: number; metricId: string }> = [
  { index: 1, metricId: "jgb1y" },
  { index: 2, metricId: "jgb2y" },
  { index: 5, metricId: "jgb5y" },
  { index: 10, metricId: "jgb10y" },
  { index: 13, metricId: "jgb30y" },
  { index: 14, metricId: "jgb40y" }
];

export async function fetchJapanMofObservations(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const text = await fetchDecodedText(currentMonthUrl, "shift_jis", 10000);
  const rows = parseCsv(text).slice(2);
  const observations: Observation[] = [];

  for (const row of rows) {
    const date = parseEraDate(row[0]);
    if (!date) continue;

    for (const column of columns) {
      const value = parseNumber(row[column.index]);
      if (value === undefined) continue;
      observations.push({
        metricId: column.metricId,
        date,
        value,
        source: "Japan MOF:jgbcm.csv",
        quality: "ok",
        fetchedAt
      });
    }
  }

  return {
    source: {
      id: "japan-mof",
      label: "Japan MOF JGB",
      ok: observations.length > 0,
      lastUpdated: fetchedAt,
      observations: observations.length,
      message: observations.length > 0 ? "Current month JGB CSV" : "No JGB observations parsed"
    },
    observations
  };
}

function parseEraDate(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const match = input.trim().match(/^R(\d+)\.(\d+)\.(\d+)$/i);
  if (!match) return undefined;
  const [, eraYear, month, day] = match;
  const year = 2018 + Number(eraYear);
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
