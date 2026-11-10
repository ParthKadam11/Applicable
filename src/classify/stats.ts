import { and, countDistinct, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companies, jobTags, jobs } from "../db/schema.js";

/** Open + active + tech roles only (excludes role_family=non_tech). */
function techOpenActive() {
  return and(
    isNull(jobs.closedAt),
    eq(companies.active, true),
    or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
  );
}

export interface EligibilityStats {
  /** Open tech jobs only (closed_at IS NULL), deduped by (company_id, external_id). */
  jobsScanned: number;
  open: number;
  indiaRemote: number;
  indiaOnsite: number;
  regionLocked: number;
  unclear: number;
  untagged: number;
  nonTechExcluded: number;
  /** Jobs that still need LLM (unclear after rules). */
  needsLlm: number;
  byClassifier: Record<string, number>;
  byCompany: Array<{
    company: string;
    openJobs: number;
    indiaOpen: number;
    indiaRemote: number;
    indiaOnsite: number;
    regionLocked: number;
    unclear: number;
    untagged: number;
  }>;
}

export async function getEligibilityStats(db: Db): Promise<EligibilityStats> {
  const openActive = and(isNull(jobs.closedAt), eq(companies.active, true));
  const techFilter = techOpenActive();

  const [{ jobsScanned } = { jobsScanned: 0 }] = await db
    .select({
      jobsScanned: countDistinct(
        sql`(${jobs.companyId}, ${jobs.externalId})`,
      ),
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(techFilter);

  const [{ nonTechExcluded } = { nonTechExcluded: 0 }] = await db
    .select({
      nonTechExcluded: countDistinct(
        sql`(${jobs.companyId}, ${jobs.externalId})`,
      ),
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(openActive, eq(jobTags.roleFamily, "non_tech")),
    );

  const byEligibility = await db
    .select({
      indiaEligibility: jobTags.indiaEligibility,
      n: countDistinct(sql`(${jobs.companyId}, ${jobs.externalId})`),
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(and(openActive, ne(jobTags.roleFamily, "non_tech")))
    .groupBy(jobTags.indiaEligibility);

  const byClassifierRows = await db
    .select({
      classifier: jobTags.classifier,
      n: countDistinct(sql`(${jobs.companyId}, ${jobs.externalId})`),
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(and(openActive, ne(jobTags.roleFamily, "non_tech")))
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
      openJobs: sql<number>`count(distinct (${jobs.companyId}, ${jobs.externalId})) filter (where ${jobTags.roleFamily} is distinct from 'non_tech')`,
      indiaOpen: sql<number>`count(distinct (${jobs.companyId}, ${jobs.externalId})) filter (where ${jobTags.indiaEligibility} = 'open' and ${jobTags.roleFamily} is distinct from 'non_tech')`,
      indiaRemote: sql<number>`count(distinct (${jobs.companyId}, ${jobs.externalId})) filter (where ${jobTags.indiaEligibility} = 'india_remote' and ${jobTags.roleFamily} is distinct from 'non_tech')`,
      indiaOnsite: sql<number>`count(distinct (${jobs.companyId}, ${jobs.externalId})) filter (where ${jobTags.indiaEligibility} = 'india_onsite' and ${jobTags.roleFamily} is distinct from 'non_tech')`,
      regionLocked: sql<number>`count(distinct (${jobs.companyId}, ${jobs.externalId})) filter (where ${jobTags.indiaEligibility} = 'region_locked' and ${jobTags.roleFamily} is distinct from 'non_tech')`,
      unclear: sql<number>`count(distinct (${jobs.companyId}, ${jobs.externalId})) filter (where ${jobTags.indiaEligibility} = 'unclear' and ${jobTags.roleFamily} is distinct from 'non_tech')`,
      tagged: sql<number>`count(distinct (${jobs.companyId}, ${jobs.externalId})) filter (where ${jobTags.jobId} is not null and ${jobTags.roleFamily} is distinct from 'non_tech')`,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(openActive)
    .groupBy(companies.name)
    .orderBy(companies.name);

  const byCompany = perCompany.map((row) => {
    const openJobsN = Number(row.openJobs);
    const taggedN = Number(row.tagged);
    return {
      company: row.company,
      openJobs: openJobsN,
      indiaOpen: Number(row.indiaOpen),
      indiaRemote: Number(row.indiaRemote),
      indiaOnsite: Number(row.indiaOnsite),
      regionLocked: Number(row.regionLocked),
      unclear: Number(row.unclear),
      untagged: Math.max(0, openJobsN - taggedN),
    };
  });

  const unclear = map.unclear ?? 0;

  return {
    jobsScanned: scanned,
    open: map.open ?? 0,
    indiaRemote: map.india_remote ?? 0,
    indiaOnsite: map.india_onsite ?? 0,
    regionLocked: map.region_locked ?? 0,
    unclear,
    untagged: Math.max(0, scanned - tagged),
    nonTechExcluded: Number(nonTechExcluded),
    needsLlm: unclear,
    byClassifier,
    byCompany,
  };
}

export function formatEligibilityStats(stats: EligibilityStats): string {
  const lines = [
    `tech open jobs (deduped): ${stats.jobsScanned}`,
    `worldwide open:           ${stats.open}`,
    `india remote:             ${stats.indiaRemote}`,
    `india onsite:             ${stats.indiaOnsite}`,
    `region locked:            ${stats.regionLocked}`,
    `unclear (need LLM):       ${stats.unclear}`,
    `untagged:                 ${stats.untagged}`,
    `non-tech excluded:        ${stats.nonTechExcluded}`,
    `by classifier:            ${JSON.stringify(stats.byClassifier)}`,
    ``,
    `tech open jobs per company:`,
  ];
  for (const c of stats.byCompany) {
    if (c.openJobs === 0 && c.untagged === 0) continue;
    lines.push(
      `  ${c.company}: ${c.openJobs} open | ww_open=${c.indiaOpen} india_remote=${c.indiaRemote} india_onsite=${c.indiaOnsite} locked=${c.regionLocked} unclear=${c.unclear} untagged=${c.untagged}`,
    );
  }
  return lines.join("\n");
}
