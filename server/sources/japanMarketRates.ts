import { fetchText } from "../lib/http";
import type { Observation, SourceResult } from "../../shared/types";

const japanMarketPages = [
  {
    metricId: "jgb10y",
    label: "Japan 10Y Bond Yield",
    url: "https://tradingeconomics.com/japan/government-bond-yield"
  },
  {
    metricId: "jgb2y",
    label: "Japan 2 Year Bond Yield",
    url: "https://tradingeconomics.com/japan/2-year-note-yield"
  }
];

export async function fetchJapanMarketRateObservations(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const observations: Observation[] = [];
  const failures: string[] = [];

  await Promise.all(
    japanMarketPages.map(async (page) => {
      try {
        const html = await fetchText(page.url, 15000);
        const parsed = parseYieldPage(html, page.label);
        observations.push({
          metricId: page.metricId,
          date: parsed.date,
          value: parsed.value,
          source: `TradingEconomics:${page.label}`,
          quality: "ok",
          fetchedAt
        });
      } catch (error) {
        failures.push(`${page.metricId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  return {
    source: {
      id: "japan-market-rates",
      label: "Japan Market Rate Quotes",
      ok: observations.length > 0 && failures.length === 0,
      lastUpdated: fetchedAt,
      observations: observations.length,
      message:
        failures.length > 0
          ? `${failures.length} quote failed: ${failures.join("; ")}`
          : "Trading Economics public Japan bond quote pages"
    },
    observations
  };
}

function parseYieldPage(html: string, label: string): { date: string; value: number } {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(
      `${escapedLabel}\\s+(?:rose|fell|increased|decreased|eased|advanced|climbed|dropped|declined|slipped|retreated|was little changed)[^.]*?\\s(?:to|at)\\s+([0-9.]+)%\\s+on\\s+([A-Za-z]+\\s+\\d{1,2},\\s+\\d{4})`,
      "i"
    )
  );

  if (!match) throw new Error(`Could not parse quote for ${label}`);

  const value = Number(match[1]);
  if (!Number.isFinite(value)) throw new Error(`Invalid quote value for ${label}`);

  return {
    value,
    date: parseEnglishDate(match[2])
  };
}

function parseEnglishDate(raw: string): string {
  const match = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) throw new Error(`Invalid quote date: ${raw}`);
  const month = monthMap[match[1].toLowerCase()];
  if (!month) throw new Error(`Invalid quote month: ${raw}`);
  return `${match[3]}-${month}-${match[2].padStart(2, "0")}`;
}

const monthMap: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12"
};
