import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Observation, SourceStatus } from "../../shared/types";

const cacheDir = process.env.MACRO_CACHE_DIR ?? (process.env.VERCEL ? "/tmp/macro-control" : join(process.cwd(), ".cache"));
const cacheFile = join(cacheDir, "macro-data.json");

export interface CachedData {
  updatedAt: string;
  observations: Observation[];
  sourceStatuses: SourceStatus[];
}

export async function readCache(): Promise<CachedData | undefined> {
  try {
    const raw = await readFile(cacheFile, "utf8");
    return JSON.parse(raw) as CachedData;
  } catch {
    return undefined;
  }
}

export async function writeCache(data: CachedData): Promise<void> {
  await mkdir(dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(data, null, 2), "utf8");
}

export function isCacheFresh(data: CachedData | undefined, maxAgeMs: number): boolean {
  if (!data) return false;
  return Date.now() - new Date(data.updatedAt).getTime() < maxAgeMs;
}

export function mergeObservations(existing: Observation[], next: Observation[]): Observation[] {
  const merged = new Map<string, Observation>();

  for (const observation of [...existing, ...next]) {
    merged.set(
      `${observation.metricId}|${observation.date}`,
      observation
    );
  }

  return [...merged.values()].sort((a, b) => {
    const metric = a.metricId.localeCompare(b.metricId);
    if (metric !== 0) return metric;
    return a.date.localeCompare(b.date);
  });
}
