import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { Db } from "../db/client.js";
import { config } from "../config.js";
import {
  companies,
  companyCandidates,
  fetchRuns,
  hydraSyncRuns,
  jobTags,
  jobs,
} from "../db/schema.js";
import { domainFromUrl } from "../discover/ats-urls.js";
import {
  getDailyStatsHistory,
  type DailyStatsRow,
} from "../stats/daily.js";
import type {
  EligibilityFilter,
  GetJobInputSchema,
  ListCompaniesInputSchema,
  SearchJobsInputSchema,
  StatsInputSchema,
  SubmitCompanyInputSchema,
} from "./schemas.js";
import { z } from "zod";

type SearchInput = z.infer<typeof SearchJobsInputSchema>;
type GetJobInput = z.infer<typeof GetJobInputSchema>;
type ListCompaniesInput = z.infer<typeof ListCompaniesInputSchema>;
type StatsInput = z.infer<typeof StatsInputSchema>;
type SubmitCompanyInput = z.infer<typeof SubmitCompanyInputSchema>;

const DEFAULT_ELIGIBILITY: EligibilityFilter[] = ["open", "india_remote"];

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { o?: unknown };
    const o = Number(raw.o);
    return Number.isFinite(o) && o >= 0 ? Math.floor(o) : 0;
  } catch {
    return 0;
  }
}

function excerpt(text: string, max = 800): string | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Open + active + tech roles only. */
function techOpenBase() {
  return and(
    isNull(jobs.closedAt),
    eq(companies.active, true),
    or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
  );
}

export async function searchJobs(db: Db, raw: SearchInput) {
  const eligibility =
    raw.eligibility && raw.eligibility.length > 0
      ? raw.eligibility
      : DEFAULT_ELIGIBILITY;
  const limit = raw.limit ?? 20;
  const offset = decodeCursor(raw.cursor);

  const conditions = [
    techOpenBase(),
    inArray(jobTags.indiaEligibility, eligibility),
  ];

  if (raw.query) {
    conditions.push(ilike(jobs.title, `%${raw.query}%`));
  }
  if (raw.role_keywords) {
    conditions.push(ilike(jobs.title, `%${raw.role_keywords}%`));
  }
  if (raw.company) {
    conditions.push(ilike(companies.name, `%${raw.company}%`));
  }
  if (raw.posted_within_days) {
    const since = new Date(
      Date.now() - raw.posted_within_days * 24 * 60 * 60 * 1000,
    );
    conditions.push(gte(jobs.postedAt, since));
  }

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: companies.name,
      companyWebsite: companies.website,
      location: jobs.locationRaw,
      eligibility: jobTags.indiaEligibility,
      evidence: jobTags.eligibilityEvidence,
      applyUrl: jobs.applyUrl,
      postedAt: jobs.postedAt,
      lastSeenAt: jobs.lastSeenAt,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(and(...conditions))
    .orderBy(desc(jobs.postedAt), desc(jobs.lastSeenAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    results: page.map((r) => ({
      id: r.id,
      title: r.title,
      company: r.company,
      company_website: r.companyWebsite ?? null,
      location: r.location ?? null,
      eligibility: r.eligibility ?? null,
      evidence: r.evidence ?? [],
      apply_url: r.applyUrl,
      posted_at: r.postedAt?.toISOString() ?? null,
      last_seen_at: r.lastSeenAt?.toISOString() ?? null,
    })),
    next_cursor: hasMore ? encodeCursor(offset + limit) : null,
    count: page.length,
  };
}

export async function getJob(db: Db, raw: GetJobInput) {
  const [row] = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: companies.name,
      companyId: companies.id,
      location: jobs.locationRaw,
      department: jobs.department,
      employmentType: jobs.employmentType,
      isRemoteFlag: jobs.isRemoteFlag,
      applyUrl: jobs.applyUrl,
      postedAt: jobs.postedAt,
      lastSeenAt: jobs.lastSeenAt,
      firstSeenAt: jobs.firstSeenAt,
      closedAt: jobs.closedAt,
      descriptionText: jobs.descriptionText,
      indiaEligibility: jobTags.indiaEligibility,
      eligibilityEvidence: jobTags.eligibilityEvidence,
      remoteScope: jobTags.remoteScope,
      interviewStyle: jobTags.interviewStyle,
      interviewStyleEvidence: jobTags.interviewStyleEvidence,
      contractorOrEor: jobTags.contractorOrEor,
      contractorOrEorEvidence: jobTags.contractorOrEorEvidence,
      seniority: jobTags.seniority,
      roleFamily: jobTags.roleFamily,
      classifier: jobTags.classifier,
      model: jobTags.model,
      classifiedAt: jobTags.classifiedAt,
      compensationMin: jobTags.compensationMin,
      compensationMax: jobTags.compensationMax,
      compensationCurrency: jobTags.compensationCurrency,
      compensationPeriod: jobTags.compensationPeriod,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(eq(jobs.id, raw.id))
    .limit(1);

  if (!row) {
    return { found: false as const, job: null };
  }

  return {
    found: true as const,
    job: {
      id: row.id,
      title: row.title,
      company: row.company,
      location: row.location ?? null,
      department: row.department ?? null,
      employment_type: row.employmentType ?? null,
      is_remote_flag: row.isRemoteFlag ?? null,
      apply_url: row.applyUrl,
      posted_at: row.postedAt?.toISOString() ?? null,
      last_seen_at: row.lastSeenAt?.toISOString() ?? null,
      first_seen_at: row.firstSeenAt?.toISOString() ?? null,
      closed_at: row.closedAt?.toISOString() ?? null,
      open: row.closedAt == null,
      eligibility: row.indiaEligibility ?? null,
      eligibility_evidence: row.eligibilityEvidence ?? [],
      remote_scope: row.remoteScope ?? null,
      interview_style: row.interviewStyle ?? [],
      interview_style_evidence: row.interviewStyleEvidence ?? {},
      contractor_or_eor: row.contractorOrEor ?? null,
      contractor_or_eor_evidence: row.contractorOrEorEvidence ?? null,
      seniority: row.seniority ?? null,
      role_family: row.roleFamily ?? null,
      classifier: row.classifier ?? null,
      classification_source:
        row.classifier === "llm"
          ? "llm"
          : row.classifier === "rules" || row.classifier === "cache"
            ? "rules"
            : (row.classifier ?? null),
      model: row.model ?? null,
      classified_at: row.classifiedAt?.toISOString() ?? null,
      compensation:
        row.compensationMin != null || row.compensationMax != null
          ? {
              min: row.compensationMin ?? null,
              max: row.compensationMax ?? null,
              currency: row.compensationCurrency ?? null,
              period: row.compensationPeriod ?? null,
            }
          : null,
      description_excerpt: excerpt(row.descriptionText),
    },
  };
}

export async function listCompanies(db: Db, raw: ListCompaniesInput) {
  const limit = raw.limit ?? 25;
  const conditions = [eq(companies.active, true)];
  if (raw.query) conditions.push(ilike(companies.name, `%${raw.query}%`));
  if (raw.ats) conditions.push(eq(companies.ats, raw.ats));

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      website: companies.website,
      ats: companies.ats,
      atsSlug: companies.atsSlug,
      openJobs: sql<number>`count(distinct ${jobs.id}) filter (where ${jobs.closedAt} is null)`,
      indiaEligible: sql<number>`count(distinct ${jobs.id}) filter (
        where ${jobs.closedAt} is null
        and ${jobTags.roleFamily} is distinct from 'non_tech'
        and ${jobTags.indiaEligibility} in ('open', 'india_remote', 'india_onsite')
      )`,
    })
    .from(companies)
    .leftJoin(jobs, eq(jobs.companyId, companies.id))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(and(...conditions))
    .groupBy(
      companies.id,
      companies.name,
      companies.website,
      companies.ats,
      companies.atsSlug,
    )
    .orderBy(companies.name)
    .limit(limit);

  return {
    companies: rows.map((r) => ({
      id: r.id,
      name: r.name,
      website: r.website,
      ats: r.ats,
      ats_slug: r.atsSlug,
      open_job_count: Number(r.openJobs),
      india_eligible_count: Number(r.indiaEligible),
    })),
    count: rows.length,
  };
}

export type McpStatsResult = {
  companies_active: number;
  tech_open_jobs: number;
  by_eligibility: Record<string, number>;
  last_ingestion_at: string | null;
  hydra: {
    enabled: boolean;
    lastSyncAt: string | null;
    syncedJobs: number;
  };
  history?: DailyStatsRow[];
};

export async function getMcpStats(
  db: Db,
  raw: StatsInput = {},
): Promise<McpStatsResult> {
  const openActive = and(isNull(jobs.closedAt), eq(companies.active, true));
  const techOpen = and(
    openActive,
    or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
  );

  const [{ companiesActive } = { companiesActive: 0 }] = await db
    .select({ companiesActive: count() })
    .from(companies)
    .where(eq(companies.active, true));

  const byEligibility = await db
    .select({
      indiaEligibility: jobTags.indiaEligibility,
      n: countDistinct(sql`(${jobs.companyId}, ${jobs.externalId})`),
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(techOpen)
    .groupBy(jobTags.indiaEligibility);

  const eligibility: Record<string, number> = {};
  let techOpenTotal = 0;
  for (const row of byEligibility) {
    const key = row.indiaEligibility ?? "null";
    const n = Number(row.n);
    eligibility[key] = n;
    techOpenTotal += n;
  }

  const [lastIngest] = await db
    .select({
      finishedAt: fetchRuns.finishedAt,
      startedAt: fetchRuns.startedAt,
      ok: fetchRuns.ok,
    })
    .from(fetchRuns)
    .where(eq(fetchRuns.ok, true))
    .orderBy(desc(fetchRuns.finishedAt), desc(fetchRuns.startedAt))
    .limit(1);

  const [{ syncedJobs } = { syncedJobs: 0 }] = await db
    .select({
      syncedJobs: sql<number>`count(*) filter (where ${jobs.hydraSyncedAt} is not null)`,
    })
    .from(jobs);

  const [lastHydra] = await db
    .select({
      finishedAt: hydraSyncRuns.finishedAt,
      startedAt: hydraSyncRuns.startedAt,
    })
    .from(hydraSyncRuns)
    .orderBy(desc(hydraSyncRuns.finishedAt), desc(hydraSyncRuns.startedAt))
    .limit(1);

  const result: McpStatsResult = {
    companies_active: Number(companiesActive),
    tech_open_jobs: techOpenTotal,
    by_eligibility: eligibility,
    last_ingestion_at:
      lastIngest?.finishedAt?.toISOString() ??
      lastIngest?.startedAt?.toISOString() ??
      null,
    hydra: {
      enabled: Boolean(config.HYDRADB_ENABLED && config.HYDRADB_API_KEY),
      lastSyncAt:
        lastHydra?.finishedAt?.toISOString() ??
        lastHydra?.startedAt?.toISOString() ??
        null,
      syncedJobs: Number(syncedJobs),
    },
  };

  if (raw.history != null) {
    result.history = await getDailyStatsHistory(db, raw.history);
  }

  return result;
}

export async function submitCompany(db: Db, raw: SubmitCompanyInput) {
  const name = raw.name.trim();
  let url: URL;
  try {
    url = new URL(raw.careers_url);
  } catch {
    return {
      ok: false as const,
      error: "invalid_careers_url",
      message: "careers_url must be a valid http(s) URL",
    };
  }
  if (!/^https?:$/i.test(url.protocol)) {
    return {
      ok: false as const,
      error: "invalid_careers_url",
      message: "careers_url must use http or https",
    };
  }

  const domain = domainFromUrl(url.toString());
  const source = "mcp_submit";

  const [existing] = await db
    .select({
      id: companyCandidates.id,
      status: companyCandidates.status,
    })
    .from(companyCandidates)
    .where(
      and(
        eq(companyCandidates.source, source),
        sql`lower(${companyCandidates.name}) = ${name.toLowerCase()}`,
      ),
    )
    .limit(1);

  if (existing) {
    return {
      ok: true as const,
      deduped: true as const,
      candidate_id: existing.id,
      status: existing.status,
      message: "Company already in candidates queue",
    };
  }

  const [inserted] = await db
    .insert(companyCandidates)
    .values({
      name,
      domain,
      source,
      status: "pending",
      evidenceUrl: url.toString(),
      updatedAt: new Date(),
    })
    .returning({ id: companyCandidates.id, status: companyCandidates.status });

  return {
    ok: true as const,
    deduped: false as const,
    candidate_id: inserted!.id,
    status: inserted!.status,
    message: "Queued for review (no auto-promote)",
  };
}
