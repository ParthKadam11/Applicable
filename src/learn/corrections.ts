import { and, asc, count, eq, ne, notInArray, sql } from "drizzle-orm";
import type { IndiaEligibility } from "../classify/types.js";
import type { Db } from "../db/client.js";
import { companies, corrections, jobs, jobTags } from "../db/schema.js";
import { goldJobIdSet } from "./gold.js";
import { validateEligibilityEvidence } from "./evidence-guard.js";
import { upsertPatternFromEvidence } from "./patterns.js";
import type { CorrectionSource } from "./types.js";
import { pushCorrectionToGraph } from "./graph-learn.js";

export class CorrectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorrectionError";
  }
}

export type RecordCorrectionInput = {
  jobId: string;
  newLabel: IndiaEligibility;
  evidence: string;
  source: CorrectionSource;
  /** Skip gold leakage check only in tests. */
  allowGold?: boolean;
  /** Skip graph write (eval curve / tests). */
  skipGraph?: boolean;
};

export type RecordCorrectionResult = {
  ok: true;
  correction_id: string;
  old_label: string | null;
  new_label: IndiaEligibility;
  pattern: { phrase: string; label: string; weight: number } | null;
  graph: { ok: boolean; error?: string };
};

export async function recordCorrection(
  db: Db,
  input: RecordCorrectionInput,
): Promise<RecordCorrectionResult> {
  if (!input.allowGold) {
    const gold = goldJobIdSet();
    if (gold.has(input.jobId)) {
      throw new CorrectionError(
        `Refusing correction for gold-eval job ${input.jobId} (no leakage)`,
      );
    }
  }

  const [job] = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      locationRaw: jobs.locationRaw,
      descriptionText: jobs.descriptionText,
      companyId: jobs.companyId,
      companyName: companies.name,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(eq(jobs.id, input.jobId))
    .limit(1);

  if (!job) {
    throw new CorrectionError(`Job not found: ${input.jobId}`);
  }

  const check = validateEligibilityEvidence({
    evidence: input.evidence,
    title: job.title,
    locationRaw: job.locationRaw,
    descriptionText: job.descriptionText,
  });
  if (!check.ok) {
    throw new CorrectionError(
      `Invalid evidence (${check.reason}): must be a posting substring about eligibility`,
    );
  }

  const [tag] = await db
    .select({ label: jobTags.indiaEligibility })
    .from(jobTags)
    .where(eq(jobTags.jobId, input.jobId))
    .limit(1);

  const oldLabel = tag?.label ?? null;

  const [row] = await db
    .insert(corrections)
    .values({
      jobId: input.jobId,
      oldLabel,
      newLabel: input.newLabel,
      evidence: input.evidence.trim(),
      source: input.source,
    })
    .returning();

  if (!row) {
    throw new CorrectionError("Failed to insert correction");
  }

  // Persist corrected label on job_tags (learning applies to live data).
  await db
    .update(jobTags)
    .set({
      indiaEligibility: input.newLabel,
      eligibilityEvidence: [input.evidence.trim()],
      classifier: `correction:${input.source}`,
      classifiedAt: new Date(),
    })
    .where(eq(jobTags.jobId, input.jobId));

  const pattern = await upsertPatternFromEvidence(
    db,
    input.evidence,
    input.newLabel,
  );

  let graph: { ok: boolean; error?: string } = { ok: true };
  if (!input.skipGraph) {
    try {
      graph = await pushCorrectionToGraph({
        correctionId: row.id,
        jobId: job.id,
        companyId: job.companyId,
        companyName: job.companyName,
        oldLabel,
        newLabel: input.newLabel,
        evidence: input.evidence.trim(),
        source: input.source,
        patternPhrase: pattern?.phrase ?? null,
        patternLabel: pattern?.label ?? null,
        patternWeight: pattern?.weight ?? null,
      });
    } catch (err) {
      graph = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    ok: true,
    correction_id: row.id,
    old_label: oldLabel,
    new_label: input.newLabel,
    pattern: pattern
      ? { phrase: pattern.phrase, label: pattern.label, weight: pattern.weight }
      : null,
    graph,
  };
}

export async function listCorrectionsChronological(
  db: Db,
  opts?: { excludeGold?: boolean; limit?: number },
) {
  const gold = opts?.excludeGold === false ? new Set<string>() : goldJobIdSet();
  const goldIds = [...gold];
  const q =
    goldIds.length > 0
      ? db
          .select()
          .from(corrections)
          .where(notInArray(corrections.jobId, goldIds))
          .orderBy(asc(corrections.createdAt))
      : db.select().from(corrections).orderBy(asc(corrections.createdAt));
  const rows = await q;
  return opts?.limit ? rows.slice(0, opts.limit) : rows;
}

export async function countCorrections(db: Db): Promise<number> {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(corrections);
  return Number(n);
}

export async function companyLabelPrior(
  db: Db,
  companyId: string,
  excludeJobId?: string,
): Promise<{ label: IndiaEligibility; n: number } | null> {
  const filters = [
    eq(jobs.companyId, companyId),
    sql`${jobTags.indiaEligibility} IN ('open','india_remote','india_onsite','region_locked')`,
  ];
  if (excludeJobId) filters.push(ne(jobs.id, excludeJobId));

  const rows = await db
    .select({
      label: jobTags.indiaEligibility,
      n: count(),
    })
    .from(jobs)
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(and(...filters))
    .groupBy(jobTags.indiaEligibility);

  if (rows.length === 0) return null;
  const ranked = rows
    .map((r) => ({
      label: r.label as IndiaEligibility,
      n: Number(r.n),
    }))
    .sort((a, b) => b.n - a.n);
  const top = ranked[0]!;
  // Need a clear majority of verified-ish labels
  if (top.n < 2) return null;
  return top;
}
