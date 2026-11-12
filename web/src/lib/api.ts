import { API_BASE, REVALIDATE_SECONDS } from "./constants";

export type Stats = {
  companies_active: number;
  tech_open_jobs: number;
  by_eligibility: Record<string, number>;
  last_ingestion_at: string | null;
};

export type DailyStats = {
  date: string;
  companies_active: number;
  tech_open_jobs: number;
  by_eligibility: {
    open: number;
    india_remote: number;
    india_onsite: number;
    region_locked: number;
    unclear: number;
  };
  new_jobs_24h: number;
  closed_jobs_24h: number;
  is_backfill?: boolean;
};

export type JobRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  eligibility: string | null;
  evidence: unknown;
  apply_url: string;
  posted_at: string | null;
  last_seen_at: string | null;
};

export type JobsResponse = {
  results: JobRow[];
  next_cursor: string | null;
  count: number;
};

export type TopCompany = {
  id: string;
  name: string;
  website: string | null;
  open: number;
  india_remote: number;
  total: number;
};

async function getJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      next: { revalidate: REVALIDATE_SECONDS },
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchStats(): Promise<Stats | null> {
  return getJson<Stats>("/api/stats");
}

export async function fetchStatsHistory(
  days = 30,
): Promise<DailyStats[] | null> {
  const body = await getJson<{ history?: DailyStats[] }>(
    `/api/stats/history?days=${days}`,
  );
  if (!body?.history) return null;
  return body.history;
}

export async function fetchJobs(params: {
  query?: string;
  eligibility?: string;
  cursor?: string;
  limit?: number;
}): Promise<JobsResponse | null> {
  const sp = new URLSearchParams();
  if (params.query) sp.set("query", params.query);
  if (params.eligibility) sp.set("eligibility", params.eligibility);
  if (params.cursor) sp.set("cursor", params.cursor);
  sp.set("limit", String(params.limit ?? 25));
  return getJson<JobsResponse>(`/api/jobs?${sp.toString()}`);
}

export async function fetchTopCompanies(
  limit = 15,
): Promise<TopCompany[] | null> {
  const body = await getJson<{ companies?: TopCompany[] }>(
    `/api/companies/top?limit=${limit}`,
  );
  return body?.companies ?? null;
}

export async function fetchExampleJob(): Promise<JobRow | null> {
  const body = await fetchJobs({
    eligibility: "open,india_remote",
    limit: 12,
  });
  const rows = body?.results ?? [];
  if (rows.length === 0) return null;
  const scored = rows.find((j) => {
    const ev = Array.isArray(j.evidence) ? j.evidence.join(" ") : "";
    return /india|worldwide|anywhere|remote|global|hire from/i.test(ev);
  });
  return scored ?? rows[0] ?? null;
}
