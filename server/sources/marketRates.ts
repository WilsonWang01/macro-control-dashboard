import { fetchText } from "../lib/http";
import type { Observation, SourceResult } from "../../shared/types";

const marketRatePages = [
  {
    metricId: "ust10y",
    label: "US 10 Year Note Bond Yield",
    url: "https://tradingeconomics.com/united-states/government-bond-yield"
  },
  {
    metricId: "ust2y",
    label: "US 2 Year Note Bond Yield",
    url: "https://tradingeconomics.com/united-states/2-year-note-yield"
  }
];

export async function fetchMarketRateObservations(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const observations: Observation[] = [];
  const failures: string[] = [];

  await Promise.all(
    marketRatePages.map(async (page) => {
      try {
        const html = await fetchText(page.url, 15000);
        const parsed = parseMarketRatePage(html, page.label);
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

  const byMetric = new Map(observations.map((observation) => [observation.metricId, observation]));
  const ust10y = byMetric.get("ust10y");
  const ust2y = byMetric.get("ust2y");
  if (ust10y && ust2y && ust10y.date === ust2y.date) {
    observations.push({
      metricId: "curve_10y2y",
      date: ust10y.date,
      value: Number(((ust10y.value - ust2y.value) * 100).toFixed(6)),
      source: "TradingEconomics:derived",
      quality: "ok",
      fetchedAt
    });
  }

  return {
    source: {
      id: "market-rates",
      label: "Market Rate Quotes",
      ok: failures.length === 0 && observations.length > 0,
      lastUpdated: fetchedAt,
      observations: observations.length,
      message:
        failures.length > 0
          ? `${failures.length} quote failed: ${failures.join("; ")}`
          : "Trading Economics public bond quote pages"
    },
    observations
  };
}

function parseMarketRatePage(html: string, label: string): { date: string; value: number } {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(
      `${escapedLabel}\\s+(?:rose|fell|increased|decreased|eased|advanced|climbed|dropped|declined|slipped|retreated)[^.]*?to\\s+([0-9.]+)%\\s+on\\s+([A-Za-z]+\\s+\\d{1,2},\\s+\\d{4})`,
      "i"
    )
  );

  if (!match) {
    throw new Error(`Could not parse quote for ${label}`);
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid quote value for ${label}`);
  }

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
