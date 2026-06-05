import { fetchText } from "../lib/http";
import type { Observation, SourceResult } from "../../shared/types";

const employmentSituationUrl = "https://www.bls.gov/news.release/empsit.nr0.htm";

export async function fetchBlsEmploymentObservations(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
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
