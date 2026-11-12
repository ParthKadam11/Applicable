/**
 * Public REST helpers for the landing / dashboard (CORS-gated in app.ts).
 */
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companies, jobTags, jobs } from "../db/schema.js";
import { searchJobs } from "./tools.js";
import type { EligibilityFilter } from "./schemas.js";

const DEFAULT_ELIGIBILITY: EligibilityFilter[] = ["open", "india_remote"];

function techOpenBase() {
  return and(
    isNull(jobs.closedAt),
    eq(companies.active, true),
    or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
  );
}

export type PublicJobsQuery = {
  query?: string;
  eligibility?: EligibilityFilter[];
  role_keywords?: string;
  company?: string;
  posted_within_days?: number;
  cursor?: string;
  limit?: number;
};

export async function getPublicJobs(db: Db, q: PublicJobsQuery) {
  return searchJobs(db, {
    query: q.query,
    eligibility:
      q.eligibility && q.eligibility.length > 0
        ? q.eligibility
        : DEFAULT_ELIGIBILITY,
    role_keywords: q.role_keywords,
    company: q.company,
    posted_within_days: q.posted_within_days,
    cursor: q.cursor,
    limit: q.limit ?? 25,
  });
}

export function parsePositiveInt(
  raw: unknown,
  max: number,
): number | undefined {
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(max, Math.floor(n));
}

export async function getTopCompaniesHiringIndia(
  db: Db,
  limit = 15,
): Promise<{
  companies: Array<{
    id: string;
    name: string;
    website: string | null;
    open: number;
    india_remote: number;
    total: number;
  }>;
  count: number;
}> {
  const cap = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      website: companies.website,
      open: sql<number>`count(distinct ${jobs.id}) filter (
        where ${jobTags.indiaEligibility} = 'open'
      )`,
      indiaRemote: sql<number>`count(distinct ${jobs.id}) filter (
        where ${jobTags.indiaEligibility} = 'india_remote'
      )`,
      total: sql<number>`count(distinct ${jobs.id}) filter (
        where ${jobTags.indiaEligibility} in ('open', 'india_remote')
      )`,
    })
    .from(companies)
    .innerJoin(jobs, eq(jobs.companyId, companies.id))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(
        techOpenBase(),
        inArray(jobTags.indiaEligibility, ["open", "india_remote"]),
      ),
    )
    .groupBy(companies.id, companies.name, companies.website)
    .orderBy(
      desc(sql`count(distinct ${jobs.id}) filter (
        where ${jobTags.indiaEligibility} in ('open', 'india_remote')
      )`),
    )
    .limit(cap);

  return {
    companies: rows.map((r) => ({
      id: r.id,
      name: r.name,
      website: r.website,
      open: Number(r.open),
      india_remote: Number(r.indiaRemote),
      total: Number(r.total),
    })),
    count: rows.length,
  };
}

/** Parse eligibility query: comma-separated or repeated. */
export function parseEligibilityParam(
  raw: unknown,
): EligibilityFilter[] | undefined {
  const allowed = new Set<EligibilityFilter>([
    "open",
    "india_remote",
    "india_onsite",
    "region_locked",
    "unclear",
  ]);
  const parts: string[] = [];
  if (typeof raw === "string") {
    parts.push(...raw.split(","));
  } else if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string") parts.push(...v.split(","));
    }
  } else {
    return undefined;
  }
  const out: EligibilityFilter[] = [];
  for (const p of parts) {
    const t = p.trim() as EligibilityFilter;
    if (allowed.has(t) && !out.includes(t)) out.push(t);
  }
  return out.length > 0 ? out : undefined;
}

export function parseQueryString(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t || t.length > 200) return undefined;
  return t;
}
