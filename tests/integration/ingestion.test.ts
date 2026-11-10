import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeAshbyJob } from "../../src/ats/ashby.js";
import { db, pool } from "../../src/db/client.js";
import { companies, fetchRuns, jobs } from "../../src/db/schema.js";
import { fetchCompanyJobs } from "../../src/ingestion/fetch-company.js";
import { upsertJobs } from "../../src/ingestion/upsert.js";

const ashbyFixture = JSON.parse(
  readFileSync(resolve("tests/fixtures/ashby.json"), "utf8"),
);

describe("ingestion integration", () => {
  let companyId: string;

  beforeAll(async () => {
    // Ensure schema exists (migrations should already be applied)
    const [company] = await db
      .insert(companies)
      .values({
        name: "Fixture Co",
        website: "https://example.com",
        ats: "ashby",
        atsSlug: `fixture-${Date.now()}`,
        active: true,
      })
      .returning();

    if (!company) throw new Error("failed to insert company");
    companyId = company.id;
  });

  afterAll(async () => {
    if (companyId) {
      await db.delete(companies).where(eq(companies.id, companyId));
    }
    await pool.end();
  });

  it("upserts jobs, reopens closed ones, and closes missing jobs", async () => {
    const batch1 = ashbyFixture.jobs.map(
      (j: (typeof ashbyFixture.jobs)[0]) =>
        normalizeAshbyJob(j, "fixture", companyId),
    );

    const first = await upsertJobs(db, companyId, batch1);
    expect(first.upserted).toBe(2);
    expect(first.closed).toBe(0);

    const openAfterFirst = await db
      .select()
      .from(jobs)
      .where(eq(jobs.companyId, companyId));
    expect(openAfterFirst.filter((j) => !j.closedAt)).toHaveLength(2);

    // Second fetch: only first job remains
    const second = await upsertJobs(db, companyId, [batch1[0]!]);
    expect(second.upserted).toBe(1);
    expect(second.closed).toBe(1);

    const closedJob = await db
      .select()
      .from(jobs)
      .where(
        and(eq(jobs.companyId, companyId), eq(jobs.externalId, "ashby-job-2")),
      );
    expect(closedJob[0]?.closedAt).not.toBeNull();

    // Reappear → reopen
    const third = await upsertJobs(db, companyId, batch1);
    expect(third.closed).toBe(0);
    const reopened = await db
      .select()
      .from(jobs)
      .where(
        and(eq(jobs.companyId, companyId), eq(jobs.externalId, "ashby-job-2")),
      );
    expect(reopened[0]?.closedAt).toBeNull();
  });

  it("fetchCompanyJobs logs fetch_runs and uses the adapter", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(ashbyFixture),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCompanyJobs(db, companyId, { timeoutMs: 10_000 });
    expect(result.ok).toBe(true);
    expect(result.jobCount).toBe(2);

    const runs = await db
      .select()
      .from(fetchRuns)
      .where(eq(fetchRuns.companyId, companyId));
    expect(runs.some((r) => r.ok && r.jobCount === 2)).toBe(true);

    vi.unstubAllGlobals();
  });
});
