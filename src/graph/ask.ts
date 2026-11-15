import {
  and,
  eq,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  companies,
  companyFacts,
  companyInvestors,
  jobTags,
  jobs,
} from "../db/schema.js";
import type { EligibilityFilter } from "../mcp/schemas.js";
import {
  similarCompaniesOpenJobsQuery,
  similarCompaniesQuery,
} from "./cypher.js";
import { createGraphClient, type GraphClient } from "./driver.js";
import { explore } from "./explore.js";
import { normalizeSkill } from "./skills.js";

export type AskJobsInput =
  | {
      op: "match_skills";
      skills: string[];
      labels?: EligibilityFilter[];
      max_results?: number;
    }
  | {
      op: "similar_companies";
      company_slug: string;
      max_results?: number;
    }
  | {
      op: "company_jobs_by_skill";
      skill: string;
      company_slug: string;
      labels?: EligibilityFilter[];
      max_results?: number;
    };

export type AskJobsResult = {
  source: "graph" | "search_jobs_fallback";
  fallback_reason?: string;
  op: AskJobsInput["op"];
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    location: string | null;
    eligibility: string | null;
    evidence: string[];
    apply_url: string;
    matched_skills?: string[];
  }>;
  companies?: Array<{
    slug: string | null;
    name: string;
    score?: number;
    shared_skills?: string[];
    open_india_job_count?: number;
  }>;
  /** Path lines from explore (compatibility alias). */
  lines?: string[];
  count: number;
  latency_ms: number;
  approx_response_tokens: number;
};

function approxTokens(payload: unknown): number {
  return Math.ceil(JSON.stringify(payload).length / 4);
}

const DEFAULT_LABELS: EligibilityFilter[] = ["open", "india_remote"];

async function keywordFallbackSearch(
  db: Db,
  question: string,
  labels: EligibilityFilter[],
  limit: number,
): Promise<AskJobsResult["jobs"]> {
  const words = question
    .split(/[^a-zA-Z0-9_+#.-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1)
    .slice(0, 8);
  if (words.length === 0) return [];

  const wordConds = words.map(
    (w) =>
      or(
        ilike(jobs.title, `%${w}%`),
        ilike(companies.name, `%${w}%`),
        ilike(jobs.descriptionText, `%${w}%`),
      )!,
  );

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: companies.name,
      location: jobs.locationRaw,
      eligibility: jobTags.indiaEligibility,
      evidence: jobTags.eligibilityEvidence,
      applyUrl: jobs.applyUrl,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(
        isNull(jobs.closedAt),
        eq(companies.active, true),
        or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
        inArray(jobTags.indiaEligibility, labels),
        or(...wordConds),
      ),
    )
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    company: r.company,
    location: r.location ?? null,
    eligibility: r.eligibility ?? null,
    evidence: r.evidence ?? [],
    apply_url: r.applyUrl,
  }));
}

async function fallback(
  db: Db,
  input: AskJobsInput,
  reason: string,
  started: number,
): Promise<AskJobsResult> {
  const labels =
    input.op === "similar_companies"
      ? DEFAULT_LABELS
      : input.labels && input.labels.length > 0
        ? input.labels
        : DEFAULT_LABELS;
  const limit = input.max_results ?? 10;
  const q =
    input.op === "match_skills"
      ? input.skills.join(" ")
      : input.op === "company_jobs_by_skill"
        ? input.skill
        : input.company_slug;
  const jobsOut = await keywordFallbackSearch(db, q, labels, limit);
  const body: AskJobsResult = {
    source: "search_jobs_fallback",
    fallback_reason: reason,
    op: input.op,
    jobs: jobsOut,
    count: jobsOut.length,
    latency_ms: Date.now() - started,
    approx_response_tokens: 0,
  };
  body.approx_response_tokens = approxTokens(body);
  return body;
}

/**
 * Compatibility alias — maps legacy ops onto `explore` path queries.
 */
export async function askJobs(
  db: Db,
  input: AskJobsInput,
  client: GraphClient = createGraphClient(),
): Promise<AskJobsResult> {
  const started = Date.now();
  if (!client.enabled) {
    if (input.op === "similar_companies") {
      const resolved = await similarCompaniesResolved(
        db,
        client,
        input.company_slug,
        input.max_results ?? 10,
      );
      if (resolved.companies.length > 0) {
        const companiesOut = resolved.companies;
        const body: AskJobsResult = {
          source: "search_jobs_fallback",
          fallback_reason: "graph_disabled",
          op: input.op,
          jobs: [],
          companies: companiesOut,
          lines: companiesOut.map(
            (c) =>
              `${input.company_slug} -SIMILAR_TO(${c.score ?? "?"})-> ${c.name}`,
          ),
          count: companiesOut.length,
          latency_ms: Date.now() - started,
          approx_response_tokens: Math.ceil(companiesOut.length * 12),
        };
        logAsk(body, input);
        return body;
      }
    }
    return fallback(db, input, "graph_disabled", started);
  }

  try {
    if (input.op === "match_skills") {
      const labels =
        input.labels && input.labels.length > 0
          ? input.labels
          : DEFAULT_LABELS;
      const skills = input.skills
        .map((s) => normalizeSkill(s) ?? s.trim().toLowerCase())
        .filter(Boolean);
      const limit = input.max_results ?? 10;
      const ex = await explore(
        db,
        {
          start: { type: "skill", value: skills[0] },
          path: ["REQUIRES"],
          filter: { labels, skills },
          max_results: limit,
        },
        { client },
      );
      if (ex.source !== "graph") {
        return fallback(db, input, ex.error ?? ex.source, started);
      }
      const body: AskJobsResult = {
        source: "graph",
        op: input.op,
        jobs: ex.jobs.map((j) => ({
          id: j.id,
          title: j.title,
          company: j.company,
          location: null,
          eligibility: j.label,
          evidence: [],
          apply_url: j.apply_url,
          matched_skills: skills,
        })),
        lines: ex.lines,
        count: ex.jobs.length,
        latency_ms: Date.now() - started,
        approx_response_tokens: ex.tokens_used,
      };
      logAsk(body, input);
      return body;
    }

    if (input.op === "similar_companies") {
      const limit = input.max_results ?? 10;
      const resolved = await similarCompaniesResolved(
        db,
        client,
        input.company_slug,
        limit,
      );
      if (resolved.error && resolved.companies.length === 0) {
        return fallback(db, input, resolved.error, started);
      }
      const companiesOut = resolved.companies;
      if (companiesOut.length === 0) {
        return fallback(db, input, "no_similar_companies", started);
      }
      const body: AskJobsResult = {
        source: "graph",
        op: input.op,
        jobs: [],
        companies: companiesOut,
        lines: companiesOut.map(
          (c) =>
            `${input.company_slug} -SIMILAR_TO(${c.score ?? "?"})-> ${c.name}`,
        ),
        count: companiesOut.length,
        latency_ms: Date.now() - started,
        approx_response_tokens: Math.ceil(companiesOut.length * 12),
      };
      logAsk(body, input);
      return body;
    }

    // company_jobs_by_skill — always scoped to company_slug
    {
      const labels =
        input.labels && input.labels.length > 0
          ? input.labels
          : DEFAULT_LABELS;
      const skill =
        normalizeSkill(input.skill) ?? input.skill.trim().toLowerCase();
      const limit = input.max_results ?? 10;
      const companyJobs = await companyJobsBySkillSql(
        db,
        input.company_slug,
        skill,
        labels,
        limit,
      );
      const body: AskJobsResult = {
        source: "graph",
        op: input.op,
        jobs: companyJobs,
        lines: companyJobs.map(
          (j) => `${j.company} | ${j.title} | skill=${skill}`,
        ),
        count: companyJobs.length,
        latency_ms: Date.now() - started,
        approx_response_tokens: Math.ceil(companyJobs.length * 20),
      };
      logAsk(body, input);
      return body;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ask_jobs] graph error, falling back:", msg);
    return fallback(db, input, `graph_error: ${msg}`, started);
  }
}

function logAsk(body: AskJobsResult, input: AskJobsInput): void {
  console.log(
    JSON.stringify({
      type: "ask_jobs",
      op: input.op,
      result_count: body.count,
      latency_ms: body.latency_ms,
      approx_response_tokens: body.approx_response_tokens,
      source: body.source,
      ts: new Date().toISOString(),
    }),
  );
}

async function companyJobsBySkillSql(
  db: Db,
  companySlug: string,
  skill: string,
  labels: EligibilityFilter[],
  limit: number,
): Promise<AskJobsResult["jobs"]> {
  const needle = `%${skill}%`;
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: companies.name,
      location: jobs.locationRaw,
      eligibility: jobTags.indiaEligibility,
      evidence: jobTags.eligibilityEvidence,
      applyUrl: jobs.applyUrl,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(
        isNull(jobs.closedAt),
        eq(companies.active, true),
        eq(companies.slug, companySlug),
        inArray(jobTags.indiaEligibility, labels),
        or(ilike(jobs.title, needle), ilike(jobs.descriptionText, needle)),
      ),
    )
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    company: r.company,
    location: r.location ?? null,
    eligibility: r.eligibility ?? null,
    evidence: r.evidence ?? [],
    apply_url: r.applyUrl,
  }));
}

async function similarCompaniesResolved(
  db: Db,
  client: GraphClient,
  companySlug: string,
  limit: number,
): Promise<{
  companies: NonNullable<AskJobsResult["companies"]>;
  error?: string;
}> {
  const bySlug = new Map<
    string,
    {
      slug: string | null;
      name: string;
      score?: number;
      shared_skills: string[];
      open_india_job_count: number;
    }
  >();
  let graphError: string | undefined;

  if (client.enabled) {
    try {
      const q = similarCompaniesQuery({ companySlug });
      const { records } = await client.run(q.cypher, q.params);
      for (const rec of records) {
        const slug = String(rec.slug ?? "") || null;
        const name = String(rec.name ?? slug ?? "unknown");
        const key = slug ?? name;
        const existing = bySlug.get(key) ?? {
          slug,
          name,
          score: rec.score != null ? Number(rec.score) : undefined,
          shared_skills: [] as string[],
          open_india_job_count: 0,
        };
        const skill = rec.sharedSkill != null ? String(rec.sharedSkill) : "";
        if (skill && !existing.shared_skills.includes(skill)) {
          existing.shared_skills.push(skill);
        }
        bySlug.set(key, existing);
      }
      const jobQ = similarCompaniesOpenJobsQuery({ companySlug });
      const jobRes = await client.run(jobQ.cypher, jobQ.params);
      const counts = new Map<string, number>();
      for (const rec of jobRes.records) {
        const id = String(rec.companyId ?? "");
        if (!id || !rec.jobId) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      void counts;
    } catch (err) {
      graphError = err instanceof Error ? err.message : String(err);
      console.warn("[ask_jobs] similar_companies graph failed:", graphError);
    }
  }

  if (bySlug.size === 0) {
    // Postgres fallback: shared industry / investor / YC batch
    // (also used when graph is empty or errored — do not skip on graphError)
    const [seed] = await db
      .select()
      .from(companies)
      .where(eq(companies.slug, companySlug))
      .limit(1);
    if (!seed) return { companies: [], error: graphError };

    const industryRows = await db
      .select({ value: companyFacts.value })
      .from(companyFacts)
      .where(
        and(
          eq(companyFacts.companyId, seed.id),
          inArray(companyFacts.factType, ["industry", "tag"]),
        ),
      )
      .limit(20);
    const industries = industryRows.map((r) => r.value);

    const invRows = await db
      .select({ investorId: companyInvestors.investorId })
      .from(companyInvestors)
      .where(eq(companyInvestors.companyId, seed.id));
    const invIds = invRows.map((r) => r.investorId);

    const candidates = await db
      .select({
        id: companies.id,
        slug: companies.slug,
        name: companies.name,
        ycBatch: companies.ycBatch,
      })
      .from(companies)
      .where(and(eq(companies.active, true), ne(companies.id, seed.id)))
      .limit(300);

    const scored: Array<{
      slug: string | null;
      name: string;
      score: number;
      shared_skills: string[];
      open_india_job_count: number;
    }> = [];

    for (const c of candidates) {
      let score = 0;
      const shared: string[] = [];
      if (seed.ycBatch && c.ycBatch && seed.ycBatch === c.ycBatch) {
        score += 0.4;
        shared.push(`batch:${c.ycBatch}`);
      }
      if (industries.length) {
        const theirs = await db
          .select({ value: companyFacts.value })
          .from(companyFacts)
          .where(
            and(
              eq(companyFacts.companyId, c.id),
              inArray(companyFacts.factType, ["industry", "tag"]),
            ),
          )
          .limit(20);
        for (const t of theirs) {
          if (industries.includes(t.value)) {
            score += 0.15;
            shared.push(t.value);
          }
        }
      }
      if (invIds.length) {
        const theirs = await db
          .select({ investorId: companyInvestors.investorId })
          .from(companyInvestors)
          .where(eq(companyInvestors.companyId, c.id));
        const set = new Set(theirs.map((t) => t.investorId));
        for (const id of invIds) {
          if (set.has(id)) score += 0.25;
        }
      }
      if (score <= 0) continue;
      const [{ n } = { n: 0 }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(jobs)
        .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
        .where(
          and(
            eq(jobs.companyId, c.id),
            isNull(jobs.closedAt),
            inArray(jobTags.indiaEligibility, [
              "open",
              "india_remote",
              "india_onsite",
            ]),
          ),
        );
      scored.push({
        slug: c.slug,
        name: c.name,
        score: Math.min(1, score),
        shared_skills: shared.slice(0, 8),
        open_india_job_count: Number(n),
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return { companies: scored.slice(0, limit), error: graphError };
  }

  return { companies: [...bySlug.values()].slice(0, limit) };
}

void sql;
