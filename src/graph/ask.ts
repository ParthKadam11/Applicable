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
import { companies, jobTags, jobs } from "../db/schema.js";
import type { EligibilityFilter } from "../mcp/schemas.js";
import {
  companyJobsBySkillQuery,
  matchSkillsQueryV2,
  similarCompaniesOpenJobsQuery,
  similarCompaniesQuery,
} from "./cypher.js";
import { createGraphClient, type GraphClient } from "./driver.js";
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
  count: number;
  latency_ms: number;
  approx_response_tokens: number;
};

function approxTokens(payload: unknown): number {
  return Math.ceil(JSON.stringify(payload).length / 4);
}

const DEFAULT_LABELS: EligibilityFilter[] = ["open", "india_remote"];

async function rehydrateJobs(
  db: Db,
  ids: string[],
  labels: string[],
): Promise<AskJobsResult["jobs"]> {
  if (ids.length === 0) return [];
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
        inArray(jobs.id, ids),
        isNull(jobs.closedAt),
        eq(companies.active, true),
        or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
        inArray(jobTags.indiaEligibility, labels),
      ),
    );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: AskJobsResult["jobs"] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    out.push({
      id: r.id,
      title: r.title,
      company: r.company,
      location: r.location ?? null,
      eligibility: r.eligibility ?? null,
      evidence: r.evidence ?? [],
      apply_url: r.applyUrl,
    });
  }
  return out;
}

/** Keyword split, any-word match on title/company/description (fallback only). */
export async function keywordFallbackSearch(
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

export async function askJobs(
  db: Db,
  input: AskJobsInput,
  client: GraphClient = createGraphClient(),
): Promise<AskJobsResult> {
  const started = Date.now();
  if (!client.enabled) {
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
      const q = matchSkillsQueryV2({ skills, labels });
      const { records } = await client.run(q.cypher, q.params);
      // App-side dedupe (no count(DISTINCT) in Cypher)
      const byJob = new Map<string, Set<string>>();
      for (const r of records) {
        const id = String(r.jobId ?? "");
        if (!id) continue;
        const set = byJob.get(id) ?? new Set();
        const sk = r.skillName != null ? String(r.skillName) : "";
        if (sk) set.add(sk);
        byJob.set(id, set);
      }
      const ranked = [...byJob.entries()]
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, limit);
      const ids = ranked.map(([id]) => id);
      const matched = new Map(ranked.map(([id, set]) => [id, [...set].sort()]));
      const jobsOut = await rehydrateJobs(db, ids, labels);
      for (const j of jobsOut) {
        j.matched_skills = matched.get(j.id) ?? [];
      }
      const body: AskJobsResult = {
        source: "graph",
        op: input.op,
        jobs: jobsOut,
        count: jobsOut.length,
        latency_ms: Date.now() - started,
        approx_response_tokens: 0,
      };
      body.approx_response_tokens = approxTokens(body);
      logAsk(body, input);
      return body;
    }

    if (input.op === "similar_companies") {
      const limit = input.max_results ?? 10;
      const q = similarCompaniesQuery({
        companySlug: input.company_slug,
      });
      const qJobs = similarCompaniesOpenJobsQuery({
        companySlug: input.company_slug,
      });
      // Two statements: avoid skills×jobs cartesian on precomputed SIMILAR_TO.
      const [{ records }, jobsRes] = await Promise.all([
        client.run(q.cypher, q.params),
        client.run(qJobs.cypher, qJobs.params),
      ]);
      type Agg = {
        slug: string | null;
        name: string;
        score: number;
        skills: Set<string>;
        jobs: Set<string>;
      };
      const byCo = new Map<string, Agg>();
      for (const r of records) {
        const key = String(r.companyId ?? r.slug ?? "");
        if (!key) continue;
        const agg = byCo.get(key) ?? {
          slug: (r.slug as string) || null,
          name: String(r.name ?? ""),
          score: Number(r.score ?? 0),
          skills: new Set<string>(),
          jobs: new Set<string>(),
        };
        if (r.sharedSkill != null) agg.skills.add(String(r.sharedSkill));
        byCo.set(key, agg);
      }
      for (const r of jobsRes.records) {
        const key = String(r.companyId ?? "");
        const agg = byCo.get(key);
        if (!agg) continue;
        if (r.jobId != null) agg.jobs.add(String(r.jobId));
      }
      const companiesOut = [...byCo.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((a) => ({
          slug: a.slug,
          name: a.name,
          score: a.score,
          shared_skills: [...a.skills].sort(),
          open_india_job_count: a.jobs.size,
        }));
      const body: AskJobsResult = {
        source: "graph",
        op: input.op,
        jobs: [],
        companies: companiesOut,
        count: companiesOut.length,
        latency_ms: Date.now() - started,
        approx_response_tokens: 0,
      };
      body.approx_response_tokens = approxTokens(body);
      logAsk(body, input);
      return body;
    }

    // company_jobs_by_skill
    {
      const labels =
        input.labels && input.labels.length > 0
          ? input.labels
          : DEFAULT_LABELS;
      const skill =
        normalizeSkill(input.skill) ?? input.skill.trim().toLowerCase();
      const limit = input.max_results ?? 10;
      const q = companyJobsBySkillQuery({ skill, labels });
      const { records } = await client.run(q.cypher, q.params);
      const seenJobs = new Set<string>();
      const ids: string[] = [];
      const companiesMap = new Map<
        string,
        { slug: string | null; name: string }
      >();
      for (const r of records) {
        const jid = String(r.jobId ?? "");
        if (jid && !seenJobs.has(jid)) {
          seenJobs.add(jid);
          ids.push(jid);
        }
        const ck = String(r.slug ?? r.companyId ?? "");
        if (ck && !companiesMap.has(ck)) {
          companiesMap.set(ck, {
            slug: (r.slug as string) || null,
            name: String(r.companyName ?? ""),
          });
        }
      }
      const jobsOut = await rehydrateJobs(db, ids.slice(0, limit), labels);
      const body: AskJobsResult = {
        source: "graph",
        op: input.op,
        jobs: jobsOut,
        companies: [...companiesMap.values()],
        count: jobsOut.length,
        latency_ms: Date.now() - started,
        approx_response_tokens: 0,
      };
      body.approx_response_tokens = approxTokens(body);
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

// silence unused import if sql needed later
void sql;
