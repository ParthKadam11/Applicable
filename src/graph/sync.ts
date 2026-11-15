import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companies, hydraSyncRuns, jobTags, jobs } from "../db/schema.js";
import {
  deleteOutgoingEdgesFromNode,
  mergeTypedEdges,
  mergeWeightedEdges,
  upsertNodesByLabel,
} from "./cypher.js";
import { createGraphClient, type GraphClient } from "./driver.js";
import { createGraphIds } from "./ids.js";
import { extractSkills } from "./skills.js";

export const GRAPH_SYNC_QUEUE = "graph-sync";

/** All India labels except unclear. */
export const GRAPH_SYNC_LABELS = [
  "open",
  "india_remote",
  "india_onsite",
  "region_locked",
] as const;

export type GraphSyncPayload = {
  full?: boolean;
  jobIds?: string[];
  companyId?: string;
};

export type GraphSyncResult = {
  nodesAdded: number;
  edgesAdded: number;
  removed: number;
  relabels: number;
  failed: number;
  skipped: number;
  error: string | null;
  durationMs: number;
};

export type SyncJobRow = {
  id: string;
  title: string;
  descriptionText: string;
  applyUrl: string;
  contentHash: string;
  postedAt: Date | null;
  firstSeenAt: Date;
  closedAt: Date | null;
  hydraSyncedAt: Date | null;
  hydraContentHash: string | null;
  companyId: string;
  companyName: string;
  companySlug: string | null;
  companyAts: string;
  label: string | null;
  roleFamily: string | null;
  eligibilityEvidence: string[] | null;
};

export function graphContentHash(
  contentHash: string,
  label: string,
  skills: string[],
): string {
  return `${contentHash}:${label}:${skills.join(",")}`;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

async function loadJobs(db: Db, payload: GraphSyncPayload): Promise<SyncJobRow[]> {
  const conditions = [
    eq(companies.active, true),
    or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
  ];
  if (payload.companyId) conditions.push(eq(jobs.companyId, payload.companyId));
  if (payload.jobIds?.length) conditions.push(inArray(jobs.id, payload.jobIds));

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      descriptionText: jobs.descriptionText,
      applyUrl: jobs.applyUrl,
      contentHash: jobs.contentHash,
      postedAt: jobs.postedAt,
      firstSeenAt: jobs.firstSeenAt,
      closedAt: jobs.closedAt,
      hydraSyncedAt: jobs.hydraSyncedAt,
      hydraContentHash: jobs.hydraContentHash,
      companyId: companies.id,
      companyName: companies.name,
      companySlug: companies.slug,
      companyAts: companies.ats,
      label: jobTags.indiaEligibility,
      roleFamily: jobTags.roleFamily,
      eligibilityEvidence: jobTags.eligibilityEvidence,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(and(...conditions));

  return rows;
}

async function markSynced(db: Db, jobId: string, hash: string): Promise<void> {
  await db
    .update(jobs)
    .set({
      hydraSyncedAt: new Date(),
      hydraContentHash: hash,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

async function runBatch(
  client: GraphClient,
  q: { cypher: string; params: Record<string, unknown> },
): Promise<void> {
  const rows = q.params.rows as unknown[] | undefined;
  if (Array.isArray(rows) && rows.length === 0) return;
  const jobIds = q.params.jobIds as unknown[] | undefined;
  if (Array.isArray(jobIds) && jobIds.length === 0) return;
  await client.run(q.cypher, q.params);
}

/**
 * Sync Postgres jobs into local HydraDB graph. Never throws for graph errors.
 */
export async function runGraphSync(
  db: Db,
  payload: GraphSyncPayload = {},
  client: GraphClient = createGraphClient(),
): Promise<GraphSyncResult> {
  const started = Date.now();
  const [run] = await db
    .insert(hydraSyncRuns)
    .values({ startedAt: new Date() })
    .returning({ id: hydraSyncRuns.id });

  const result: GraphSyncResult = {
    nodesAdded: 0,
    edgesAdded: 0,
    removed: 0,
    relabels: 0,
    failed: 0,
    skipped: 0,
    error: null,
    durationMs: 0,
  };
  /** Why rows are skipped (inactive never-synced, or unchanged hash on incremental). */
  const skipReasons = {
    closed: 0,
    unclear: 0,
    label_null: 0,
    other_label: 0,
    unchanged_hash: 0,
  };

  const finish = async () => {
    result.durationMs = Date.now() - started;
    if (run) {
      await db
        .update(hydraSyncRuns)
        .set({
          finishedAt: new Date(),
          pushed: result.nodesAdded,
          updated: result.edgesAdded,
          deleted: result.removed,
          failed: result.failed,
          error: result.error,
          nodesAdded: result.nodesAdded,
          edgesAdded: result.edgesAdded,
          removed: result.removed,
          relabels: result.relabels,
          durationMs: result.durationMs,
        })
        .where(eq(hydraSyncRuns.id, run.id));
    }
    console.log(
      `[graph-sync] nodes=${result.nodesAdded} edges=${result.edgesAdded} ` +
        `removed=${result.removed} relabels=${result.relabels} failed=${result.failed} ` +
        `skipped=${result.skipped} skip_reasons=${JSON.stringify(skipReasons)} ` +
        `ms=${result.durationMs}`,
    );
    try {
      const { invalidateMcpStatsCache } = await import("../mcp/tools.js");
      invalidateMcpStatsCache();
    } catch {
      /* optional */
    }
    return result;
  };

  if (!client.enabled) {
    result.error = "graph_disabled";
    return finish();
  }

  try {
    const all = await loadJobs(db, payload);
    const companySkills = new Map<string, Set<string>>();
    const graphIds = createGraphIds(); // throws on id collision (different ext_id)
    const pendingMarks: Array<{ jobId: string; hash: string }> = [];

    const companyRows: Array<Record<string, unknown>> = [];
    const jobRows: Array<Record<string, unknown>> = [];
    const skillRows: Array<Record<string, unknown>> = [];
    const labelRows: Array<Record<string, unknown>> = [];
    const evidenceRows: Array<Record<string, unknown>> = [];
    const posts: Array<{ src: number; dst: number }> = [];
    const labeled: Array<{ src: number; dst: number }> = [];
    const requires: Array<{ src: number; dst: number }> = [];
    const proven: Array<{ src: number; dst: number }> = [];
    const jobsNeedingEdgeRefresh: number[] = [];
    const closedJobGraphIds: number[] = [];
    const seenSkill = new Set<string>();
    const seenLabel = new Set<string>();
    const seenCompany = new Set<string>();

    for (const job of all) {
      const label = job.label;
      const skills = extractSkills(job.title, job.descriptionText);
      const isActive =
        job.closedAt == null &&
        label != null &&
        (GRAPH_SYNC_LABELS as readonly string[]).includes(label);

      if (!isActive) {
        // Previously synced → deactivate + drop LABELED
        if (job.hydraSyncedAt) {
          const gid = graphIds.job(job.id);
          closedJobGraphIds.push(gid);
          jobRows.push({
            id: gid,
            ext_id: job.id,
            title: job.title.slice(0, 500),
            label: label ?? "",
            role: job.roleFamily ?? "",
            posted_at: job.postedAt?.toISOString() ?? "",
            first_seen_at: job.firstSeenAt.toISOString(),
            apply_url: job.applyUrl,
            active: false,
          });
          result.removed += 1;
          pendingMarks.push({
            jobId: job.id,
            hash: graphContentHash(job.contentHash, label ?? "closed", skills),
          });
        } else {
          result.skipped += 1;
          if (job.closedAt != null) skipReasons.closed += 1;
          else if (label == null) skipReasons.label_null += 1;
          else if (label === "unclear") skipReasons.unclear += 1;
          else skipReasons.other_label += 1;
        }
        continue;
      }

      const hash = graphContentHash(job.contentHash, label!, skills);
      if (!payload.full && job.hydraContentHash === hash) {
        result.skipped += 1;
        skipReasons.unchanged_hash += 1;
        // Still accumulate skills for company similarity recompute on full paths
        const set = companySkills.get(job.companyId) ?? new Set();
        for (const s of skills) set.add(s);
        companySkills.set(job.companyId, set);
        continue;
      }

      const wasSynced = Boolean(job.hydraSyncedAt);
      const prevLabel = job.hydraContentHash?.split(":")[1];
      if (wasSynced && prevLabel && prevLabel !== label) {
        result.relabels += 1;
      }

      const companyGid = graphIds.company(job.companyId);
      const jobGid = graphIds.job(job.id);
      const labelGid = graphIds.label(label!);

      if (!seenCompany.has(job.companyId)) {
        seenCompany.add(job.companyId);
        companyRows.push({
          id: companyGid,
          ext_id: job.companyId,
          slug: job.companySlug ?? "",
          name: job.companyName.slice(0, 256),
          ats: job.companyAts,
        });
        result.nodesAdded += 1;
      }

      jobRows.push({
        id: jobGid,
        ext_id: job.id,
        title: job.title.slice(0, 500),
        label,
        role: job.roleFamily ?? "",
        posted_at: job.postedAt?.toISOString() ?? "",
        first_seen_at: job.firstSeenAt.toISOString(),
        apply_url: job.applyUrl,
        active: true,
      });
      result.nodesAdded += 1;
      jobsNeedingEdgeRefresh.push(jobGid);

      if (!seenLabel.has(label!)) {
        seenLabel.add(label!);
        labelRows.push({ id: labelGid, name: label });
        result.nodesAdded += 1;
      }

      posts.push({ src: companyGid, dst: jobGid });
      labeled.push({ src: jobGid, dst: labelGid });
      result.edgesAdded += 2;

      const skillSet = companySkills.get(job.companyId) ?? new Set();
      for (const skill of skills) {
        skillSet.add(skill);
        if (!seenSkill.has(skill)) {
          seenSkill.add(skill);
          skillRows.push({ id: graphIds.skill(skill), name: skill });
          result.nodesAdded += 1;
        }
        requires.push({ src: jobGid, dst: graphIds.skill(skill) });
        result.edgesAdded += 1;
      }
      companySkills.set(job.companyId, skillSet);

      const quotes = (job.eligibilityEvidence ?? [])
        .map((q) => q.trim())
        .filter(Boolean)
        .slice(0, 10);
      for (const quote of quotes) {
        const eid = graphIds.evidence(job.id, quote);
        evidenceRows.push({
          id: eid,
          quote: quote.slice(0, 2000),
        });
        proven.push({ src: jobGid, dst: eid });
        result.nodesAdded += 1;
        result.edgesAdded += 1;
      }

      // Defer markSynced until after successful graph writes (see pendingMarks)
      pendingMarks.push({ jobId: job.id, hash });
    }

    // Also load skills for active companies not in this batch (for similarity)
    if (payload.full || companySkills.size > 0) {
      const extra = await db
        .select({
          companyId: companies.id,
          title: jobs.title,
          descriptionText: jobs.descriptionText,
          label: jobTags.indiaEligibility,
        })
        .from(jobs)
        .innerJoin(companies, eq(companies.id, jobs.companyId))
        .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
        .where(
          and(
            isNull(jobs.closedAt),
            eq(companies.active, true),
            inArray(jobTags.indiaEligibility, [...GRAPH_SYNC_LABELS]),
            or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
          ),
        );
      for (const row of extra) {
        const set = companySkills.get(row.companyId) ?? new Set();
        for (const s of extractSkills(row.title, row.descriptionText)) {
          set.add(s);
        }
        companySkills.set(row.companyId, set);
      }
    }

    // Writes
    const chunk = <T,>(arr: T[], n: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    for (const part of chunk(companyRows, 50)) {
      await runBatch(client, upsertNodesByLabel("Company", part));
    }
    for (const part of chunk(jobRows, 50)) {
      await runBatch(client, upsertNodesByLabel("Job", part));
    }
    for (const part of chunk(skillRows, 50)) {
      await runBatch(client, upsertNodesByLabel("Skill", part));
    }
    for (const part of chunk(labelRows, 20)) {
      await runBatch(client, upsertNodesByLabel("Label", part));
    }
    for (const part of chunk(evidenceRows, 50)) {
      await runBatch(client, upsertNodesByLabel("Evidence", part));
    }

    // Refresh edges for touched jobs (per-id MATCH — UNWIND edge-delete unsupported)
    for (const jid of jobsNeedingEdgeRefresh) {
      await runBatch(client, deleteOutgoingEdgesFromNode("LABELED", jid));
      await runBatch(client, deleteOutgoingEdgesFromNode("REQUIRES", jid));
      await runBatch(client, deleteOutgoingEdgesFromNode("PROVEN_BY", jid));
    }
    for (const jid of closedJobGraphIds) {
      await runBatch(client, deleteOutgoingEdgesFromNode("LABELED", jid));
    }

    for (const part of chunk(posts, 50)) {
      await runBatch(client, mergeTypedEdges("POSTS", part));
    }
    for (const part of chunk(labeled, 50)) {
      await runBatch(client, mergeTypedEdges("LABELED", part));
    }
    for (const part of chunk(requires, 50)) {
      await runBatch(client, mergeTypedEdges("REQUIRES", part));
    }
    for (const part of chunk(proven, 50)) {
      await runBatch(client, mergeTypedEdges("PROVEN_BY", part));
    }

    // Recompute USES_SKILL + SIMILAR_TO for companies we know
    const companyIds = [...companySkills.keys()];
    const companyGraphIds = companyIds.map((id) => graphIds.company(id));
    for (const cid of companyGraphIds) {
      await runBatch(client, deleteOutgoingEdgesFromNode("USES_SKILL", cid));
      await runBatch(client, deleteOutgoingEdgesFromNode("SIMILAR_TO", cid));
    }

    const usesRows: Array<{
      src: number;
      dst: number;
      edgeId: number;
      weight: number;
    }> = [];
    // Weight = count of active jobs requiring skill — approximate via skill set size contribution
    // Accurate weight: recount from job REQUIRES. Here we count jobs per company+skill from PG.
    const weightMap = new Map<string, number>();
    const activeForWeight = await db
      .select({
        companyId: companies.id,
        title: jobs.title,
        descriptionText: jobs.descriptionText,
      })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
      .where(
        and(
          isNull(jobs.closedAt),
          eq(companies.active, true),
          inArray(jobTags.indiaEligibility, [...GRAPH_SYNC_LABELS]),
          or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
          companyIds.length ? inArray(companies.id, companyIds) : sql`true`,
        ),
      );
    for (const row of activeForWeight) {
      for (const s of extractSkills(row.title, row.descriptionText)) {
        const k = `${row.companyId}::${s}`;
        weightMap.set(k, (weightMap.get(k) ?? 0) + 1);
      }
    }
    for (const [key, weight] of weightMap) {
      const [companyId, skill] = key.split("::") as [string, string];
      const src = graphIds.company(companyId);
      const dst = graphIds.skill(skill);
      usesRows.push({
        src,
        dst,
        edgeId: graphIds.edge("USES_SKILL", companyId, skill),
        weight,
      });
    }
    for (const part of chunk(usesRows, 50)) {
      await runBatch(client, mergeWeightedEdges("USES_SKILL", part));
      result.edgesAdded += part.length;
    }

    // Jaccard SIMILAR_TO top 10, score >= 0.2
    const similarRows: Array<{
      src: number;
      dst: number;
      edgeId: number;
      score: number;
    }> = [];
    const entries = [...companySkills.entries()];
    for (let i = 0; i < entries.length; i += 1) {
      const [aId, aSkills] = entries[i]!;
      const scored: Array<{ bId: string; score: number }> = [];
      for (let j = 0; j < entries.length; j += 1) {
        if (i === j) continue;
        const [bId, bSkills] = entries[j]!;
        const score = jaccard(aSkills, bSkills);
        if (score >= 0.2) scored.push({ bId, score });
      }
      scored.sort((x, y) => y.score - x.score);
      for (const { bId, score } of scored.slice(0, 10)) {
        similarRows.push({
          src: graphIds.company(aId),
          dst: graphIds.company(bId),
          edgeId: graphIds.edge("SIMILAR_TO", aId, bId),
          score,
        });
      }
    }
    for (const part of chunk(similarRows, 50)) {
      await runBatch(client, mergeWeightedEdges("SIMILAR_TO", part));
      result.edgesAdded += part.length;
    }

    // Batch mark synced (avoid per-job UPDATE round-trips).
    for (const part of chunk(pendingMarks, 200)) {
      await Promise.all(
        part.map((m) => markSynced(db, m.jobId, m.hash)),
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    result.error = msg;
    result.failed += 1;
    console.error("[graph-sync] error:", msg);
    if (stack) console.error(stack);
  }

  return finish();
}

/** Jobs previously synced that are closed or unclear (for targeted tests). */
export async function findSyncedInactiveJobIds(db: Db): Promise<string[]> {
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(
        isNotNull(jobs.hydraSyncedAt),
        or(
          isNotNull(jobs.closedAt),
          eq(jobTags.indiaEligibility, "unclear"),
          isNull(jobTags.indiaEligibility),
        ),
      ),
    );
  return rows.map((r) => r.id);
}
