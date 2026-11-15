import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { NormalizedJob } from "../ats/types.js";
import {
  classifyRoleFamily,
  isStaffingNoise,
} from "../classify/roles.js";
import type { Db } from "../db/client.js";
import { companies, jobs } from "../db/schema.js";
import { contentHash } from "../utils/hash.js";

export interface UpsertResult {
  upserted: number;
  closed: number;
  skippedNonTech: number;
  hashes: Map<string, string>;
}

export async function upsertJobs(
  db: Db,
  companyId: string,
  fetched: NormalizedJob[],
): Promise<UpsertResult> {
  const now = new Date();
  const hashes = new Map<string, string>();

  // All board IDs (tech + non-tech) so closed-job detection stays correct.
  const allExternalIds = fetched.map((j) => j.externalId);

  if (fetched.length === 0) {
    const closed = await closeMissingJobs(db, companyId, [], now);
    return { upserted: 0, closed, skippedNonTech: 0, hashes };
  }

  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const companyName = company?.name ?? "";

  const techJobs: NormalizedJob[] = [];
  const nonTechExternalIds: string[] = [];
  for (const job of fetched) {
    // Staffing / AI-trainer noise: keep the row; classify flags non_tech later.
    if (isStaffingNoise(job.title, companyName, job.descriptionText)) {
      techJobs.push(job);
      continue;
    }
    const { role_family } = classifyRoleFamily(
      job.title,
      job.descriptionText,
      companyName,
    );
    if (role_family === "non_tech") {
      nonTechExternalIds.push(job.externalId);
      continue;
    }
    techJobs.push(job);
  }

  if (techJobs.length === 0) {
    // Still mark missing jobs closed, and close any previously stored non-tech.
    const closedMissing = await closeMissingJobs(
      db,
      companyId,
      allExternalIds,
      now,
    );
    const closedNonTech = await closeByExternalIds(
      db,
      companyId,
      nonTechExternalIds,
      now,
    );
    return {
      upserted: 0,
      closed: closedMissing + closedNonTech,
      skippedNonTech: nonTechExternalIds.length,
      hashes,
    };
  }

  const rows = techJobs.map((job) => {
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

  // Pass every board external_id so jobs still on the board are not closed
  // just because they were non-tech and skipped from storage.
  const closedMissing = await closeMissingJobs(
    db,
    companyId,
    allExternalIds,
    now,
  );
  // Drop previously stored non-tech rows from the open corpus.
  const closedNonTech = await closeByExternalIds(
    db,
    companyId,
    nonTechExternalIds,
    now,
  );

  return {
    upserted: rows.length,
    closed: closedMissing + closedNonTech,
    skippedNonTech: nonTechExternalIds.length,
    hashes,
  };
}

async function closeByExternalIds(
  db: Db,
  companyId: string,
  externalIds: string[],
  now: Date,
): Promise<number> {
  if (externalIds.length === 0) return 0;
  const closed = await db
    .update(jobs)
    .set({ closedAt: now, updatedAt: now })
    .where(
      and(
        eq(jobs.companyId, companyId),
        isNull(jobs.closedAt),
        inArray(jobs.externalId, externalIds),
      ),
    )
    .returning({ id: jobs.id });
  return closed.length;
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

/** Helper for tests - fetch open job external ids for a company. */
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
