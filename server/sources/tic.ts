import { parseNumber } from "../lib/csv";
import { fetchText } from "../lib/http";
import type { Observation, SourceResult } from "../../shared/types";

const ticUrl =
  "https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/mfhhis01.html";

export async function fetchTicObservations(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const html = await fetchText(ticUrl, 9000);
  const row = html
    .replace(/\s+/g, " ")
    .match(/Japan\s*(?:<\/[^>]+>\s*<[^>]+>|\s)+([\d.,\s]+)/i);
  const numbers = row?.[1]
    ?.split(/\s+/)
    .map((part) => parseNumber(part))
    .filter((value): value is number => value !== undefined);
  const value = numbers?.[0];
  const date = inferLatestTicDate(html) ?? new Date().toISOString().slice(0, 10);

  const observations: Observation[] =
    value === undefined
      ? []
      : [
          {
            metricId: "tic_japan_ust",
            date,
            value,
            source: "Treasury TIC:MFH",
            quality: "low-frequency",
            fetchedAt
          }
        ];

  return {
    source: {
      id: "tic",
      label: "U.S. Treasury TIC",
      ok: observations.length > 0,
      lastUpdated: fetchedAt,
      observations: observations.length,
      message: observations.length > 0 ? "Major foreign holders table" : "Japan row not parsed"
    },
    observations
  };
}

function inferLatestTicDate(html: string): string | undefined {
  const match = html.match(/as of\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!match) return undefined;
  const [, monthName, year] = match;
  const month = new Date(`${monthName} 1, ${year}`).getMonth() + 1;
  if (!Number.isFinite(month)) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
