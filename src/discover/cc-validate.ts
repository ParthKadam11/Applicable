import { gt } from "drizzle-orm";
import type { Ats } from "../ats/types.js";
import type { Db } from "../db/client.js";
import { atsBoardChecks } from "../db/schema.js";
import { countOpenJobs } from "./probe-ats.js";
import type { CcSlugHit } from "./sources/common-crawl.js";

const CACHE_DAYS = 7;

export type BoardCheckStatus = "valid" | "not_found" | "empty" | "error";

export interface ValidatedBoard extends CcSlugHit {
  jobCount: number;
  fromCache: boolean;
}

export interface CcValidateStats {
  checked: number;
  skippedFreshCache: number;
  valid: number;
  notFound: number;
  empty: number;
  error: number;
  byRejectReason: Record<string, number>;
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await fn(items[idx]!);
      }
    },
  );
  await Promise.all(workers);
}

async function upsertCheck(
  db: Db,
  row: {
    ats: Ats;
    slug: string;
    status: BoardCheckStatus;
    jobCount: number | null;
    error?: string | null;
  },
): Promise<void> {
  await db
    .insert(atsBoardChecks)
    .values({
      ats: row.ats,
      slug: row.slug,
      status: row.status,
      jobCount: row.jobCount,
      checkedAt: new Date(),
      error: row.error ?? null,
    })
    .onConflictDoUpdate({
      target: [atsBoardChecks.ats, atsBoardChecks.slug],
      set: {
        status: row.status,
        jobCount: row.jobCount,
        checkedAt: new Date(),
        error: row.error ?? null,
      },
    });
}

/**
 * Validate ATS boards via public jobs APIs.
 * Skips slugs checked within the last 7 days (uses cached status).
 * Keeps only boards with ≥1 open job.
 */
export async function validateCcBoards(
  db: Db,
  hits: CcSlugHit[],
  options?: { concurrency?: number; dryRun?: boolean },
): Promise<{ valid: ValidatedBoard[]; stats: CcValidateStats }> {
  const concurrency = options?.concurrency ?? 5;
  const dryRun = options?.dryRun ?? false;
  const cutoff = new Date(Date.now() - CACHE_DAYS * 24 * 60 * 60 * 1000);

  const stats: CcValidateStats = {
    checked: 0,
    skippedFreshCache: 0,
    valid: 0,
    notFound: 0,
    empty: 0,
    error: 0,
    byRejectReason: {},
  };
  const valid: ValidatedBoard[] = [];

  // Load fresh cache rows for these keys
  const cacheMap = new Map<
    string,
    { status: string; jobCount: number | null }
  >();
  if (hits.length > 0) {
    const fresh = await db
      .select({
        ats: atsBoardChecks.ats,
        slug: atsBoardChecks.slug,
        status: atsBoardChecks.status,
        jobCount: atsBoardChecks.jobCount,
      })
      .from(atsBoardChecks)
      .where(gt(atsBoardChecks.checkedAt, cutoff));
    for (const row of fresh) {
      cacheMap.set(`${row.ats}:${row.slug.toLowerCase()}`, {
        status: row.status,
        jobCount: row.jobCount,
      });
    }
  }

  const toProbe: CcSlugHit[] = [];
  for (const hit of hits) {
    const key = `${hit.ats}:${hit.slug.toLowerCase()}`;
    const cached = cacheMap.get(key);
    if (cached) {
      stats.skippedFreshCache += 1;
      if (cached.status === "valid" && (cached.jobCount ?? 0) >= 1) {
        stats.valid += 1;
        valid.push({
          ...hit,
          jobCount: cached.jobCount ?? 0,
          fromCache: true,
        });
      } else {
        bump(stats.byRejectReason, `cache_${cached.status}`);
        if (cached.status === "not_found") stats.notFound += 1;
        else if (cached.status === "empty") stats.empty += 1;
        else stats.error += 1;
      }
      continue;
    }
    toProbe.push(hit);
  }

  let done = 0;
  const total = toProbe.length;
  console.log(
    `[discover:cc] probing ${total} slugs (concurrency=${concurrency})…`,
  );

  await mapPool(toProbe, concurrency, async (hit) => {
    stats.checked += 1;
    try {
      const n = await countOpenJobs(hit.ats, hit.slug);
      if (n == null) {
        stats.notFound += 1;
        bump(stats.byRejectReason, "board_not_found");
        if (!dryRun) {
          await upsertCheck(db, {
            ats: hit.ats,
            slug: hit.slug,
            status: "not_found",
            jobCount: null,
          });
        }
        return;
      }
      if (n < 1) {
        stats.empty += 1;
        bump(stats.byRejectReason, "zero_jobs");
        if (!dryRun) {
          await upsertCheck(db, {
            ats: hit.ats,
            slug: hit.slug,
            status: "empty",
            jobCount: 0,
          });
        }
        return;
      }
      stats.valid += 1;
      valid.push({ ...hit, jobCount: n, fromCache: false });
      if (!dryRun) {
        await upsertCheck(db, {
          ats: hit.ats,
          slug: hit.slug,
          status: "valid",
          jobCount: n,
        });
      }
    } catch (err) {
      stats.error += 1;
      const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
      bump(stats.byRejectReason, "probe_error");
      if (!dryRun) {
        await upsertCheck(db, {
          ats: hit.ats,
          slug: hit.slug,
          status: "error",
          jobCount: null,
          error: msg,
        });
      }
    } finally {
      done += 1;
      if (done % 50 === 0 || done === total) {
        console.log(
          `[discover:cc] probe progress ${done}/${total} valid=${stats.valid} empty=${stats.empty} not_found=${stats.notFound} error=${stats.error}`,
        );
      }
    }
  });

  return { valid, stats };
}
