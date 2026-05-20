import { fetchText } from "../lib/http";
import type { Observation, SourceResult } from "../../shared/types";

const ecbFxHistoryUrl = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
const ecbFxDailyUrl = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

export async function fetchEcbFxObservations(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  let message = "90-day EUR reference rates converted to USDJPY";
  let xml: string;

  try {
    xml = await fetchText(ecbFxHistoryUrl, 10000);
  } catch {
    xml = await fetchText(ecbFxDailyUrl, 10000);
    message = "Daily EUR reference rates converted to USDJPY";
  }

  const observations = parseEcbUsdJpy(xml, fetchedAt);

  return {
    source: {
      id: "ecb-fx",
      label: "ECB FX",
      ok: observations.length > 0,
      lastUpdated: fetchedAt,
      observations: observations.length,
      message: observations.length > 0 ? message : "No ECB USDJPY observations parsed"
    },
    observations
  };
}

export function parseEcbUsdJpy(xml: string, fetchedAt: string): Observation[] {
  const observations: Observation[] = [];
  const dayBlocks = xml.match(/<Cube\s+time=['"][^'"]+['"][\s\S]*?<\/Cube>/g) ?? [];

  for (const block of dayBlocks) {
    const date = block.match(/<Cube\s+time=['"]([^'"]+)['"]/)?.[1];
    const usd = rateFor(block, "USD");
    const jpy = rateFor(block, "JPY");
    if (!date || usd === undefined || jpy === undefined || usd === 0) continue;

    observations.push({
      metricId: "usdjpy",
      date,
      value: jpy / usd,
      source: "ECB:EUR reference rates",
      quality: "ok",
      fetchedAt
    });
  }

  return observations;
}

function rateFor(block: string, currency: string): number | undefined {
  const match = block.match(new RegExp(`<Cube\\s+currency=['"]${currency}['"]\\s+rate=['"]([^'"]+)['"]\\s*\\/>`));
  const value = match ? Number(match[1]) : undefined;
  return Number.isFinite(value) ? value : undefined;
}
