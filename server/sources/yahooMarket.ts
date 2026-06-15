import { fetchText } from "../lib/http";
import type { Observation, SourceResult } from "../../shared/types";

interface YahooTicker {
  symbol: string;
  metricId: string;
  label: string;
}

const yahooTickers: YahooTicker[] = [
  { symbol: "^VIX", metricId: "vix", label: "VIX" },
  { symbol: "HYG", metricId: "hyg_price", label: "HYG ETF" },
  { symbol: "LQD", metricId: "lqd_price", label: "LQD ETF" }
];

export async function fetchYahooMarketObservations(): Promise<SourceResult> {
  const fetchedAt = new Date().toISOString();
  const observations: Observation[] = [];
  const failures: string[] = [];

  await Promise.all(
    yahooTickers.map(async (ticker) => {
      try {
        const points = await fetchYahooTicker(ticker, fetchedAt);
        observations.push(...points);
      } catch (error) {
        failures.push(`${ticker.symbol}: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  observations.push(...buildDerivedCreditProxy(observations, fetchedAt));

  return {
    source: {
      id: "yahoo-market",
      label: "Yahoo Market Quotes",
      ok: observations.length > 0 && failures.length === 0,
      lastUpdated: fetchedAt,
      observations: observations.length,
      message:
        failures.length > 0
          ? `${failures.length} quote failed: ${failures.join("; ")}`
          : "Yahoo delayed chart quotes for VIX/HYG/LQD"
    },
    observations
  };
}

async function fetchYahooTicker(ticker: YahooTicker, fetchedAt: string): Promise<Observation[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker.symbol)}?range=1mo&interval=1d`;
  const text = await fetchText(url, 15000);
  const payload = JSON.parse(text) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
      error?: { description?: string };
    };
  };

  const result = payload.chart?.result?.[0];
  if (!result || payload.chart?.error) {
    throw new Error(payload.chart?.error?.description ?? "No chart result");
  }

  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];

  return timestamps
    .map((timestamp, index): Observation | undefined => {
      const value = closes[index];
      if (value === undefined || value === null || !Number.isFinite(value)) return undefined;
      return {
        metricId: ticker.metricId,
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        value: Number(value.toFixed(6)),
        source: `Yahoo:${ticker.label}`,
        quality: "ok" as const,
        fetchedAt
      };
    })
    .filter((point): point is Observation => point !== undefined);
}

function buildDerivedCreditProxy(observations: Observation[], fetchedAt: string): Observation[] {
  const hygByDate = new Map(
    observations
      .filter((observation) => observation.metricId === "hyg_price")
      .map((observation) => [observation.date, observation])
  );
  const lqdByDate = new Map(
    observations
      .filter((observation) => observation.metricId === "lqd_price")
      .map((observation) => [observation.date, observation])
  );

  const ratios: Observation[] = [];
  for (const [date, hyg] of hygByDate.entries()) {
    const lqd = lqdByDate.get(date);
    if (!lqd || lqd.value === 0) continue;
    ratios.push({
      metricId: "hyg_lqd_ratio",
      date,
      value: Number((hyg.value / lqd.value).toFixed(6)),
      source: "Yahoo:HYG/LQD derived",
      quality: "ok",
      fetchedAt
    });
  }

  return ratios;
}
