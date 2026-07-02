import { fetchText } from "../lib/http";
import type { Observation, SourceResult } from "../../shared/types";

const employmentSituationUrl = "https://www.bls.gov/news.release/empsit.nr0.htm";
const blsApiUrl = "https://api.bls.gov/publicAPI/v2/timeseries/data/";
const totalNonfarmSeries = "CES0000000001";
const averageHourlyEarningsSeries = "CES0500000003";
const unemploymentRateSeries = "LNS14000000";

export async function fetchBlsEmploymentObservations(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  try {
    return await fetchBlsApiObservations(fetchedAt);
  } catch {
    return await fetchBlsNewsReleaseObservations(fetchedAt);
  }
}

async function fetchBlsNewsReleaseObservations(fetchedAt: string): Promise<SourceResult> {
  const html = await fetchText(employmentSituationUrl, 20000);
  const release = parseEmploymentSituation(html);
  const observations: Observation[] = [
    ...release.revisedPayrolls.map((revision) => ({
      metricId: "nfp_change",
      date: revision.date,
      value: revision.value,
      source: "BLS:Employment Situation revisions",
      quality: "ok" as const,
      fetchedAt
    })),
    {
      metricId: "nfp_change",
      date: release.date,
      value: release.nonfarmPayrolls,
      source: "BLS:Employment Situation",
      quality: "ok",
      fetchedAt
    },
    {
      metricId: "unrate",
      date: release.date,
      value: release.unemploymentRate,
      source: "BLS:Employment Situation",
      quality: "ok",
      fetchedAt
    }
  ];

  if (release.averageHourlyEarningsMom !== undefined) {
    observations.push({
      metricId: "ahe_mom",
      date: release.date,
      value: release.averageHourlyEarningsMom,
      source: "BLS:Employment Situation",
      quality: "ok",
      fetchedAt
    });
  }

  return {
    source: {
      id: "bls-employment",
      label: "BLS Employment Situation",
      ok: true,
      lastUpdated: fetchedAt,
      observations: observations.length,
      message: `Current Employment Situation release ${release.date}`
    },
    observations
  };
}

async function fetchBlsApiObservations(fetchedAt: string): Promise<SourceResult> {
  const currentYear = new Date().getUTCFullYear();
  const response = await postBlsApi({
    seriesid: [totalNonfarmSeries, averageHourlyEarningsSeries, unemploymentRateSeries],
    startyear: String(currentYear - 1),
    endyear: String(currentYear)
  });
  const series = response.Results?.series ?? [];
  const byId = new Map(series.map((item) => [item.seriesID, normalizeBlsRows(item.data ?? [])]));
  const payrolls = byId.get(totalNonfarmSeries) ?? [];
  const earnings = byId.get(averageHourlyEarningsSeries) ?? [];
  const unemployment = byId.get(unemploymentRateSeries) ?? [];
  const observations: Observation[] = [];

  payrolls.forEach((row, index) => {
    const previous = payrolls[index - 1];
    if (!previous) return;
    observations.push({
      metricId: "nfp_change",
      date: row.date,
      value: Number((row.value - previous.value).toFixed(3)),
      source: "BLS:Public API CES0000000001:derived",
      quality: "ok",
      fetchedAt
    });
  });

  earnings.forEach((row, index) => {
    const previous = earnings[index - 1];
    if (!previous || previous.value === 0) return;
    observations.push({
      metricId: "ahe_mom",
      date: row.date,
      value: Number(((row.value / previous.value - 1) * 100).toFixed(4)),
      source: "BLS:Public API CES0500000003:derived",
      quality: "ok",
      fetchedAt
    });
  });

  unemployment.forEach((row) => {
    observations.push({
      metricId: "unrate",
      date: row.date,
      value: row.value,
      source: "BLS:Public API LNS14000000",
      quality: "ok",
      fetchedAt
    });
  });

  if (observations.length === 0) {
    throw new Error("BLS API returned no employment observations");
  }

  const latestDate = observations
    .map((observation) => observation.date)
    .sort((a, b) => a.localeCompare(b))
    .at(-1);

  return {
    source: {
      id: "bls-employment",
      label: "BLS Employment Situation",
      ok: true,
      lastUpdated: fetchedAt,
      observations: observations.length,
      message: latestDate ? `BLS public API latest ${latestDate}` : "BLS public API"
    },
    observations
  };
}

async function postBlsApi(body: {
  seriesid: string[];
  startyear: string;
  endyear: string;
}): Promise<BlsApiResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(blsApiUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "user-agent": "macro-control-dashboard/0.1"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = (await response.json()) as BlsApiResponse;
    if (payload.status !== "REQUEST_SUCCEEDED") {
      throw new Error(payload.message?.join("; ") || `BLS API status ${payload.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBlsRows(rows: BlsApiRow[]): Array<{ date: string; value: number }> {
  return rows
    .filter((row) => /^M\d{2}$/.test(row.period))
    .map((row) => ({
      date: `${row.year}-${row.period.slice(1)}-01`,
      value: Number(row.value)
    }))
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseEmploymentSituation(html: string) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  const title = text.match(/THE EMPLOYMENT SITUATION\s+-\s+([A-Z]+)\s+(\d{4})/i);
  if (!title) throw new Error("Could not parse Employment Situation month");

  const date = `${title[2]}-${monthNumber(title[1])}-01`;
  const nonfarm = text.match(/Total nonfarm payroll employment increased by\s+([\d,]+)\s+in\s+[A-Za-z]+/i);
  const unrate = text.match(/unemployment rate was\s+(?:unchanged at|at)\s+([\d.]+)\s+percent/i);
  const ahe = text.match(/average hourly earnings[\s\S]{0,240}?or\s+([\d.]+)\s+percent/i);
  const revisedPayrolls = [...text.matchAll(/(?:change in total nonfarm payroll employment for|change for)\s+([A-Za-z]+)\s+was revised up by\s+[\d,]+,\s+from\s+\+?([\d,]+)\s+to\s+\+?([\d,]+)/gi)]
    .map((match) => ({
      date: `${title[2]}-${monthNumber(match[1])}-01`,
      value: parsePayrollChange(match[3])
    }));

  if (!nonfarm) throw new Error("Could not parse nonfarm payroll change");
  if (!unrate) throw new Error("Could not parse unemployment rate");

  return {
    date,
    nonfarmPayrolls: parsePayrollChange(nonfarm[1]),
    unemploymentRate: Number(unrate[1]),
    averageHourlyEarningsMom: ahe ? Number(ahe[1]) : undefined,
    revisedPayrolls
  };
}

function parsePayrollChange(raw: string): number {
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) throw new Error(`Invalid payroll value: ${raw}`);
  return value > 10_000 ? Number((value / 1000).toFixed(3)) : value;
}

function monthNumber(month: string): string {
  const index = months.indexOf(month.toLowerCase());
  if (index < 0) throw new Error(`Invalid Employment Situation month: ${month}`);
  return String(index + 1).padStart(2, "0");
}

const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
];

interface BlsApiResponse {
  status: string;
  message?: string[];
  Results?: {
    series?: Array<{
      seriesID: string;
      data?: BlsApiRow[];
    }>;
  };
}

interface BlsApiRow {
  year: string;
  period: string;
  value: string;
}
