import { parseCsv, parseDate, parseNumber } from "../lib/csv";
import { fetchText } from "../lib/http";
import type { Observation, SourceResult } from "../../shared/types";

const vixCsvUrl = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";

export async function fetchCboeObservations(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const text = await fetchText(vixCsvUrl, 12000);
  const rows = parseCsv(text);
  const [header, ...body] = rows;
  const dateIndex = findHeader(header, ["DATE", "Date"]);
  const closeIndex = findHeader(header, ["CLOSE", "Close"]);

  const observations = body
    .reduce<Observation[]>((acc, row) => {
      const date = parseDate(row[dateIndex]);
      const value = parseNumber(row[closeIndex]);
      if (!date || value === undefined) return acc;
      acc.push({
        metricId: "vix",
        date,
        value,
        source: "Cboe:VIX_History",
        quality: "ok",
        fetchedAt
      });
      return acc;
    }, [])
    .slice(-900);

  return {
    source: {
      id: "cboe",
      label: "Cboe VIX",
      ok: observations.length > 0,
      lastUpdated: fetchedAt,
      observations: observations.length,
      message: observations.length > 0 ? "VIX historical CSV" : "No VIX observations parsed"
    },
    observations
  };
}

function findHeader(header: string[] | undefined, candidates: string[]): number {
  const index = header?.findIndex((cell) => candidates.includes(cell.trim())) ?? -1;
  if (index < 0) throw new Error(`Missing header: ${candidates.join("/")}`);
  return index;
}
