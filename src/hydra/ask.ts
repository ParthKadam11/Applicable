import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companies, jobTags, jobs } from "../db/schema.js";
import type { EligibilityFilter } from "../mcp/schemas.js";
import { searchJobs } from "../mcp/tools.js";
import { createHydraClient, type HydraClient } from "./client.js";
import { HYDRA_COLLECTION, type HydraQueryData } from "./types.js";

export type AskJobsInput = {
  question: string;
  labels?: string[];
  max_results?: number;
};

export type AskJobsResult = {
  source: "hydradb" | "search_jobs_fallback";
  fallback_reason?: string;
  question: string;
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    location: string | null;
    eligibility: string | null;
    evidence: string[];
    apply_url: string;
    posted_at: string | null;
  }>;
  graph_paths: string[];
  evidence_quotes: string[];
  count: number;
  latency_ms: number;
  approx_response_tokens: number;
};

function approxTokens(payload: unknown): number {
  return Math.ceil(JSON.stringify(payload).length / 4);
}

function formatGraphPaths(data: HydraQueryData): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  const paths = data.graph_context?.query_paths ?? [];
  const chunkRels = data.graph_context?.chunk_relations ?? [];
  for (const path of [...paths, ...chunkRels]) {
    for (const t of path.triplets ?? []) {
      const src = t.source?.name ?? "?";
      const pred =
        t.relation?.canonical_predicate ??
        t.relation?.raw_predicate ??
        "related";
      const tgt = t.target?.name ?? "?";
      const line = `${src} -${pred}-> ${tgt}`;
      if (!seen.has(line)) {
        seen.add(line);
        lines.push(line);
      }
    }
  }
  return lines;
}

function collectEvidenceFromChunks(data: HydraQueryData): string[] {
  const quotes: string[] = [];
  const seen = new Set<string>();
  for (const chunk of data.chunks ?? []) {
    const meta = chunk.additional_metadata ?? {};
    // Prefer Postgres evidence after rehydrate; still surface chunk snippets lightly
    const content = chunk.chunk_content?.trim();
    if (content && content.length < 400 && !seen.has(content)) {
      // Skip long description dumps; evidence quotes are short
      if (content.startsWith('"') || content.length < 280) {
        seen.add(content);
        quotes.push(content);
      }
    }
    void meta;
  }
  return quotes;
}

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
      postedAt: jobs.postedAt,
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
  // Preserve Hydra ranking order; drop anything not still active in Postgres
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
      posted_at: r.postedAt?.toISOString() ?? null,
    });
  }
  return out;
}

async function fallbackSearch(
  db: Db,
  input: AskJobsInput,
  reason: string,
  started: number,
): Promise<AskJobsResult> {
  const labels: EligibilityFilter[] =
    input.labels && input.labels.length > 0
      ? (input.labels as EligibilityFilter[])
      : ["open", "india_remote"];
  const max = input.max_results ?? 10;
  const search = await searchJobs(db, {
    query: input.question,
    eligibility: labels,
    limit: max,
  });
  const jobsOut = search.results.map((r) => ({
    id: r.id,
    title: r.title,
    company: r.company,
    location: r.location,
    eligibility: r.eligibility,
    evidence: r.evidence ?? [],
    apply_url: r.apply_url,
    posted_at: r.posted_at,
  }));
  const body: AskJobsResult = {
    source: "search_jobs_fallback",
    fallback_reason: reason,
    question: input.question,
    jobs: jobsOut,
    graph_paths: [],
    evidence_quotes: jobsOut.flatMap((j) => j.evidence).slice(0, 40),
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
  client: HydraClient = createHydraClient(),
): Promise<AskJobsResult> {
  const started = Date.now();
  const labels =
    input.labels && input.labels.length > 0
      ? input.labels
      : ["open", "india_remote"];
  const maxResults = input.max_results ?? 10;

  if (!client.enabled) {
    return fallbackSearch(db, input, "hydradb_disabled", started);
  }

  try {
    const data = await client.queryKnowledge({
      query: input.question,
      maxResults,
      labels,
      collection: HYDRA_COLLECTION,
    });

    const orderedIds: string[] = [];
    const seen = new Set<string>();
    for (const chunk of data.chunks ?? []) {
      const id = chunk.id;
      if (id && !seen.has(id)) {
        seen.add(id);
        orderedIds.push(id);
      }
    }

    const jobsOut = await rehydrateJobs(db, orderedIds, labels);
    const evidenceFromPg = jobsOut.flatMap((j) => j.evidence);
    const evidenceQuotes =
      evidenceFromPg.length > 0
        ? [...new Set(evidenceFromPg)].slice(0, 40)
        : collectEvidenceFromChunks(data);

    const body: AskJobsResult = {
      source: "hydradb",
      question: input.question,
      jobs: jobsOut,
      graph_paths: formatGraphPaths(data),
      evidence_quotes: evidenceQuotes,
      count: jobsOut.length,
      latency_ms: Date.now() - started,
      approx_response_tokens: 0,
    };
    body.approx_response_tokens = approxTokens(body);

    console.log(
      JSON.stringify({
        type: "ask_jobs",
        question_length: input.question.length,
        result_count: body.count,
        latency_ms: body.latency_ms,
        approx_response_tokens: body.approx_response_tokens,
        source: body.source,
        ts: new Date().toISOString(),
      }),
    );

    return body;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ask_jobs] hydra error, falling back:`, msg);
    return fallbackSearch(db, input, `hydradb_error: ${msg}`, started);
  }
}
