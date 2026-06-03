import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fetchBuffer, fetchText } from "../lib/http";
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

const fredCsvTimeoutMs = 8000;
const fredXlsxTimeoutMs = 20000;
const fredConcurrency = 2;
const execFileAsync = promisify(execFile);

export async function fetchFredObservations(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 3);
  const startDate = start.toISOString().slice(0, 10);
  const observations: Observation[] = [];
  const failures: string[] = [];

  await runLimited(
    fredSeries,
    fredConcurrency,
    async (series) => {
      try {
        const rows = process.env.FRED_API_KEY
          ? await fetchOfficialSeries(series, startDate)
          : await fetchPublicSeries(series, startDate);

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
    }
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
            : "Public CSV/XLSX endpoint"
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
  const text = await fetchText(url, fredXlsxTimeoutMs);
  const payload = JSON.parse(text) as {
    observations?: Array<{ date: string; value: string }>;
    error_message?: string;
  };

  if (payload.error_message) throw new Error(payload.error_message);
  return (payload.observations ?? [])
    .map((point) => ({ date: point.date, value: parseNumber(point.value) }))
    .filter((point): point is { date: string; value: number } => point.value !== undefined);
}

async function fetchPublicSeries(series: FredSeries, startDate: string) {
  if (process.env.GITHUB_ACTIONS) {
    return fetchPublicXlsxSeries(series, startDate);
  }

  try {
    return await fetchPublicCsvSeries(series, startDate);
  } catch (csvError) {
    try {
      return await fetchPublicXlsxSeries(series, startDate);
    } catch (xlsxError) {
      const csvMessage = csvError instanceof Error ? csvError.message : String(csvError);
      const xlsxMessage = xlsxError instanceof Error ? xlsxError.message : String(xlsxError);
      throw new Error(`CSV failed (${csvMessage}); XLSX failed (${xlsxMessage})`);
    }
  }
}

async function fetchPublicCsvSeries(series: FredSeries, startDate: string) {
  const params = new URLSearchParams({
    id: series.seriesId,
    cosd: startDate
  });
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?${params.toString()}`;
  const text = await fetchText(url, fredCsvTimeoutMs);
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

async function fetchPublicXlsxSeries(series: FredSeries, startDate: string) {
  const params = new URLSearchParams({
    id: series.seriesId,
    cosd: startDate
  });
  const url = `https://fred.stlouisfed.org/graph/fredgraph.xls?${params.toString()}`;
  const buffer = await fetchBuffer(url, fredXlsxTimeoutMs);
  const xml = await readXlsxSheetXml(buffer);
  return parseFredXlsxSheet(xml);
}

async function readXlsxSheetXml(buffer: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "macro-fred-"));
  const file = join(dir, "fred.xlsx");

  try {
    await writeFile(file, buffer);
    const { stdout } = await execFileAsync("unzip", ["-p", file, "xl/worksheets/sheet2.xml"], {
      encoding: "utf8",
      maxBuffer: 5 * 1024 * 1024
    });
    return String(stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function parseFredXlsxSheet(xml: string) {
  const rows = xml.match(/<row\b[\s\S]*?<\/row>/g) ?? [];
  return rows
    .slice(1)
    .map((row) => {
      const values: Partial<Record<"A" | "B", string>> = {};
      const cells = row.matchAll(/<c\b([^>]*)>(?:<v>([^<]*)<\/v>)?<\/c>/g);

      for (const cell of cells) {
        const column = cell[1].match(/\br="([A-Z]+)\d+"/)?.[1];
        if (column === "A" || column === "B") {
          values[column] = cell[2];
        }
      }

      const serialDate = values.A === undefined ? Number.NaN : Number(values.A);
      const date = Number.isFinite(serialDate) ? excelSerialDateToIso(serialDate) : undefined;
      const value = parseNumber(values.B);
      return date && value !== undefined ? { date, value } : undefined;
    })
    .filter((point): point is { date: string; value: number } => point !== undefined);
}

function excelSerialDateToIso(serialDate: number): string {
  const excelEpoch = Date.UTC(1899, 11, 30);
  return new Date(excelEpoch + serialDate * 86400000).toISOString().slice(0, 10);
}

async function runLimited<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await worker(item);
    }
  });

  await Promise.all(workers);
}
