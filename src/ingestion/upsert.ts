import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { NormalizedJob } from "../ats/types.js";
import type { Db } from "../db/client.js";
import { jobs } from "../db/schema.js";
import { contentHash } from "../utils/hash.js";

export interface UpsertResult {
  upserted: number;
  closed: number;
  hashes: Map<string, string>;
}

export async function upsertJobs(
  db: Db,
  companyId: string,
  fetched: NormalizedJob[],
): Promise<UpsertResult> {
  const now = new Date();
  const hashes = new Map<string, string>();

  if (fetched.length === 0) {
    const closed = await closeMissingJobs(db, companyId, [], now);
    return { upserted: 0, closed, hashes };
  }

  const rows = fetched.map((job) => {
    const hash = contentHash({
      title: job.title,
      descriptionText: job.descriptionText,
      locationRaw: job.locationRaw,
      employmentType: job.employmentType,
      applyUrl: job.applyUrl,
    });
    hashes.set(job.externalId, hash);

    return {
      companyId,
      externalId: job.externalId,
      title: job.title,
      department: job.department,
      locationRaw: job.locationRaw,
      isRemoteFlag: job.isRemoteFlag,
      employmentType: job.employmentType,
      descriptionText: job.descriptionText,
      applyUrl: job.applyUrl,
      compensationRaw: job.compensationRaw,
      postedAt: job.postedAt,
      sourceAts: job.sourceAts,
      contentHash: hash,
      lastSeenAt: now,
      closedAt: null,
      updatedAt: now,
    };
  });

  await db
    .insert(jobs)
    .values(rows)
    .onConflictDoUpdate({
      target: [jobs.companyId, jobs.externalId],
      set: {
        title: sql`excluded.title`,
        department: sql`excluded.department`,
        locationRaw: sql`excluded.location_raw`,
        isRemoteFlag: sql`excluded.is_remote_flag`,
        employmentType: sql`excluded.employment_type`,
        descriptionText: sql`excluded.description_text`,
        applyUrl: sql`excluded.apply_url`,
        compensationRaw: sql`excluded.compensation_raw`,
        postedAt: sql`excluded.posted_at`,
        sourceAts: sql`excluded.source_ats`,
        contentHash: sql`excluded.content_hash`,
        lastSeenAt: sql`excluded.last_seen_at`,
        closedAt: sql`NULL`,
        updatedAt: sql`excluded.updated_at`,
      },
    });

  const externalIds = fetched.map((j) => j.externalId);
  const closed = await closeMissingJobs(db, companyId, externalIds, now);

  return { upserted: rows.length, closed, hashes };
}

async function closeMissingJobs(
  db: Db,
  companyId: string,
  stillOpenExternalIds: string[],
  now: Date,
): Promise<number> {
  const condition =
    stillOpenExternalIds.length === 0
      ? and(eq(jobs.companyId, companyId), isNull(jobs.closedAt))
      : and(
          eq(jobs.companyId, companyId),
          isNull(jobs.closedAt),
          notInArray(jobs.externalId, stillOpenExternalIds),
        );

  const closed = await db
    .update(jobs)
    .set({ closedAt: now, updatedAt: now })
    .where(condition)
    .returning({ id: jobs.id });

  return closed.length;
}

/** Helper for tests — fetch open job external ids for a company. */
export async function listOpenExternalIds(
  db: Db,
  companyId: string,
): Promise<string[]> {
  const rows = await db
    .select({ externalId: jobs.externalId })
    .from(jobs)
    .where(and(eq(jobs.companyId, companyId), isNull(jobs.closedAt)));
  return rows.map((r) => r.externalId);
}

export async function getJobsByExternalIds(
  db: Db,
  companyId: string,
  externalIds: string[],
) {
  if (externalIds.length === 0) return [];
  return db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.companyId, companyId),
        inArray(jobs.externalId, externalIds),
      ),
    );
}
