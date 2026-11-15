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
  companyFacts,
  companyInvestors,
  companyPeople,
  corrections,
  fetchRuns,
  hydraSyncRuns,
  investors,
  jobTags,
  jobs,
  learnedPatterns,
  people,
} from "../db/schema.js";
import { countGraphTotals } from "../graph/cypher.js";
import { createGraphClient } from "../graph/driver.js";
import { domainFromUrl } from "../discover/ats-urls.js";
import {
  CorrectionError,
  recordCorrection,
} from "../learn/corrections.js";
import { loadLatestReport } from "../learn/eval-runner.js";
import {
  getDailyStatsHistory,
  type DailyStatsRow,
} from "../stats/daily.js";
import type {
  EligibilityFilter,
  FindCompaniesInputSchema,
  GetCompanyInputSchema,
  GetJobInputSchema,
  ListCompaniesInputSchema,
  ReportLabelInputSchema,
  SearchJobsInputSchema,
  StatsInputSchema,
  SubmitCompanyInputSchema,
} from "./schemas.js";
import { z } from "zod";

type SearchInput = z.input<typeof SearchJobsInputSchema>;
type GetCompanyInput = z.infer<typeof GetCompanyInputSchema>;
type FindCompaniesInput = z.infer<typeof FindCompaniesInputSchema>;
type GetJobInput = z.infer<typeof GetJobInputSchema>;
type ListCompaniesInput = z.infer<typeof ListCompaniesInputSchema>;
type StatsInput = z.infer<typeof StatsInputSchema>;
type SubmitCompanyInput = z.infer<typeof SubmitCompanyInputSchema>;
type ReportLabelInput = z.infer<typeof ReportLabelInputSchema>;

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
  const maxPerCompany = raw.max_per_company ?? 3;
  const roleKeywords = Array.isArray(raw.role_keywords)
    ? raw.role_keywords.join(" ")
    : raw.role_keywords;

  const conditions = [
    techOpenBase(),
    inArray(jobTags.indiaEligibility, eligibility),
  ];

  const searchText = [raw.query, roleKeywords]
    .filter((s): s is string => Boolean(s?.trim()))
    .join(" ")
    .trim();

  // Tokenize query/keywords; match ANY token in title OR description (not a phrase AND).
  // Title hits ranked higher via CASE in ORDER BY.
  if (searchText) {
    const tokens = searchText
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1)
      .slice(0, 8);
    const tokenConds = (tokens.length > 0 ? tokens : [searchText]).map((tok) => {
      const needle = `%${tok.replace(/[%_]/g, "\\$&")}%`;
      return or(
        ilike(jobs.title, needle),
        ilike(jobs.descriptionText, needle),
      )!;
    });
    conditions.push(or(...tokenConds)!);
  }
  if (raw.company) {
    conditions.push(ilike(companies.name, `%${raw.company}%`));
  }
  if (raw.location?.trim()) {
    const loc = raw.location.trim();
    // Common India city aliases (Bangalore ↔ Bengaluru).
    const aliases = [loc];
    if (/^bangalore$/i.test(loc)) aliases.push("Bengaluru");
    if (/^bengaluru$/i.test(loc)) aliases.push("Bangalore");
    if (/^bombay$/i.test(loc)) aliases.push("Mumbai");
    if (/^mumbai$/i.test(loc)) aliases.push("Bombay");
    if (/^madras$/i.test(loc)) aliases.push("Chennai");
    if (/^chennai$/i.test(loc)) aliases.push("Madras");
    if (/^calcutta$/i.test(loc)) aliases.push("Kolkata");
    if (/^kolkata$/i.test(loc)) aliases.push("Calcutta");
    conditions.push(
      or(
        ...aliases.map((a) => ilike(jobs.locationRaw, `%${a}%`)),
      )!,
    );
  }
  if (raw.posted_within_days) {
    const since = new Date(
      Date.now() - raw.posted_within_days * 24 * 60 * 60 * 1000,
    );
    conditions.push(gte(jobs.postedAt, since));
  }
  if (raw.early_career) {
    conditions.push(
      or(
        inArray(jobTags.seniority, ["intern", "entry", "junior"]),
        and(
          eq(jobTags.seniority, "mid"),
          sql`${jobTags.yearsExperienceMax} is not null and ${jobTags.yearsExperienceMax} <= 2`,
        ),
      )!,
    );
  } else if (raw.seniority?.length) {
    const levels = raw.seniority.flatMap((s) =>
      s === "entry" || s === "junior" ? ["entry", "junior"] : [s],
    );
    conditions.push(inArray(jobTags.seniority, levels));
  }

  const where = and(...conditions);

  const [{ total } = { total: 0 }] = await db
    .select({ total: countDistinct(jobs.id) })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(where);

  // Over-fetch then diversity-cap so a single company can't flood a page.
  const fetchN =
    maxPerCompany > 0 ? Math.min(500, Math.max(limit * 8, offset + 50)) : limit + 1;

  const titleTokens = searchText
    ? searchText
        .split(/[\s,]+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 1)
        .slice(0, 8)
    : [];
  const orderBy =
    titleTokens.length > 0
      ? [
          sql`case when ${or(
            ...titleTokens.map(
              (tok) => ilike(jobs.title, `%${tok.replace(/[%_]/g, "\\$&")}%`),
            ),
          )} then 0 else 1 end`,
          desc(jobs.postedAt),
          desc(jobs.lastSeenAt),
        ]
      : [desc(jobs.postedAt), desc(jobs.lastSeenAt)];

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: companies.name,
      companyId: companies.id,
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
    .where(where)
    .orderBy(...orderBy)
    .limit(fetchN)
    .offset(maxPerCompany > 0 ? 0 : offset);

  let ranked = rows;
  if (maxPerCompany > 0) {
    const perCompany = new Map<string, number>();
    const diversified: typeof rows = [];
    for (const r of rows) {
      const n = perCompany.get(r.companyId) ?? 0;
      if (n >= maxPerCompany) continue;
      perCompany.set(r.companyId, n + 1);
      diversified.push(r);
    }
    ranked = diversified.slice(offset, offset + limit + 1);
  }

  const hasMore = ranked.length > limit;
  const page = hasMore ? ranked.slice(0, limit) : ranked;
  const totalN = Number(total);

  const limitedInventory =
    Boolean(raw.early_career) && totalN < 5
      ? {
          message:
            "Limited early-career inventory right now. Try widening: drop early_career, include mid seniority, or add india_onsite eligibility.",
          suggestions: [
            "Set early_career=false and seniority=['intern','entry','mid']",
            "Add eligibility india_onsite alongside open / india_remote",
            "Broaden query / role_keywords, or raise posted_within_days",
          ],
        }
      : null;

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
    total: totalN,
    ...(limitedInventory ? { limited_inventory: limitedInventory } : {}),
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
      seniorityEvidence: jobTags.seniorityEvidence,
      yearsExperienceMin: jobTags.yearsExperienceMin,
      yearsExperienceMax: jobTags.yearsExperienceMax,
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
      seniority:
        row.seniority === "junior" ? "entry" : (row.seniority ?? null),
      seniority_evidence: row.seniorityEvidence ?? null,
      years_experience_min: row.yearsExperienceMin ?? null,
      years_experience_max: row.yearsExperienceMax ?? null,
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

export async function getCompany(db: Db, raw: GetCompanyInput) {
  const conditions = [eq(companies.active, true)];
  if (raw.id) conditions.push(eq(companies.id, raw.id));
  else if (raw.slug) conditions.push(eq(companies.slug, raw.slug));
  else if (raw.name) conditions.push(ilike(companies.name, `%${raw.name}%`));
  else {
    return { found: false as const, error: "Provide slug, name, or id" };
  }

  const [co] = await db
    .select()
    .from(companies)
    .where(and(...conditions))
    .limit(1);
  if (!co) return { found: false as const };

  const facts = await db
    .select({
      factType: companyFacts.factType,
      value: companyFacts.value,
      sourceUrl: companyFacts.sourceUrl,
      quote: companyFacts.quote,
      sourceKind: companyFacts.sourceKind,
      confidence: companyFacts.confidence,
    })
    .from(companyFacts)
    .where(eq(companyFacts.companyId, co.id))
    .limit(80);

  const founders = await db
    .select({
      name: people.name,
      title: companyPeople.title,
      role: companyPeople.role,
      source_url: companyPeople.sourceUrl,
      quote: companyPeople.quote,
    })
    .from(companyPeople)
    .innerJoin(people, eq(people.id, companyPeople.personId))
    .where(eq(companyPeople.companyId, co.id));

  const inv = await db
    .select({
      name: investors.name,
      round: companyInvestors.round,
      source_url: companyInvestors.sourceUrl,
      quote: companyInvestors.quote,
    })
    .from(companyInvestors)
    .innerJoin(investors, eq(investors.id, companyInvestors.investorId))
    .where(eq(companyInvestors.companyId, co.id));

  return {
    found: true as const,
    company: {
      id: co.id,
      name: co.name,
      slug: co.slug,
      website: co.website,
      ats: co.ats,
      founded_year: co.foundedYear,
      team_size: co.teamSize,
      one_liner: co.oneLiner,
      hq: {
        city: co.hqCity,
        country: co.hqCountry,
      },
      batch: co.ycBatch,
      enriched_at: co.enrichedAt?.toISOString() ?? null,
      founders,
      investors: inv,
      facts: facts.map((f) => ({
        type: f.factType,
        value: f.value,
        source_url: f.sourceUrl,
        quote: f.quote,
        source: f.sourceKind,
        confidence: f.confidence,
      })),
    },
  };
}

export async function findCompanies(db: Db, raw: FindCompaniesInput) {
  const limit = raw.limit ?? 20;
  const conditions = [eq(companies.active, true)];
  if (raw.batch) {
    conditions.push(ilike(companies.ycBatch, `%${raw.batch}%`));
  }
  if (raw.hq_country) {
    conditions.push(ilike(companies.hqCountry, `%${raw.hq_country}%`));
  }
  if (raw.team_size_min != null) {
    conditions.push(gte(companies.teamSize, raw.team_size_min));
  }
  if (raw.team_size_max != null) {
    conditions.push(
      sql`${companies.teamSize} is not null and ${companies.teamSize} <= ${raw.team_size_max}`,
    );
  }

  // Apply relational filters in SQL first (avoid 200-row prefetch misses).
  let idFilter: string[] | undefined;
  const intersect = (ids: string[]) => {
    if (idFilter === undefined) {
      idFilter = ids;
    } else {
      const allow = new Set(ids);
      idFilter = idFilter.filter((id) => allow.has(id));
    }
  };

  if (raw.investor) {
    const needle = `%${raw.investor}%`;
    const isYc =
      /y\s*combinator|\byc\b/i.test(raw.investor.trim());
    const matched = await db
      .select({ companyId: companyInvestors.companyId })
      .from(companyInvestors)
      .innerJoin(investors, eq(investors.id, companyInvestors.investorId))
      .where(ilike(investors.name, needle));
    const ids = new Set(matched.map((m) => m.companyId));
    if (isYc) {
      const ycBatch = await db
        .select({ id: companies.id })
        .from(companies)
        .where(
          and(
            eq(companies.active, true),
            sql`${companies.ycBatch} is not null and ${companies.ycBatch} <> ''`,
          ),
        );
      for (const r of ycBatch) ids.add(r.id);
    }
    intersect([...ids]);
  }
  if (raw.founder) {
    const needle = `%${raw.founder}%`;
    const matched = await db
      .select({ companyId: companyPeople.companyId })
      .from(companyPeople)
      .innerJoin(people, eq(people.id, companyPeople.personId))
      .where(ilike(people.name, needle));
    intersect(matched.map((m) => m.companyId));
  }
  if (raw.industry) {
    const needle = `%${raw.industry}%`;
    const matched = await db
      .select({ companyId: companyFacts.companyId })
      .from(companyFacts)
      .where(
        and(
          inArray(companyFacts.factType, ["industry", "tag"]),
          ilike(companyFacts.value, needle),
        ),
      );
    intersect(matched.map((m) => m.companyId));
  }
  if (raw.has_india_jobs) {
    const matched = await db
      .selectDistinct({ companyId: jobs.companyId })
      .from(jobs)
      .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(
        and(
          isNull(jobs.closedAt),
          eq(companies.active, true),
          or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
          inArray(jobTags.indiaEligibility, [
            "open",
            "india_remote",
            "india_onsite",
          ]),
        ),
      );
    intersect(matched.map((m) => m.companyId));
  }

  if (idFilter !== undefined) {
    if (idFilter.length === 0) {
      return { companies: [], count: 0 };
    }
    conditions.push(inArray(companies.id, idFilter));
  }

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      slug: companies.slug,
      website: companies.website,
      teamSize: companies.teamSize,
      hqCountry: companies.hqCountry,
      ycBatch: companies.ycBatch,
      oneLiner: companies.oneLiner,
      foundedYear: companies.foundedYear,
    })
    .from(companies)
    .where(and(...conditions))
    .orderBy(companies.name)
    .limit(limit);

  return {
    companies: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      website: r.website,
      team_size: r.teamSize,
      hq_country: r.hqCountry,
      batch: r.ycBatch,
      founded_year: r.foundedYear,
      one_liner: r.oneLiner,
    })),
    count: rows.length,
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
  graph: {
    enabled: boolean;
    nodes: number;
    edges: number;
    lastSyncAt: string | null;
    lastRun: {
      added: number;
      removed: number;
      relabels: number;
    } | null;
  };
  learning?: {
    corrections: number;
    patterns_learned: number;
    baseline_accuracy: number | null;
    learned_accuracy: number | null;
    accuracy_delta: number | null;
    status: string;
  };
  history?: DailyStatsRow[];
};

const STATS_TTL_MS = 60_000;
let statsCache: { at: number; key: string; value: McpStatsResult } | null =
  null;

/** Drop cached MCP stats (call after ingest / graph sync). */
export function invalidateMcpStatsCache(): void {
  statsCache = null;
}

export async function getMcpStats(
  db: Db,
  raw: StatsInput = {},
): Promise<McpStatsResult> {
  const cacheKey = JSON.stringify(raw ?? {});
  if (
    statsCache &&
    statsCache.key === cacheKey &&
    Date.now() - statsCache.at < STATS_TTL_MS
  ) {
    return statsCache.value;
  }

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

  const [lastGraph] = await db
    .select({
      finishedAt: hydraSyncRuns.finishedAt,
      startedAt: hydraSyncRuns.startedAt,
      nodesAdded: hydraSyncRuns.nodesAdded,
      edgesAdded: hydraSyncRuns.edgesAdded,
      removed: hydraSyncRuns.removed,
      relabels: hydraSyncRuns.relabels,
    })
    .from(hydraSyncRuns)
    .orderBy(desc(hydraSyncRuns.finishedAt), desc(hydraSyncRuns.startedAt))
    .limit(1);

  let nodes = 0;
  let edges = 0;
  const graphClient = createGraphClient();
  if (graphClient.enabled) {
    try {
      const totals = await countGraphTotals((cypher, params) =>
        graphClient.run(cypher, params),
      );
      nodes = totals.nodes;
      edges = totals.edges;
    } catch (err) {
      console.error(
        "[api/stats] graph count failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const result: McpStatsResult = {
    companies_active: Number(companiesActive),
    tech_open_jobs: techOpenTotal,
    by_eligibility: eligibility,
    last_ingestion_at:
      lastIngest?.finishedAt?.toISOString() ??
      lastIngest?.startedAt?.toISOString() ??
      null,
    graph: {
      enabled: Boolean(config.HYDRA_GRAPH_ENABLED && config.HYDRA_TOKEN),
      nodes,
      edges,
      lastSyncAt:
        lastGraph?.finishedAt?.toISOString() ??
        lastGraph?.startedAt?.toISOString() ??
        null,
      lastRun: lastGraph
        ? {
            added:
              Number(lastGraph.nodesAdded ?? 0) +
              Number(lastGraph.edgesAdded ?? 0),
            removed: Number(lastGraph.removed ?? 0),
            relabels: Number(lastGraph.relabels ?? 0),
          }
        : null,
    },
  };

  if (raw.history != null) {
    result.history = await getDailyStatsHistory(db, raw.history);
  }

  try {
    const [{ correctionsCount } = { correctionsCount: 0 }] = await db
      .select({ correctionsCount: count() })
      .from(corrections);
    const [{ patternsCount } = { patternsCount: 0 }] = await db
      .select({ patternsCount: count() })
      .from(learnedPatterns);
    const baseline = loadLatestReport("baseline");
    const learned = loadLatestReport("learned");
    const bAcc = baseline?.accuracy ?? null;
    const lAcc = learned?.accuracy ?? null;
    const status =
      bAcc != null || lAcc != null
        ? "ok"
        : "pending hand labels (run eval:baseline / eval:learned after gold-test)";
    result.learning = {
      corrections: Number(correctionsCount),
      patterns_learned: Number(patternsCount),
      baseline_accuracy: bAcc,
      learned_accuracy: lAcc,
      accuracy_delta:
        bAcc != null && lAcc != null ? lAcc - bAcc : null,
      status,
    };
  } catch (err) {
    console.error(
      "[api/stats] learning stats failed:",
      err instanceof Error ? err.message : err,
    );
    result.learning = {
      corrections: 0,
      patterns_learned: 0,
      baseline_accuracy: null,
      learned_accuracy: null,
      accuracy_delta: null,
      status: "pending hand labels",
    };
  }

  statsCache = { at: Date.now(), key: cacheKey, value: result };
  return result;
}

export async function reportLabel(db: Db, raw: ReportLabelInput) {
  try {
    const result = await recordCorrection(db, {
      jobId: raw.job_id,
      newLabel: raw.label,
      evidence: raw.evidence,
      source: "mcp",
    });
    return result;
  } catch (err) {
    if (err instanceof CorrectionError) {
      return { ok: false as const, error: err.message };
    }
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
