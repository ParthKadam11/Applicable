import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import type PgBoss from "pg-boss";
import type { Db } from "../db/client.js";
import { jobTags, jobs } from "../db/schema.js";

export const CLASSIFY_QUEUE = "classify-job";

export type ClassifyJobPayload = {
  jobId: string;
};

/** Jobs with no tags, or tags whose content_hash is stale. */
export async function findJobsNeedingClassification(
  db: Db,
  companyId?: string,
): Promise<Array<{ id: string; contentHash: string }>> {
  const conditions = [
    or(
      isNull(jobTags.jobId),
      ne(jobTags.contentHash, jobs.contentHash),
      sql`${jobTags.contentHash} is null`,
    ),
  ];

  if (companyId) {
    conditions.push(eq(jobs.companyId, companyId));
  }

  // Only open jobs by default
  conditions.push(isNull(jobs.closedAt));

  return db
    .select({ id: jobs.id, contentHash: jobs.contentHash })
    .from(jobs)
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(and(...conditions));
}

export async function enqueueClassifyJobs(
  boss: PgBoss,
  jobIds: string[],
): Promise<number> {
  let sent = 0;
  for (const jobId of jobIds) {
    const id = await boss.send(
      CLASSIFY_QUEUE,
      { jobId } satisfies ClassifyJobPayload,
      {
        singletonKey: jobId,
        retryLimit: 2,
        retryDelay: 15,
        retryBackoff: true,
        expireInSeconds: 120,
      },
    );
    if (id) sent += 1;
  }
  return sent;
}

export async function enqueueJobsNeedingClassification(
  boss: PgBoss,
  db: Db,
  companyId?: string,
): Promise<number> {
  const needing = await findJobsNeedingClassification(db, companyId);
  const sent = await enqueueClassifyJobs(
    boss,
    needing.map((j) => j.id),
  );
  console.log(
    `[classify] enqueued ${sent}/${needing.length} jobs` +
      (companyId ? ` for company ${companyId}` : ""),
  );
  return sent;
}
