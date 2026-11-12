import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../src/db/client.js";
import { dailyStats } from "../../src/db/schema.js";
import {
  computeDailyStatsSnapshot,
  todayIstDate,
  writeDailyStats,
} from "../../src/stats/daily.js";

async function dbUp(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    // table may not exist until migration — probe
    await db.execute(sql`select 1 from daily_stats limit 0`);
    return true;
  } catch {
    return false;
  }
}

describe("daily_stats writer", () => {
  it("computes a snapshot with expected shape", async () => {
    if (!(await dbUp())) return;
    const snap = await computeDailyStatsSnapshot(db);
    expect(snap.date).toBe(todayIstDate());
    expect(snap.companies_active).toBeGreaterThanOrEqual(0);
    expect(snap.tech_open_jobs).toBeGreaterThanOrEqual(0);
    expect(snap.by_eligibility).toMatchObject({
      open: expect.any(Number),
      india_remote: expect.any(Number),
      india_onsite: expect.any(Number),
      region_locked: expect.any(Number),
      unclear: expect.any(Number),
    });
    expect(snap.new_jobs_24h).toBeGreaterThanOrEqual(0);
    expect(snap.closed_jobs_24h).toBeGreaterThanOrEqual(0);
  });

  it("upserts one row per date", async () => {
    if (!(await dbUp())) return;
    const first = await writeDailyStats(db);
    const second = await writeDailyStats(db);
    expect(second.date).toBe(first.date);

    const rows = await db
      .select()
      .from(dailyStats)
      .where(eq(dailyStats.date, first.date));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.companiesActive).toBe(second.companies_active);
    expect(rows[0]!.techOpenJobs).toBe(second.tech_open_jobs);
  });
});

afterAll(async () => {
  void pool;
});
