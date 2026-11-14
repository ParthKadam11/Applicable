import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companies, jobTags, jobs, savedJobs } from "../db/schema.js";
import { createGraphClient, type GraphClient } from "./driver.js";
import { extractSkills, normalizeSkill } from "./skills.js";
import { syncUserSavedEdges } from "./saved.js";

export type SkillGapInput = {
  my_skills?: string[];
  /** When true, derive skills from saved jobs' graph/text REQUIRES. */
  me?: boolean;
  labels?: string[];
  max_skills?: number;
};

export type SkillGapResult = {
  source: "graph" | "postgres" | "disabled" | "error";
  error?: string;
  my_skills: string[];
  gaps: Array<{
    skill: string;
    unlocks: number;
    examples: Array<{ id: string; title: string; company: string }>;
  }>;
  latency_ms: number;
};

const DEFAULT_LABELS = ["open", "india_remote"];

/**
 * Top skills that unlock the most India-OK jobs missing exactly one required skill.
 * Uses Postgres job text + extractSkills (SoT); graph optional for saved sync.
 */
export async function skillGap(
  db: Db,
  input: SkillGapInput,
  opts: { userId?: string | null; client?: GraphClient } = {},
): Promise<SkillGapResult> {
  const started = Date.now();
  const client = opts.client ?? createGraphClient();
  const labels =
    input.labels && input.labels.length > 0 ? input.labels : DEFAULT_LABELS;
  const maxSkills = Math.min(10, Math.max(1, input.max_skills ?? 5));

  try {
    let mySkills = (input.my_skills ?? [])
      .map((s) => normalizeSkill(s) ?? s.trim().toLowerCase())
      .filter(Boolean);

    if (input.me) {
      if (!opts.userId) {
        throw new Error('skill_gap "me" requires a personal MCP bearer token');
      }
      if (client.enabled) {
        await syncUserSavedEdges(db, opts.userId, client);
      }
      const saved = await db
        .select({
          title: jobs.title,
          descriptionText: jobs.descriptionText,
        })
        .from(savedJobs)
        .innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
        .where(eq(savedJobs.userId, opts.userId));
      const derived = new Set<string>(mySkills);
      for (const row of saved) {
        for (const s of extractSkills(row.title, row.descriptionText)) {
          derived.add(s);
        }
      }
      mySkills = [...derived].sort();
    }

    if (mySkills.length === 0) {
      throw new Error("my_skills required (or me:true with saved jobs)");
    }

    const mine = new Set(mySkills);

    const openJobs = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        company: companies.name,
        descriptionText: jobs.descriptionText,
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
        ),
      );

    type Agg = {
      unlocks: number;
      examples: Array<{ id: string; title: string; company: string }>;
    };
    const bySkill = new Map<string, Agg>();

    for (const job of openJobs) {
      const required = extractSkills(job.title, job.descriptionText);
      if (required.length === 0) continue;
      const missing = required.filter((s) => !mine.has(s));
      if (missing.length !== 1) continue;
      // already have the rest
      const haveRest = required.every((s) => mine.has(s) || s === missing[0]);
      if (!haveRest) continue;
      const skill = missing[0]!;
      const agg = bySkill.get(skill) ?? { unlocks: 0, examples: [] };
      agg.unlocks += 1;
      if (agg.examples.length < 2) {
        agg.examples.push({
          id: job.id,
          title: job.title,
          company: job.company,
        });
      }
      bySkill.set(skill, agg);
    }

    const gaps = [...bySkill.entries()]
      .sort((a, b) => b[1].unlocks - a[1].unlocks)
      .slice(0, maxSkills)
      .map(([skill, agg]) => ({
        skill,
        unlocks: agg.unlocks,
        examples: agg.examples,
      }));

    return {
      source: client.enabled ? "graph" : "postgres",
      my_skills: mySkills,
      gaps,
      latency_ms: Date.now() - started,
    };
  } catch (err) {
    return {
      source: "error",
      error: err instanceof Error ? err.message : String(err),
      my_skills: [],
      gaps: [],
      latency_ms: Date.now() - started,
    };
  }
}
