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
      const ex = await explore(
        db,
        {
          start: { type: "company", value: input.company_slug },
          path: ["SIMILAR_TO"],
          max_results: limit,
        },
        { client },
      );
      if (ex.source !== "graph") {
        return fallback(db, input, ex.error ?? ex.source, started);
      }
      const companiesOut = ex.lines.map((line, i) => {
        // "Acme -SIMILAR_TO(0.52)-> Other"
        const m = line.match(/SIMILAR_TO\(([^)]+)\)->\s*(.+)$/);
        return {
          slug: null as string | null,
          name: m?.[2]?.trim() ?? `similar_${i}`,
          score: m ? Number(m[1]) : undefined,
          shared_skills: [] as string[],
          open_india_job_count: 0,
        };
      });
      const body: AskJobsResult = {
        source: "graph",
        op: input.op,
        jobs: [],
        companies: companiesOut.slice(0, limit),
        lines: ex.lines,
        count: companiesOut.length,
        latency_ms: Date.now() - started,
        approx_response_tokens: ex.tokens_used,
      };
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
      const ex = await explore(
        db,
        {
          start: { type: "skill", value: skill },
          path: ["REQUIRES"],
          filter: { labels },
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
        })),
        lines: ex.lines,
        count: ex.jobs.length,
        latency_ms: Date.now() - started,
        approx_response_tokens: ex.tokens_used,
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

void sql;
