import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, pool } from "../../src/db/client.js";
import { companies, jobTags, jobs } from "../../src/db/schema.js";
import {
  getMcpStats,
  searchJobs,
  submitCompany,
} from "../../src/mcp/tools.js";

async function dbUp(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

describe("MCP tools against live DB", () => {
  it("search_jobs default filter only returns open/india_remote", async () => {
    if (!(await dbUp())) return;
    const result = await searchJobs(db, {
      eligibility: ["open", "india_remote"],
      limit: 50,
    });
    for (const row of result.results) {
      expect(["open", "india_remote"]).toContain(row.eligibility);
    }
  });

  it(
    "stats matches raw SQL eligibility counts",
    async () => {
      if (!(await dbUp())) return;
      const stats = await getMcpStats(db);
      const raw = await db
        .select({
          indiaEligibility: jobTags.indiaEligibility,
          n: sql<number>`count(distinct (${jobs.companyId}, ${jobs.externalId}))`,
        })
        .from(jobs)
        .innerJoin(companies, eq(companies.id, jobs.companyId))
        .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
        .where(
          and(
            isNull(jobs.closedAt),
            eq(companies.active, true),
            or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
            inArray(jobTags.indiaEligibility, [
              "open",
              "india_remote",
              "india_onsite",
              "region_locked",
              "unclear",
            ]),
          ),
        )
        .groupBy(jobTags.indiaEligibility);

      const expected: Record<string, number> = {};
      for (const row of raw) {
        expected[row.indiaEligibility ?? "null"] = Number(row.n);
      }
      expect(stats.by_eligibility).toEqual(expected);
    },
    30_000,
  );

  it("submit_company dedupes by name", async () => {
    if (!(await dbUp())) return;
    const name = `MCP Test ${Date.now()}`;
    const first = await submitCompany(db, {
      name,
      careers_url: "https://example.com/jobs",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.deduped).toBe(false);

    const second = await submitCompany(db, {
      name,
      careers_url: "https://example.com/jobs",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.deduped).toBe(true);
    expect(second.candidate_id).toBe(first.candidate_id);
  });
});

afterAll(async () => {
  // Don't end the shared pool here - other test files may still need it.
  // Pool is process-scoped; vitest will exit cleanly.
  void pool;
});
