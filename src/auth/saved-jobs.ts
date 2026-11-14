import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companies, jobTags, jobs, savedJobs } from "../db/schema.js";
import {
  addSavedEdge,
  removeSavedEdge,
  scheduleGraphSaved,
} from "../graph/saved.js";

export type SavedJobRow = {
  job_id: string;
  title: string;
  company: string;
  location: string | null;
  eligibility: string | null;
  evidence: string[] | null;
  apply_url: string;
  saved_at: string;
  status: "open" | "closed" | "removed";
};

export async function saveJob(
  db: Db,
  userId: string,
  jobId: string,
): Promise<{ saved: boolean; already: boolean }> {
  const exists = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!exists[0]) {
    const err = new Error("job_not_found");
    (err as Error & { code: string }).code = "job_not_found";
    throw err;
  }

  const [tag] = await db
    .select({ label: jobTags.indiaEligibility })
    .from(jobTags)
    .where(eq(jobTags.jobId, jobId))
    .limit(1);

  const inserted = await db
    .insert(savedJobs)
    .values({
      userId,
      jobId,
      labelAtSave: tag?.label ?? null,
    })
    .onConflictDoNothing()
    .returning({ jobId: savedJobs.jobId });

  if (inserted.length > 0) {
    scheduleGraphSaved(() => addSavedEdge(userId, jobId));
  }

  return { saved: true, already: inserted.length === 0 };
}

export async function unsaveJob(
  db: Db,
  userId: string,
  jobId: string,
): Promise<{ removed: boolean }> {
  const deleted = await db
    .delete(savedJobs)
    .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)))
    .returning({ jobId: savedJobs.jobId });
  if (deleted.length > 0) {
    scheduleGraphSaved(() => removeSavedEdge(userId, jobId));
  }
  return { removed: deleted.length > 0 };
}

export async function listSavedJobs(db: Db, userId: string): Promise<SavedJobRow[]> {
  const rows = await db
    .select({
      jobId: savedJobs.jobId,
      savedAt: savedJobs.createdAt,
      title: jobs.title,
      company: companies.name,
      location: jobs.locationRaw,
      applyUrl: jobs.applyUrl,
      closedAt: jobs.closedAt,
      eligibility: jobTags.indiaEligibility,
      evidence: jobTags.eligibilityEvidence,
      jobPresent: jobs.id,
    })
    .from(savedJobs)
    .leftJoin(jobs, eq(jobs.id, savedJobs.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(eq(savedJobs.userId, userId))
    .orderBy(desc(savedJobs.createdAt));

  return rows.map((r) => {
    let status: SavedJobRow["status"] = "open";
    if (!r.jobPresent) status = "removed";
    else if (r.closedAt) status = "closed";

    return {
      job_id: r.jobId,
      title: r.title ?? "Removed job",
      company: r.company ?? "-",
      location: r.location ?? null,
      eligibility: r.eligibility ?? null,
      evidence: r.evidence ?? null,
      apply_url: r.applyUrl ?? "#",
      saved_at: r.savedAt.toISOString(),
      status,
    };
  });
}

export async function listSavedJobIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ jobId: savedJobs.jobId })
    .from(savedJobs)
    .where(eq(savedJobs.userId, userId));
  return rows.map((r) => r.jobId);
}

/** Count open saved jobs (job still present and not closed). */
export async function countOpenSavedJobs(db: Db, userId: string): Promise<number> {
  const rows = await db
    .select({ jobId: savedJobs.jobId })
    .from(savedJobs)
    .innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
    .where(and(eq(savedJobs.userId, userId), isNull(jobs.closedAt)));
  return rows.length;
}
