import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../src/db/client.js";
import { companies, hydraSyncRuns, jobTags, jobs } from "../../src/db/schema.js";
import type { HydraClient } from "../../src/hydra/client.js";
import { hydraContentHash } from "../../src/hydra/triplets.js";
import { runHydraSync } from "../../src/hydra/sync.js";

async function dbReady(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    // migration columns present?
    await db.execute(sql`select hydra_synced_at from jobs limit 0`);
    await db.execute(sql`select 1 from hydra_sync_runs limit 0`);
    return true;
  } catch {
    return false;
  }
}

function mockClient(overrides: Partial<HydraClient> = {}): HydraClient {
  return {
    enabled: true,
    ingestKnowledge: vi.fn(async ({ items }) => ({
      ids: items.map((i) => i.id),
      failed: 0,
    })),
    deleteKnowledge: vi.fn(async (ids) => ids.length),
    queryKnowledge: vi.fn(),
    ...overrides,
  };
}

describe("hydra sync", () => {
  const createdJobIds: string[] = [];
  let companyId: string | null = null;

  afterAll(async () => {
    if (!(await dbReady())) return;
    for (const id of createdJobIds) {
      await db.delete(jobs).where(eq(jobs.id, id));
    }
    if (companyId) {
      await db.delete(companies).where(eq(companies.id, companyId));
    }
  });

  it("disabled client is no-op and records run", async () => {
    if (!(await dbReady())) return;
    const before = await db.select({ id: hydraSyncRuns.id }).from(hydraSyncRuns);
    const result = await runHydraSync(db, { full: true }, {
      enabled: false,
      ingestKnowledge: vi.fn(),
      deleteKnowledge: vi.fn(),
      queryKnowledge: vi.fn(),
    });
    expect(result.error).toBe("hydra_disabled");
    expect(result.pushed).toBe(0);
    const after = await db.select({ id: hydraSyncRuns.id }).from(hydraSyncRuns);
    expect(after.length).toBeGreaterThan(before.length);
  });

  it("pushes new, skips unchanged, updates changed, deletes closed/relabeled; failures recorded", async () => {
    if (!(await dbReady())) return;

    const [company] = await db
      .insert(companies)
      .values({
        name: `Hydra Test Co ${Date.now()}`,
        website: "https://hydra-test.example",
        ats: "greenhouse",
        atsSlug: `hydra-test-${Date.now()}`,
        slug: `hydra-test-${Date.now()}`,
        active: true,
      })
      .returning({ id: companies.id });
    companyId = company!.id;

    const mkJob = async (title: string, label: string, hash: string) => {
      const [job] = await db
        .insert(jobs)
        .values({
          companyId: companyId!,
          externalId: `ext-${title}-${Date.now()}-${Math.random()}`,
          title,
          descriptionText: "We hire remotely in India.",
          applyUrl: "https://example.com/j",
          sourceAts: "greenhouse",
          contentHash: hash,
        })
        .returning({ id: jobs.id });
      createdJobIds.push(job!.id);
      await db.insert(jobTags).values({
        jobId: job!.id,
        indiaEligibility: label,
        eligibilityEvidence: ["We hire remotely in India."],
        roleFamily: "backend",
        contentHash: hash,
        classifier: "rules",
      });
      return job!.id;
    };

    const newId = await mkJob("New Role", "open", "hash-new");
    const unchangedId = await mkJob("Unchanged Role", "india_remote", "hash-u");
    const changedId = await mkJob("Changed Role", "india_onsite", "hash-c1");
    const closedId = await mkJob("Closed Role", "open", "hash-cl");
    const relabelId = await mkJob("Relabel Role", "open", "hash-rl");

    // Seed hydra markers: unchanged (matching), changed (stale), closed+relabel (synced)
    await db
      .update(jobs)
      .set({
        hydraSyncedAt: new Date(),
        hydraContentHash: hydraContentHash("hash-u", "india_remote"),
      })
      .where(eq(jobs.id, unchangedId));
    await db
      .update(jobs)
      .set({
        hydraSyncedAt: new Date(),
        hydraContentHash: hydraContentHash("hash-old", "india_onsite"),
      })
      .where(eq(jobs.id, changedId));
    await db
      .update(jobs)
      .set({
        hydraSyncedAt: new Date(),
        hydraContentHash: hydraContentHash("hash-cl", "open"),
        closedAt: new Date(),
      })
      .where(eq(jobs.id, closedId));
    await db
      .update(jobs)
      .set({
        hydraSyncedAt: new Date(),
        hydraContentHash: hydraContentHash("hash-rl", "open"),
      })
      .where(eq(jobs.id, relabelId));
    await db
      .update(jobTags)
      .set({ indiaEligibility: "region_locked" })
      .where(eq(jobTags.jobId, relabelId));

    const client = mockClient();
    const result = await runHydraSync(
      db,
      {
        full: false,
        jobIds: [newId, unchangedId, changedId, closedId, relabelId],
      },
      client,
    );

    expect(result.pushed).toBeGreaterThanOrEqual(1);
    expect(result.updated).toBeGreaterThanOrEqual(1);
    expect(result.deleted).toBeGreaterThanOrEqual(2);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(client.ingestKnowledge).toHaveBeenCalled();
    expect(client.deleteKnowledge).toHaveBeenCalled();

    const [newRow] = await db
      .select({ h: jobs.hydraContentHash })
      .from(jobs)
      .where(eq(jobs.id, newId));
    expect(newRow!.h).toBe(hydraContentHash("hash-new", "open"));

    const [closedRow] = await db
      .select({ at: jobs.hydraSyncedAt })
      .from(jobs)
      .where(eq(jobs.id, closedId));
    expect(closedRow!.at).toBeNull();

    // Failure does not throw
    const failing = mockClient({
      ingestKnowledge: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const failJob = await mkJob("Fail Role", "open", "hash-fail");
    const failResult = await runHydraSync(
      db,
      { jobIds: [failJob], full: true },
      failing,
    );
    expect(failResult.failed).toBeGreaterThanOrEqual(1);
    expect(failResult.error).toMatch(/boom/);
  });
});
