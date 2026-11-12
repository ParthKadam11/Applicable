import {
  and,
  count,
  countDistinct,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  companies,
  dailyStats,
  jobTags,
  jobs,
} from "../db/schema.js";

export type DailyStatsRow = {
  date: string;
  companies_active: number;
  tech_open_jobs: number;
  by_eligibility: {
    open: number;
    india_remote: number;
    india_onsite: number;
    region_locked: number;
    unclear: number;
  };
  new_jobs_24h: number;
  closed_jobs_24h: number;
};

function techOpenActive() {
  return and(
    isNull(jobs.closedAt),
    eq(companies.active, true),
    or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
  );
}

/** Calendar date in Asia/Kolkata (YYYY-MM-DD). */
export function todayIstDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export async function computeDailyStatsSnapshot(
  db: Db,
  at: Date = new Date(),
): Promise<Omit<DailyStatsRow, "date"> & { date: string }> {
  const date = todayIstDate(at);
  const since = new Date(at.getTime() - 24 * 60 * 60 * 1000);

  const [{ companiesActive } = { companiesActive: 0 }] = await db
    .select({ companiesActive: count() })
    .from(companies)
    .where(eq(companies.active, true));

  const byEligibility = await db
    .select({
      indiaEligibility: jobTags.indiaEligibility,
      n: countDistinct(sql`(${jobs.companyId}, ${jobs.externalId})`),
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(techOpenActive())
    .groupBy(jobTags.indiaEligibility);

  const eligibility = {
    open: 0,
    india_remote: 0,
    india_onsite: 0,
    region_locked: 0,
    unclear: 0,
  };
  let techOpen = 0;
  for (const row of byEligibility) {
    const n = Number(row.n);
    techOpen += n;
    const key = row.indiaEligibility;
    if (key === "open") eligibility.open = n;
    else if (key === "india_remote") eligibility.india_remote = n;
    else if (key === "india_onsite") eligibility.india_onsite = n;
    else if (key === "region_locked") eligibility.region_locked = n;
    else if (key === "unclear") eligibility.unclear = n;
  }

  const [{ newJobs } = { newJobs: 0 }] = await db
    .select({
      newJobs: countDistinct(sql`(${jobs.companyId}, ${jobs.externalId})`),
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(
        eq(companies.active, true),
        gte(jobs.firstSeenAt, since),
        or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
      ),
    );

  const [{ closedJobs } = { closedJobs: 0 }] = await db
    .select({
      closedJobs: countDistinct(sql`(${jobs.companyId}, ${jobs.externalId})`),
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(
        eq(companies.active, true),
        isNotNull(jobs.closedAt),
        gte(jobs.closedAt, since),
        lt(jobs.closedAt, at),
        or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
      ),
    );

  return {
    date,
    companies_active: Number(companiesActive),
    tech_open_jobs: techOpen,
    by_eligibility: eligibility,
    new_jobs_24h: Number(newJobs),
    closed_jobs_24h: Number(closedJobs),
  };
}

/** Upsert today's daily_stats row from live corpus counts. */
export async function writeDailyStats(
  db: Db,
  at: Date = new Date(),
): Promise<DailyStatsRow> {
  const snap = await computeDailyStatsSnapshot(db, at);
  const row = {
    date: snap.date,
    companiesActive: snap.companies_active,
    techOpenJobs: snap.tech_open_jobs,
    eligibilityOpen: snap.by_eligibility.open,
    eligibilityIndiaRemote: snap.by_eligibility.india_remote,
    eligibilityIndiaOnsite: snap.by_eligibility.india_onsite,
    eligibilityRegionLocked: snap.by_eligibility.region_locked,
    eligibilityUnclear: snap.by_eligibility.unclear,
    newJobs24h: snap.new_jobs_24h,
    closedJobs24h: snap.closed_jobs_24h,
    createdAt: new Date(),
  };

  await db
    .insert(dailyStats)
    .values(row)
    .onConflictDoUpdate({
      target: dailyStats.date,
      set: {
        companiesActive: row.companiesActive,
        techOpenJobs: row.techOpenJobs,
        eligibilityOpen: row.eligibilityOpen,
        eligibilityIndiaRemote: row.eligibilityIndiaRemote,
        eligibilityIndiaOnsite: row.eligibilityIndiaOnsite,
        eligibilityRegionLocked: row.eligibilityRegionLocked,
        eligibilityUnclear: row.eligibilityUnclear,
        newJobs24h: row.newJobs24h,
        closedJobs24h: row.closedJobs24h,
        createdAt: row.createdAt,
      },
    });

  console.log(
    `[daily_stats] wrote ${snap.date}: active=${snap.companies_active} tech_open=${snap.tech_open_jobs} new_24h=${snap.new_jobs_24h} closed_24h=${snap.closed_jobs_24h}`,
  );
  return snap;
}

export async function getDailyStatsHistory(
  db: Db,
  days = 30,
): Promise<DailyStatsRow[]> {
  const limit = Math.max(1, Math.min(365, Math.floor(days)));
  const rows = await db
    .select()
    .from(dailyStats)
    .orderBy(sql`${dailyStats.date} desc`)
    .limit(limit);

  return rows.map((r) => ({
    date: String(r.date),
    companies_active: r.companiesActive,
    tech_open_jobs: r.techOpenJobs,
    by_eligibility: {
      open: r.eligibilityOpen,
      india_remote: r.eligibilityIndiaRemote,
      india_onsite: r.eligibilityIndiaOnsite,
      region_locked: r.eligibilityRegionLocked,
      unclear: r.eligibilityUnclear,
    },
    new_jobs_24h: r.newJobs24h,
    closed_jobs_24h: r.closedJobs24h,
  }));
}
