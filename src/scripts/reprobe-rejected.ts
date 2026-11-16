/**
 * Re-probe company_candidates rejected for transient / no-ATS reasons.
 * Resets matching rows to pending, then verifyAndPromote with backoff.
 *
 * Usage: npx tsx src/scripts/reprobe-rejected.ts [--limit=200] [--concurrency=3]
 */
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { config } from "../config.js";
import { db, pool } from "../db/client.js";
import { companyCandidates } from "../db/schema.js";
import { verifyAndPromote } from "../discover/promote.js";
import { getEligibilityStats, formatEligibilityStats } from "../classify/stats.js";

const TRANSIENT_REASONS = [
  "no ATS board found",
  "timeout after retry",
] as const;

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const limit = argNum("limit", 250);
  const concurrency = argNum(
    "concurrency",
    Math.min(3, config.DISCOVER_PROMOTE_CONCURRENCY || 3),
  );

  // Also catch rate-limit / unreachable style error rejects.
  const rows = await db
    .select({ id: companyCandidates.id, reason: companyCandidates.rejectReason })
    .from(companyCandidates)
    .where(
      and(
        eq(companyCandidates.status, "rejected"),
        or(
          inArray(companyCandidates.rejectReason, [...TRANSIENT_REASONS]),
          sql`${companyCandidates.rejectReason} ~* 'timeout|rate.?limit|429|ECONNRESET|ENOTFOUND|unreachable|fetch failed|network|503|502'`,
        ),
      ),
    )
    .orderBy(sql`${companyCandidates.updatedAt} desc`)
    .limit(limit);

  console.log(`[reprobe] candidates to reset: ${rows.length}`);
  if (rows.length === 0) {
    await pool.end();
    return;
  }

  const ids = rows.map((r) => r.id);
  await db
    .update(companyCandidates)
    .set({
      status: "pending",
      rejectReason: null,
      updatedAt: new Date(),
    })
    .where(inArray(companyCandidates.id, ids));

  // Mild backoff before hammering ATS APIs.
  await sleep(1500);

  const promote = await verifyAndPromote(db, {
    limit: ids.length,
    concurrency,
    ingest: true,
    candidateIds: ids,
  });

  console.log(
    `[reprobe] attempted=${promote.attempted} promoted=${promote.promoted} verified=${promote.verified} rejected=${promote.rejected} skipped_existing=${promote.skippedExisting} ingested=${promote.ingestedJobs} classified=${promote.classifiedJobs}`,
  );

  const stats = await getEligibilityStats(db);
  console.log(formatEligibilityStats(stats));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
