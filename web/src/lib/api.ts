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
  company_website?: string | null;
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

async function getJson<T>(
  path: string,
  init?: RequestInit & { revalidate?: number },
): Promise<T | null> {
  const { revalidate = REVALIDATE_SECONDS, ...rest } = init ?? {};
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      next: { revalidate },
      headers: {
        Accept: "application/json",
        ...(rest.headers ?? {}),
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

/** Landing stats — refreshed about once a minute. */
export async function fetchLandingStats(): Promise<Stats | null> {
  return getJson<Stats>("/api/stats", { revalidate: 60 });
}

let lastLandingFeed: JobRow[] | null = null;

function hasGoodEvidence(job: JobRow): boolean {
  const q = evidenceQuoteFromJob(job.evidence);
  return Boolean(q && q.length >= 4);
}

function evidenceQuoteFromJob(evidence: unknown): string | null {
  if (!Array.isArray(evidence) || evidence.length === 0) return null;
  const first = evidence[0];
  if (typeof first === "string" && first.trim()) return first.trim();
  if (first && typeof first === "object" && "quote" in first) {
    const q = (first as { quote?: unknown }).quote;
    if (typeof q === "string" && q.trim()) return q.trim();
  }
  return null;
}

/**
 * ~30 recent India-relevant jobs with evidence, ≤2 per company.
 * Cached 10 minutes; falls back to last good in-process snapshot.
 */
export async function fetchLandingFeedJobs(): Promise<JobRow[]> {
  const body = await getJson<JobsResponse>(
    "/api/jobs?eligibility=open,india_remote,india_onsite&limit=80",
    { revalidate: 600 },
  );
  const rows = body?.results ?? [];
  if (rows.length === 0) return lastLandingFeed ?? [];

  const perCompany = new Map<string, number>();
  const picked: JobRow[] = [];
  for (const job of rows) {
    if (!hasGoodEvidence(job)) continue;
    if (
      job.eligibility !== "open" &&
      job.eligibility !== "india_remote" &&
      job.eligibility !== "india_onsite"
    ) {
      continue;
    }
    const key = job.company.trim().toLowerCase();
    const n = perCompany.get(key) ?? 0;
    if (n >= 2) continue;
    perCompany.set(key, n + 1);
    picked.push(job);
    if (picked.length >= 30) break;
  }

  if (picked.length === 0) return lastLandingFeed ?? [];
  lastLandingFeed = picked;
  return picked;
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

export type LlmProviderStatus = {
  id: string;
  label: string;
  model: string;
  configured: boolean;
  exhausted: boolean;
  exhausted_until: string | null;
  calls_today: number;
};

export type LlmStatus = {
  mode: "byok";
  summary: string;
  any_ready: boolean;
  providers: LlmProviderStatus[];
};

export async function fetchLlmStatus(): Promise<LlmStatus | null> {
  return getJson<LlmStatus>("/api/llm", {
    next: { revalidate: 60 },
  });
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
