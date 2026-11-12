import { afterAll, describe, expect, it } from "vitest";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NormalizedJob } from "../../src/ats/types.js";
import { db, pool } from "../../src/db/client.js";
import { companies, jobs } from "../../src/db/schema.js";
import {
  listOpenExternalIds,
  upsertJobs,
} from "../../src/ingestion/upsert.js";

async function dbUp(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

function job(
  companyId: string,
  externalId: string,
  title: string,
): NormalizedJob {
  return {
    externalId,
    companyId,
    title,
    department: null,
    locationRaw: "Remote",
    isRemoteFlag: true,
    employmentType: "Full-time",
    descriptionText: "Role description",
    applyUrl: `https://example.com/jobs/${externalId}`,
    compensationRaw: null,
    postedAt: null,
    sourceAts: "ashby",
  };
}

describe("upsertJobs skips non-tech titles", () => {
  it("stores tech only, closes prior non-tech, keeps closed-job detection", async () => {
    if (!(await dbUp())) return;

    const [company] = await db
      .insert(companies)
      .values({
        name: `Upsert NonTech ${Date.now()}`,
        website: "https://example.com",
        ats: "ashby",
        atsSlug: `upsert-nontech-${Date.now()}`,
        active: true,
      })
      .returning();
    const companyId = company!.id;

    // Seed a previously stored "Sales Manager" that should be closed when skipped
    await upsertJobs(db, companyId, [
      job(companyId, "legacy-sales", "Software Engineer"),
    ]);
    // Force-update title to non-tech while keeping row open (simulates old data)
    await db
      .update(jobs)
      .set({ title: "Sales Manager" })
      .where(
        and(eq(jobs.companyId, companyId), eq(jobs.externalId, "legacy-sales")),
      );

    const result = await upsertJobs(db, companyId, [
      job(companyId, "eng-1", "Backend Engineer"),
      job(companyId, "sales-1", "Account Executive"),
      job(companyId, "legacy-sales", "Sales Manager"),
      job(companyId, "mkt-1", "Marketing Manager"),
    ]);

    expect(result.upserted).toBe(1);
    expect(result.skippedNonTech).toBe(3);

    const openIds = await listOpenExternalIds(db, companyId);
    expect(openIds.sort()).toEqual(["eng-1"]);

    // Job that left the board entirely is closed
    await upsertJobs(db, companyId, [
      job(companyId, "eng-2", "Frontend Engineer"),
    ]);
    const openAfter = await listOpenExternalIds(db, companyId);
    expect(openAfter.sort()).toEqual(["eng-2"]);

    const closedEng1 = await db
      .select({ closedAt: jobs.closedAt })
      .from(jobs)
      .where(
        and(eq(jobs.companyId, companyId), eq(jobs.externalId, "eng-1")),
      );
    expect(closedEng1[0]?.closedAt).not.toBeNull();

    await db.delete(companies).where(eq(companies.id, companyId));
  });
});

afterAll(async () => {
  void pool;
});
