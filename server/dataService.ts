import { evaluateDashboard, groupByMetric } from "../shared/rules";
import type { DashboardSnapshot, Observation, SourceResult, SourceStatus } from "../shared/types";
import { isCacheFresh, mergeObservations, readCache, writeCache, type CachedData } from "./lib/cache";
import { fetchCboeObservations } from "./sources/cboe";
import { fetchEcbFxObservations } from "./sources/ecb";
import { fetchFredObservations } from "./sources/fred";
import { fetchJapanMarketRateObservations } from "./sources/japanMarketRates";
import { fetchJapanMofObservations } from "./sources/japanMof";
import { fetchMarketRateObservations } from "./sources/marketRates";
import { fetchBlsEmploymentObservations } from "./sources/blsEmployment";
import { fetchTicObservations } from "./sources/tic";
import { fetchTreasuryCrosscheck } from "./sources/treasury";
import { fetchYahooMarketObservations } from "./sources/yahooMarket";

const cacheMaxAgeMs = 1000 * 60 * 60 * 6;

type Fetcher = () => Promise<SourceResult>;

const fetchers: Array<{ id: string; label: string; fetcher: Fetcher }> = [
  { id: "fred", label: "FRED", fetcher: fetchFredObservations },
  { id: "bls-employment", label: "BLS Employment Situation", fetcher: fetchBlsEmploymentObservations },
  { id: "cboe", label: "Cboe VIX", fetcher: fetchCboeObservations },
  { id: "yahoo-market", label: "Yahoo Market Quotes", fetcher: fetchYahooMarketObservations },
  { id: "japan-mof", label: "Japan MOF JGB", fetcher: fetchJapanMofObservations },
  { id: "japan-market-rates", label: "Japan Market Rate Quotes", fetcher: fetchJapanMarketRateObservations },
  { id: "tic", label: "U.S. Treasury TIC", fetcher: fetchTicObservations },
  { id: "treasury", label: "U.S. Treasury Rates", fetcher: fetchTreasuryCrosscheck },
  { id: "market-rates", label: "Market Rate Quotes", fetcher: fetchMarketRateObservations },
  { id: "ecb-fx", label: "ECB FX", fetcher: fetchEcbFxObservations }
];

export async function getDashboard(forceRefresh = false): Promise<DashboardSnapshot> {
  const data = await getData(forceRefresh);
  return evaluateDashboard(data.observations, data.sourceStatuses);
}

export async function getSources(forceRefresh = false): Promise<SourceStatus[]> {
  const data = await getData(forceRefresh);
  return data.sourceStatuses;
}

export async function getSeries(metricIds: string[], start?: string, end?: string) {
  const data = await getData(false);
  const allowed = new Set(metricIds);
  const grouped = groupByMetric(
    data.observations.filter((observation) => {
      if (!allowed.has(observation.metricId)) return false;
      if (start && observation.date < start) return false;
      if (end && observation.date > end) return false;
      return true;
    })
  );

  return Object.fromEntries(grouped.entries());
}

async function getData(forceRefresh: boolean): Promise<CachedData> {
  const cached = await readCache();
  if (!forceRefresh && cached && isCacheFresh(cached, cacheMaxAgeMs)) {
    return cached;
  }

  if (!forceRefresh && cached?.observations.length) {
    void refreshData(cached).catch(() => undefined);
    return cached;
  }

  return refreshData(cached);
}

async function refreshData(
  cached: CachedData = {
    updatedAt: new Date(0).toISOString(),
    observations: [] as Observation[],
    sourceStatuses: [] as SourceStatus[]
  }
): Promise<CachedData> {
  const results = await Promise.allSettled(fetchers.map((entry) => entry.fetcher()));
  let observations = cached.observations;
  const sourceStatuses: SourceStatus[] = [];

  results.forEach((result, index) => {
    const entry = fetchers[index];
    if (result.status === "fulfilled") {
      observations = mergeObservations(observations, result.value.observations);
      sourceStatuses.push(result.value.source);
      return;
    }

    const previous = cached.sourceStatuses.find((source) => source.id === entry.id);
    sourceStatuses.push({
      id: entry.id,
      label: entry.label,
      ok: false,
      lastUpdated: previous?.lastUpdated,
      observations: previous?.observations,
      message: result.reason instanceof Error ? result.reason.message : String(result.reason)
    });
  });

  const data = {
    updatedAt: new Date().toISOString(),
    observations,
    sourceStatuses
  };

  await writeCache(data);
  return data;
}
