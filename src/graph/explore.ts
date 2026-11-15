import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companies, jobTags, jobs } from "../db/schema.js";
import type { EligibilityFilter } from "../mcp/schemas.js";
import { createGraphClient, type GraphClient } from "./driver.js";
import {
  buildExploreCypher,
  type ExploreHop,
  type StartType,
  validateExplorePath,
} from "./hops.js";
import { graphIds } from "./ids.js";
import { normalizeSkill } from "./skills.js";
import { syncUserSavedEdges } from "./saved.js";

export type ExploreInput = {
  start: { type: StartType; value?: string };
  path: string[];
  filter?: { labels?: EligibilityFilter[]; skills?: string[] };
  max_results?: number;
  max_tokens?: number;
};

export type ExploreJobCard = {
  id: string;
  title: string;
  company: string;
  label: string | null;
  apply_url: string;
};

export type ExploreResult = {
  source: "graph" | "disabled" | "error";
  error?: string;
  lines: string[];
  jobs: ExploreJobCard[];
  tokens_used: number;
  truncated: boolean;
  latency_ms: number;
};

const DEFAULT_LABELS: EligibilityFilter[] = ["open", "india_remote"];

export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function trimLinesToTokens(
  lines: string[],
  maxTokens: number,
): { lines: string[]; truncated: boolean; tokens_used: number } {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const t = approxTokens(line + "\n");
    if (used + t > maxTokens && kept.length > 0) {
      return { lines: kept, truncated: true, tokens_used: used };
    }
    if (t > maxTokens && kept.length === 0) {
      // single oversized line — keep truncated slice
      const budget = Math.max(16, maxTokens * 4);
      kept.push(line.slice(0, budget));
      return {
        lines: kept,
        truncated: true,
        tokens_used: approxTokens(kept.join("\n")),
      };
    }
    kept.push(line);
    used += t;
  }
  return { lines: kept, truncated: false, tokens_used: used };
}

export function fmtProof(quote: unknown): string {
  if (quote == null) return "";
  const s = String(quote).replace(/\s+/g, " ").trim();
  if (!s) return "";
  const cut = s.length > 120 ? `${s.slice(0, 117)}...` : s;
  return ` | proof: "${cut}"`;
}

/** Strip any existing proof suffix (graph or prior attach). */
export function stripProof(line: string): string {
  return line.replace(/\s*\|\s*proof:\s*"[^"]*"\s*$/i, "").trimEnd();
}

/**
 * Attach india_eligibility evidence from Postgres job_tags (SoT).
 * Never use arbitrary PROVEN_BY / funding / benefits quotes from the graph.
 */
export function attachEligibilityProof(
  line: string,
  evidenceByJobId: Map<string, string | null>,
): string {
  const base = stripProof(line);
  const m = base.match(/\[job:([0-9a-f-]{36})\]/i);
  if (!m) return base;
  const quote = evidenceByJobId.get(m[1]!);
  if (!quote) return base;
  return `${base}${fmtProof(quote)}`;
}

function formatPathLine(
  record: Record<string, unknown>,
  hops: ExploreHop[],
  kinds: import("./hops.js").NodeKind[],
): { line: string; jobId: string | null } {
  const parts: string[] = [];
  let jobId: string | null = null;

  for (let i = 0; i < kinds.length; i += 1) {
    const k = kinds[i]!;
    const a = `n${i}`;
    if (i > 0) {
      const hop = hops[i - 1]!;
      const rel = `r${i - 1}`;
      if (hop === "SIMILAR_TO") {
        const score = record[`${rel}_score`];
        const sc =
          typeof score === "number" ? score.toFixed(2) : String(score ?? "?");
        parts.push(`-SIMILAR_TO(${sc})->`);
      } else {
        parts.push(`-${hop}->`);
      }
    }
    if (k === "Company") {
      parts.push(String(record[`${a}_name`] ?? record[`${a}_slug`] ?? "Company"));
    } else if (k === "Job") {
      const id = record[`${a}_ext`] != null ? String(record[`${a}_ext`]) : null;
      if (id) jobId = id;
      const title = String(record[`${a}_title`] ?? "Job");
      parts.push(`"${title}" [job:${id ?? "?"}]`);
    } else if (k === "Skill") {
      parts.push(String(record[`${a}_name`] ?? "skill"));
    } else if (k === "Label") {
      parts.push(String(record[`${a}_name`] ?? "label"));
    } else if (k === "User") {
      parts.push("me");
    } else if (k === "Investor" || k === "Person" || k === "Batch") {
      parts.push(String(record[`${a}_name`] ?? k));
    } else if (k === "Location") {
      const city = record[`${a}_city`];
      const country = record[`${a}_country`];
      parts.push(
        [city, country].filter(Boolean).join(", ") || "Location",
      );
    }
  }

  // Prefer label from LABELED hop or job.label — proof attached later from PG.
  let labelBit = "";
  for (let i = kinds.length - 1; i >= 0; i -= 1) {
    if (kinds[i] === "Label") {
      labelBit = ` -LABELED-> ${String(record[`n${i}_name`] ?? "")}`;
      break;
    }
    if (kinds[i] === "Job" && record[`n${i}_label`]) {
      if (!hops.includes("LABELED")) {
        labelBit = ` [${String(record[`n${i}_label`])}]`;
      }
      break;
    }
  }

  const line =
    hops.includes("LABELED")
      ? parts.join(" ")
      : `${parts.join(" ")}${labelBit}`;
  return { line, jobId };
}

type Rehydrated = {
  cards: ExploreJobCard[];
  /** First eligibility_evidence quote per job (india label proof). */
  evidenceByJobId: Map<string, string | null>;
};

async function rehydrateExploreJobs(
  db: Db,
  ids: string[],
  labels: string[],
): Promise<Rehydrated> {
  if (ids.length === 0) {
    return { cards: [], evidenceByJobId: new Map() };
  }
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      company: companies.name,
      label: jobTags.indiaEligibility,
      applyUrl: jobs.applyUrl,
      evidence: jobTags.eligibilityEvidence,
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
  const cards: ExploreJobCard[] = [];
  const evidenceByJobId = new Map<string, string | null>();
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    cards.push({
      id: r.id,
      title: r.title,
      company: r.company,
      label: r.label ?? null,
      apply_url: r.applyUrl,
    });
    const first = (r.evidence ?? [])
      .map((q) => String(q).replace(/\s+/g, " ").trim())
      .find(Boolean);
    evidenceByJobId.set(r.id, first ?? null);
  }
  return { cards, evidenceByJobId };
}

export async function explore(
  db: Db,
  input: ExploreInput,
  opts: { userId?: string | null; client?: GraphClient } = {},
): Promise<ExploreResult> {
  const started = Date.now();
  const client = opts.client ?? createGraphClient();
  const maxResults = Math.min(25, Math.max(1, input.max_results ?? 10));
  const maxTokens = Math.min(4000, Math.max(100, input.max_tokens ?? 1500));
  const labels =
    input.filter?.labels && input.filter.labels.length > 0
      ? input.filter.labels
      : DEFAULT_LABELS;

  if (!client.enabled) {
    return {
      source: "disabled",
      error: "graph_disabled",
      lines: [],
      jobs: [],
      tokens_used: 0,
      truncated: false,
      latency_ms: Date.now() - started,
    };
  }

  try {
    if (input.start.type === "me") {
      if (!opts.userId) {
        throw new Error(
          'start.type "me" requires a personal MCP bearer token',
        );
      }
      await syncUserSavedEdges(db, opts.userId, client);
    }

    const path = validateExplorePath(input.start.type, input.path ?? []);
    let startValue = input.start.value;
    if (input.start.type === "skill" && startValue) {
      startValue = normalizeSkill(startValue) ?? startValue.trim().toLowerCase();
    }

    const built = buildExploreCypher({
      startType: input.start.type,
      startValue,
      userGraphId:
        input.start.type === "me" && opts.userId
          ? graphIds.user(opts.userId)
          : undefined,
      path,
      labels,
    });

    // Reject forbidden string interpolation of start value into cypher
    if (startValue && built.cypher.includes(startValue)) {
      throw new Error("internal: start value leaked into cypher");
    }

    const { records } = await client.run(built.cypher, built.params);

    const filterSkills = (input.filter?.skills ?? [])
      .map((s) => normalizeSkill(s) ?? s.trim().toLowerCase())
      .filter(Boolean);

    const linesRaw: string[] = [];
    const jobOrder: string[] = [];
    const seenJob = new Set<string>();
    const seenLine = new Set<string>();

    for (const rec of records) {
      // Optional skill filter: if path includes a Skill node, require name match
      if (filterSkills.length > 0) {
        let skillOk = false;
        for (let i = 0; i < path.kinds.length; i += 1) {
          if (path.kinds[i] === "Skill") {
            const name = String(rec[`n${i}_name`] ?? "").toLowerCase();
            if (filterSkills.includes(name)) skillOk = true;
          }
        }
        // If no skill node in path, skip filter (or require job requires — skip)
        if (path.kinds.includes("Skill") && !skillOk) continue;
      }

      const { line, jobId } = formatPathLine(rec, path.hops, path.kinds);
      if (seenLine.has(line)) continue;
      seenLine.add(line);
      linesRaw.push(line);
      if (jobId && !seenJob.has(jobId)) {
        seenJob.add(jobId);
        jobOrder.push(jobId);
      }
      if (jobOrder.length >= maxResults * 3 && linesRaw.length >= maxResults * 3) {
        break;
      }
    }

    const { cards: jobsOut, evidenceByJobId } = await rehydrateExploreJobs(
      db,
      jobOrder,
      labels,
    );
    const activeIds = new Set(jobsOut.map((j) => j.id));
    // Drop lines whose job was filtered out (inactive), keep company-only lines
    const linesFiltered = linesRaw
      .filter((ln) => {
        const m = ln.match(/\[job:([0-9a-f-]{36})\]/i);
        if (!m) return true;
        return activeIds.has(m[1]!);
      })
      .map((ln) => attachEligibilityProof(ln, evidenceByJobId));

    const trimmed = trimLinesToTokens(
      linesFiltered.slice(0, Math.max(maxResults * 2, maxResults)),
      maxTokens,
    );
    // Limit jobs cards to max_results
    const jobsLimited = jobsOut.slice(0, maxResults);

    return {
      source: "graph",
      lines: trimmed.lines.slice(0, maxResults),
      jobs: jobsLimited,
      tokens_used: trimmed.tokens_used,
      truncated: trimmed.truncated || linesFiltered.length > maxResults,
      latency_ms: Date.now() - started,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      source: "error",
      error: msg,
      lines: [],
      jobs: [],
      tokens_used: 0,
      truncated: false,
      latency_ms: Date.now() - started,
    };
  }
}
