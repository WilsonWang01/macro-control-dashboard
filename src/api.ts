import type { DashboardSnapshot, SourceStatus } from "../shared/types";

export async function fetchDashboard(): Promise<DashboardSnapshot> {
  return fetchJsonWithStaticFallback<DashboardSnapshot>("/api/dashboard");
}

export async function refreshDashboard(): Promise<DashboardSnapshot> {
  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<DashboardSnapshot>;
  } catch {
    return fetchDashboard();
  }
}

export async function fetchSources(): Promise<SourceStatus[]> {
  return fetchJsonWithStaticFallback<SourceStatus[]>("/api/sources");
}

async function fetchJsonWithStaticFallback<T>(apiPath: string): Promise<T> {
  try {
    const response = await fetch(apiPath);
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  } catch {
    const response = await fetch(staticApiPath(apiPath));
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<T>;
  }
}

function staticApiPath(apiPath: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${apiPath.replace(/^\/api\//, "api/")}.json`;
}
