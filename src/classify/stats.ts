import { and, count, countDistinct, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companies, jobTags, jobs } from "../db/schema.js";

export interface EligibilityStats {
  /** Open jobs only (closed_at IS NULL), deduped by (company_id, external_id). */
  jobsScanned: number;
  open: number;
  regionLocked: number;
  unclear: number;
  untagged: number;
  byClassifier: Record<string, number>;
  byCompany: Array<{
    company: string;
    openJobs: number;
    indiaOpen: number;
    regionLocked: number;
    unclear: number;
    untagged: number;
  }>;
}

export async function getEligibilityStats(db: Db): Promise<EligibilityStats> {
  const openJobs = and(isNull(jobs.closedAt));

  const [{ jobsScanned } = { jobsScanned: 0 }] = await db
    .select({
      jobsScanned: countDistinct(
        sql`(${jobs.companyId}, ${jobs.externalId})`,
      ),
    })
    .from(jobs)
    .where(openJobs);

  const byEligibility = await db
    .select({
      indiaEligibility: jobTags.indiaEligibility,
      n: countDistinct(sql`(${jobs.companyId}, ${jobs.externalId})`),
    })
    .from(jobs)
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(openJobs)
    .groupBy(jobTags.indiaEligibility);

  const byClassifierRows = await db
    .select({
      classifier: jobTags.classifier,
      n: countDistinct(sql`(${jobs.companyId}, ${jobs.externalId})`),
    })
    .from(jobs)
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(openJobs)
    .groupBy(jobTags.classifier);

  const map: Record<string, number> = {};
  for (const row of byEligibility) {
    map[row.indiaEligibility ?? "null"] = Number(row.n);
  }

  const tagged = Object.values(map).reduce((a, b) => a + b, 0);
  const scanned = Number(jobsScanned);

  const byClassifier: Record<string, number> = {};
  for (const row of byClassifierRows) {
    byClassifier[row.classifier ?? "null"] = Number(row.n);
  }

  const perCompany = await db
    .select({
      company: companies.name,
      openJobs: countDistinct(sql`(${jobs.companyId}, ${jobs.externalId})`),
      indiaOpen: sql<number>`count(distinct (${jobs.companyId}, ${jobs.externalId})) filter (where ${jobTags.indiaEligibility} = 'open')`,
      regionLocked: sql<number>`count(distinct (${jobs.companyId}, ${jobs.externalId})) filter (where ${jobTags.indiaEligibility} = 'region_locked')`,
      unclear: sql<number>`count(distinct (${jobs.companyId}, ${jobs.externalId})) filter (where ${jobTags.indiaEligibility} = 'unclear')`,
      tagged: sql<number>`count(distinct (${jobs.companyId}, ${jobs.externalId})) filter (where ${jobTags.jobId} is not null)`,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(openJobs)
    .groupBy(companies.name)
    .orderBy(companies.name);

  const byCompany = perCompany.map((row) => {
    const openJobsN = Number(row.openJobs);
    const taggedN = Number(row.tagged);
    return {
      company: row.company,
      openJobs: openJobsN,
      indiaOpen: Number(row.indiaOpen),
      regionLocked: Number(row.regionLocked),
      unclear: Number(row.unclear),
      untagged: Math.max(0, openJobsN - taggedN),
    };
  });

  return {
    jobsScanned: scanned,
    open: map.open ?? 0,
    regionLocked: map.region_locked ?? 0,
    unclear: map.unclear ?? 0,
    untagged: Math.max(0, scanned - tagged),
    byClassifier,
    byCompany,
  };
}

export function formatEligibilityStats(stats: EligibilityStats): string {
  const lines = [
    `open jobs (deduped): ${stats.jobsScanned}`,
    `india open:          ${stats.open}`,
    `region locked:       ${stats.regionLocked}`,
    `unclear:             ${stats.unclear}`,
    `untagged:            ${stats.untagged}`,
    `by classifier:       ${JSON.stringify(stats.byClassifier)}`,
    ``,
    `open jobs per company:`,
  ];
  for (const c of stats.byCompany) {
    lines.push(
      `  ${c.company}: ${c.openJobs} open | india_open=${c.indiaOpen} locked=${c.regionLocked} unclear=${c.unclear} untagged=${c.untagged}`,
    );
  }
  return lines.join("\n");
}
