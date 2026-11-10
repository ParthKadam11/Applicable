import { count, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { jobTags, jobs } from "../db/schema.js";

export interface EligibilityStats {
  jobsScanned: number;
  open: number;
  regionLocked: number;
  unclear: number;
  untagged: number;
  byClassifier: Record<string, number>;
}

export async function getEligibilityStats(db: Db): Promise<EligibilityStats> {
  const [{ jobsScanned } = { jobsScanned: 0 }] = await db
    .select({ jobsScanned: count() })
    .from(jobs);

  const byEligibility = await db
    .select({
      indiaEligibility: jobTags.indiaEligibility,
      n: count(),
    })
    .from(jobTags)
    .groupBy(jobTags.indiaEligibility);

  const byClassifierRows = await db
    .select({
      classifier: jobTags.classifier,
      n: count(),
    })
    .from(jobTags)
    .groupBy(jobTags.classifier);

  const map: Record<string, number> = {};
  for (const row of byEligibility) {
    map[row.indiaEligibility ?? "null"] = row.n;
  }

  const tagged = Object.values(map).reduce((a, b) => a + b, 0);

  const byClassifier: Record<string, number> = {};
  for (const row of byClassifierRows) {
    byClassifier[row.classifier ?? "null"] = row.n;
  }

  return {
    jobsScanned,
    open: map.open ?? 0,
    regionLocked: map.region_locked ?? 0,
    unclear: map.unclear ?? 0,
    untagged: Math.max(0, jobsScanned - tagged),
    byClassifier,
  };
}

export function formatEligibilityStats(stats: EligibilityStats): string {
  return [
    `jobs scanned:     ${stats.jobsScanned}`,
    `india open:       ${stats.open}`,
    `region locked:    ${stats.regionLocked}`,
    `unclear:          ${stats.unclear}`,
    `untagged:         ${stats.untagged}`,
    `by classifier:    ${JSON.stringify(stats.byClassifier)}`,
  ].join("\n");
}

/** Convenience SQL for ad-hoc inspection. */
export const ELIGIBILITY_COUNTS_SQL = sql`
  SELECT india_eligibility, COUNT(*) AS n
  FROM job_tags
  GROUP BY india_eligibility
  ORDER BY n DESC
`;
