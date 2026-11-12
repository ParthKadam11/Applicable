import { sql } from "drizzle-orm";
import { getEligibilityStats } from "../classify/stats.js";
import { config } from "../config.js";
import type { Db } from "../db/client.js";
import { validateCcBoards, type CcValidateStats } from "./cc-validate.js";
import { verifyAndPromote, type PromoteStats } from "./promote.js";
import {
  discoverCommonCrawlSlugs,
  hitsToDiscovered,
  type CcSlugHit,
} from "./sources/common-crawl.js";
import { upsertCandidates } from "./upsert-candidates.js";

export interface CcDiscoverResult {
  slugsFound: number;
  validated: number;
  withJobs: number;
  upserted: number;
  promote: PromoteStats | null;
  validateStats: CcValidateStats;
  techOpenBefore: number;
  techOpenAfter: number;
  elapsedMs: number;
  dryRun: boolean;
  sampleHits: CcSlugHit[];
}

export async function runCommonCrawlDiscovery(
  db: Db,
  options?: {
    limit?: number;
    dryRun?: boolean;
    concurrency?: number;
    promoteLimit?: number;
    ingest?: boolean;
  },
): Promise<CcDiscoverResult> {
  const started = Date.now();
  const limit = options?.limit ?? 2000;
  const dryRun = options?.dryRun ?? false;
  // Validation concurrency is fixed at 5 per requirements; promote uses config.
  const validateConcurrency = options?.concurrency ?? 5;
  const promoteConcurrency = config.DISCOVER_PROMOTE_CONCURRENCY;

  const before = await getEligibilityStats(db);
  const techOpenBefore = before.jobsScanned;

  console.log(
    `[discover:cc] start limit=${limit} dryRun=${dryRun} validateConcurrency=${validateConcurrency} promoteConcurrency=${promoteConcurrency}`,
  );

  const hits = await discoverCommonCrawlSlugs({
    crawlCount: 2,
    limit,
    // 100 results/page × 100 pages × 4 patterns × 2 crawls - stop early at limit
    maxPagesPerPattern: 100,
  });

  // Cap to limit (already stopped early, but be exact)
  const capped = hits.slice(0, limit);

  const { valid, stats: validateStats } = await validateCcBoards(db, capped, {
    concurrency: validateConcurrency,
    dryRun,
  });

  console.log(
    `[discover:cc] validate: checked=${validateStats.checked} cache_skip=${validateStats.skippedFreshCache} valid=${validateStats.valid} not_found=${validateStats.notFound} empty=${validateStats.empty} error=${validateStats.error}`,
  );

  let upserted = 0;
  let promote: PromoteStats | null = null;

  if (!dryRun && valid.length > 0) {
    const discovered = hitsToDiscovered(valid);
    upserted = await upsertCandidates(db, discovered);
    console.log(`[discover:cc] upserted ${upserted} candidates`);

    // Promote all newly upserted CC boards (don't truncate at cron default 300).
    const promoteLimit =
      options?.promoteLimit ??
      Math.max(config.DISCOVER_PROMOTE_LIMIT, upserted);
    promote = await verifyAndPromote(db, {
      limit: promoteLimit,
      concurrency: promoteConcurrency,
      ingest: options?.ingest ?? true,
    });
  } else if (dryRun) {
    console.log(
      `[discover:cc] dry-run - skipping upsert/promote (${valid.length} would qualify)`,
    );
  }

  const after = await getEligibilityStats(db);

  return {
    slugsFound: capped.length,
    validated: validateStats.checked + validateStats.skippedFreshCache,
    withJobs: valid.length,
    upserted,
    promote,
    validateStats,
    techOpenBefore,
    techOpenAfter: after.jobsScanned,
    elapsedMs: Date.now() - started,
    dryRun,
    sampleHits: capped.slice(0, 10),
  };
}

export function formatCcRejectTop(
  stats: CcValidateStats,
  promote: PromoteStats | null,
  n = 10,
): Array<{ reason: string; count: number }> {
  const map: Record<string, number> = { ...stats.byRejectReason };
  // Promote rejects aren't in validate stats - surface from pending rejected if needed by caller.
  void promote;
  return Object.entries(map)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** Top reject reasons from company_candidates for source=common_crawl. */
export async function topCcPromoteRejectReasons(
  db: Db,
  n = 10,
): Promise<Array<{ reason: string; count: number }>> {
  const rows = await db.execute(sql`
    select
      case
        when reject_reason like 'too many jobs%' then 'too many jobs (>150)'
        else coalesce(reject_reason, '(none)')
      end as reason,
      count(*)::int as n
    from company_candidates
    where source = 'common_crawl' and status = 'rejected'
    group by 1
    order by n desc
    limit ${sql.raw(String(Math.max(1, Math.min(50, n))))}
  `);
  return (rows.rows as Array<{ reason: string; n: number }>).map((r) => ({
    reason: r.reason,
    count: Number(r.n),
  }));
}
