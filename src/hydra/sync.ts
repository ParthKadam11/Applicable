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
import { createHydraClient, type HydraClient } from "./client.js";
import {
  buildAppKnowledgeItem,
  buildJobGraph,
  hydraContentHash,
} from "./triplets.js";
import {
  HYDRA_COLLECTION,
  HYDRA_SYNC_LABELS,
  type SyncJobRow,
} from "./types.js";

export const HYDRA_SYNC_QUEUE = "hydra-sync";

export type HydraSyncPayload = {
  /** When true, ignore hydra_content_hash and re-push all eligible. */
  full?: boolean;
  /** Optional: only consider these job IDs for push (still runs deletes). */
  jobIds?: string[];
  companyId?: string;
};

export type HydraSyncResult = {
  pushed: number;
  updated: number;
  deleted: number;
  failed: number;
  skipped: number;
  error: string | null;
  durationMs: number;
};

const BATCH_SIZE = 25;

function isSyncLabel(label: string | null): boolean {
  return (
    label != null &&
    (HYDRA_SYNC_LABELS as readonly string[]).includes(label)
  );
}

function mapRow(r: {
  id: string;
  title: string;
  descriptionText: string;
  locationRaw: string | null;
  applyUrl: string;
  contentHash: string;
  postedAt: Date | null;
  firstSeenAt: Date;
  closedAt: Date | null;
  hydraSyncedAt: Date | null;
  hydraContentHash: string | null;
  companyName: string;
  companySlug: string | null;
  companyAts: "ashby" | "greenhouse" | "lever";
  label: string | null;
  roleFamily: string | null;
  eligibilityEvidence: string[] | null;
  compensationMin: number | null;
  compensationMax: number | null;
}): SyncJobRow {
  return {
    id: r.id,
    title: r.title,
    descriptionText: r.descriptionText,
    locationRaw: r.locationRaw,
    applyUrl: r.applyUrl,
    contentHash: r.contentHash,
    postedAt: r.postedAt,
    firstSeenAt: r.firstSeenAt,
    closedAt: r.closedAt,
    hydraSyncedAt: r.hydraSyncedAt,
    hydraContentHash: r.hydraContentHash,
    companyName: r.companyName,
    companySlug: r.companySlug,
    companyAts: r.companyAts,
    label: r.label,
    roleFamily: r.roleFamily,
    eligibilityEvidence: r.eligibilityEvidence,
    hasSalary: r.compensationMin != null || r.compensationMax != null,
  };
}

async function loadCandidateJobs(
  db: Db,
  payload: HydraSyncPayload,
): Promise<SyncJobRow[]> {
  const conditions = [
    isNull(jobs.closedAt),
    eq(companies.active, true),
    or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
    inArray(jobTags.indiaEligibility, [...HYDRA_SYNC_LABELS]),
  ];
  if (payload.companyId) {
    conditions.push(eq(jobs.companyId, payload.companyId));
  }
  if (payload.jobIds?.length) {
    conditions.push(inArray(jobs.id, payload.jobIds));
  }

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      descriptionText: jobs.descriptionText,
      locationRaw: jobs.locationRaw,
      applyUrl: jobs.applyUrl,
      contentHash: jobs.contentHash,
      postedAt: jobs.postedAt,
      firstSeenAt: jobs.firstSeenAt,
      closedAt: jobs.closedAt,
      hydraSyncedAt: jobs.hydraSyncedAt,
      hydraContentHash: jobs.hydraContentHash,
      companyName: companies.name,
      companySlug: companies.slug,
      companyAts: companies.ats,
      label: jobTags.indiaEligibility,
      roleFamily: jobTags.roleFamily,
      eligibilityEvidence: jobTags.eligibilityEvidence,
      compensationMin: jobTags.compensationMin,
      compensationMax: jobTags.compensationMax,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(and(...conditions));

  return rows.map(mapRow);
}

/** Previously synced jobs that should leave HydraDB. */
async function loadDeleteCandidates(
  db: Db,
  payload: HydraSyncPayload,
): Promise<string[]> {
  const conditions = [
    isNotNull(jobs.hydraSyncedAt),
    or(
      isNotNull(jobs.closedAt),
      eq(companies.active, false),
      eq(jobTags.roleFamily, "non_tech"),
      isNull(jobTags.indiaEligibility),
      sql`${jobTags.indiaEligibility} not in ('open', 'india_remote', 'india_onsite')`,
    ),
  ];
  if (payload.companyId) {
    conditions.push(eq(jobs.companyId, payload.companyId));
  }
  if (payload.jobIds?.length) {
    // For targeted syncs still delete any of those IDs that no longer qualify
    conditions.push(inArray(jobs.id, payload.jobIds));
  }

  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(and(...conditions));

  return rows.map((r) => r.id);
}

async function markSynced(
  db: Db,
  jobId: string,
  hash: string,
): Promise<void> {
  await db
    .update(jobs)
    .set({
      hydraSyncedAt: new Date(),
      hydraContentHash: hash,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

async function clearHydraMarkers(db: Db, jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return;
  await db
    .update(jobs)
    .set({
      hydraSyncedAt: null,
      hydraContentHash: null,
      updatedAt: new Date(),
    })
    .where(inArray(jobs.id, jobIds));
}

/**
 * Sync eligible jobs to HydraDB. Never throws for remote failures —
 * records them in hydra_sync_runs and returns counts.
 */
export async function runHydraSync(
  db: Db,
  payload: HydraSyncPayload = {},
  client: HydraClient = createHydraClient(),
): Promise<HydraSyncResult> {
  const started = Date.now();
  const [run] = await db
    .insert(hydraSyncRuns)
    .values({ startedAt: new Date() })
    .returning({ id: hydraSyncRuns.id });

  const result: HydraSyncResult = {
    pushed: 0,
    updated: 0,
    deleted: 0,
    failed: 0,
    skipped: 0,
    error: null,
    durationMs: 0,
  };

  const finish = async () => {
    result.durationMs = Date.now() - started;
    if (run) {
      await db
        .update(hydraSyncRuns)
        .set({
          finishedAt: new Date(),
          pushed: result.pushed,
          updated: result.updated,
          deleted: result.deleted,
          failed: result.failed,
          error: result.error,
        })
        .where(eq(hydraSyncRuns.id, run.id));
    }
    console.log(
      `[hydra-sync] pushed=${result.pushed} updated=${result.updated} ` +
        `deleted=${result.deleted} failed=${result.failed} skipped=${result.skipped} ` +
        `ms=${result.durationMs}`,
    );
    return result;
  };

  if (!client.enabled) {
    result.error = "hydra_disabled";
    return finish();
  }

  try {
    // Deletes first
    const deleteIds = await loadDeleteCandidates(db, payload);
    for (let i = 0; i < deleteIds.length; i += BATCH_SIZE) {
      const batch = deleteIds.slice(i, i + BATCH_SIZE);
      try {
        const n = await client.deleteKnowledge(batch, HYDRA_COLLECTION);
        result.deleted += n;
        await clearHydraMarkers(db, batch);
      } catch (err) {
        result.failed += batch.length;
        const msg = err instanceof Error ? err.message : String(err);
        result.error = result.error ? `${result.error}; ${msg}` : msg;
        console.error(`[hydra-sync] delete batch failed:`, msg);
      }
    }

    const candidates = await loadCandidateJobs(db, payload);
    const toPush: SyncJobRow[] = [];
    for (const job of candidates) {
      if (!isSyncLabel(job.label)) {
        result.skipped += 1;
        continue;
      }
      const hash = hydraContentHash(job.contentHash, job.label!);
      if (!payload.full && job.hydraContentHash === hash) {
        result.skipped += 1;
        continue;
      }
      toPush.push(job);
    }

    for (let i = 0; i < toPush.length; i += BATCH_SIZE) {
      const batch = toPush.slice(i, i + BATCH_SIZE);
      const items = batch.map(buildAppKnowledgeItem);
      const graphPayload: Record<string, ReturnType<typeof buildJobGraph>> = {};
      for (const job of batch) {
        graphPayload[job.id] = buildJobGraph(job);
      }

      try {
        const { failed } = await client.ingestKnowledge({
          items,
          graphPayload,
          collection: HYDRA_COLLECTION,
        });
        if (failed > 0 && failed >= batch.length) {
          result.failed += batch.length;
          continue;
        }
        result.failed += failed;
        for (const job of batch) {
          const hash = hydraContentHash(job.contentHash, job.label!);
          const wasUpdate = Boolean(job.hydraSyncedAt);
          await markSynced(db, job.id, hash);
          if (wasUpdate) result.updated += 1;
          else result.pushed += 1;
        }
      } catch (err) {
        result.failed += batch.length;
        const msg = err instanceof Error ? err.message : String(err);
        result.error = result.error ? `${result.error}; ${msg}` : msg;
        console.error(`[hydra-sync] ingest batch failed:`, msg);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = msg;
    console.error(`[hydra-sync] fatal:`, msg);
  }

  return finish();
}
