import { fetchText } from "../lib/http";
import { parseCsv, parseDate, parseNumber } from "../lib/csv";
import type { Observation, SourceResult } from "../../shared/types";

interface FredSeries {
  seriesId: string;
  metricId: string;
  transform?: (value: number) => number;
}

const fredSeries: FredSeries[] = [
  { seriesId: "DGS3MO", metricId: "ust3m" },
  { seriesId: "DGS2", metricId: "ust2y" },
  { seriesId: "DGS5", metricId: "ust5y" },
  { seriesId: "DGS10", metricId: "ust10y" },
  { seriesId: "T10Y2Y", metricId: "curve_10y2y", transform: (value) => value * 100 },
  { seriesId: "T10Y3M", metricId: "curve_10y3m", transform: (value) => value * 100 },
  { seriesId: "BAMLC0A0CM", metricId: "ig_oas", transform: (value) => value * 100 },
  { seriesId: "BAMLH0A0HYM2", metricId: "hy_oas", transform: (value) => value * 100 },
  { seriesId: "BAMLC0A0CMEY", metricId: "ig_yield" },
  { seriesId: "BAMLH0A0HYM2EY", metricId: "hy_yield" },
  { seriesId: "T5YIE", metricId: "bei5y" },
  { seriesId: "T10YIE", metricId: "bei10y" },
  { seriesId: "NFCI", metricId: "nfci" },
  { seriesId: "WALCL", metricId: "fed_assets", transform: (value) => value / 1_000_000 },
  { seriesId: "RRPONTSYD", metricId: "rrp" },
  { seriesId: "DEXJPUS", metricId: "usdjpy" },
  { seriesId: "UNRATE", metricId: "unrate" },
  { seriesId: "GDPC1", metricId: "real_gdp" },
  { seriesId: "DFEDTARU", metricId: "fed_upper" },
  { seriesId: "IRLTLT01JPM156N", metricId: "jgb10y" }
];

export async function fetchFredObservations(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 3);
  const startDate = start.toISOString().slice(0, 10);
  const observations: Observation[] = [];
  const failures: string[] = [];

  await Promise.all(
    fredSeries.map(async (series) => {
      try {
        const rows = process.env.FRED_API_KEY
          ? await fetchOfficialSeries(series, startDate)
          : await fetchPublicCsvSeries(series, startDate);

        for (const row of rows) {
          const value = series.transform ? series.transform(row.value) : row.value;
          observations.push({
            metricId: series.metricId,
            date: row.date,
            value,
            source: `FRED:${series.seriesId}`,
            quality:
              series.seriesId === "IRLTLT01JPM156N" ? "low-frequency" : "ok",
            fetchedAt
          });
        }
      } catch (error) {
        failures.push(`${series.seriesId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  return {
    source: {
      id: "fred",
      label: "FRED",
      ok: failures.length === 0,
      lastUpdated: fetchedAt,
      observations: observations.length,
      message:
        failures.length > 0
          ? `${failures.length} series failed: ${failures.slice(0, 4).join("; ")}`
          : process.env.FRED_API_KEY
            ? "Official API"
            : "Public CSV endpoint"
    },
    observations
  };
}

async function fetchOfficialSeries(series: FredSeries, startDate: string) {
  const params = new URLSearchParams({
    series_id: series.seriesId,
    api_key: process.env.FRED_API_KEY ?? "",
    file_type: "json",
    observation_start: startDate
  });
  const url = `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`;
  const text = await fetchText(url, 10000);
  const payload = JSON.parse(text) as {
    observations?: Array<{ date: string; value: string }>;
    error_message?: string;
  };

  if (payload.error_message) throw new Error(payload.error_message);
  return (payload.observations ?? [])
    .map((point) => ({ date: point.date, value: parseNumber(point.value) }))
    .filter((point): point is { date: string; value: number } => point.value !== undefined);
}

async function fetchPublicCsvSeries(series: FredSeries, startDate: string) {
  const params = new URLSearchParams({
    id: series.seriesId,
    cosd: startDate
  });
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?${params.toString()}`;
  const text = await fetchText(url, 10000);
  const rows = parseCsv(text);
  const [header, ...body] = rows;
  const dateIndex = header?.findIndex((cell) => cell.toLowerCase() === "observation_date" || cell.toLowerCase() === "date") ?? 0;
  const valueIndex = header?.findIndex((cell) => cell === series.seriesId) ?? 1;

  return body
    .map((row) => {
      const date = parseDate(row[dateIndex]);
      const value = parseNumber(row[valueIndex]);
      return date && value !== undefined ? { date, value } : undefined;
    })
    .filter((point): point is { date: string; value: number } => point !== undefined);
}
