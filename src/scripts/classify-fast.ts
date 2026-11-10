import { classifyAndStoreJob } from "../classify/classify.js";
import { findJobsNeedingClassification } from "../classify/enqueue.js";
import {
  formatEligibilityStats,
  getEligibilityStats,
} from "../classify/stats.js";
import { db, pool } from "../db/client.js";

/**
 * Rules-only classify — no LLM, no pg-boss. Finishes remaining jobs in seconds.
 * Usage: npm run classify:fast
 */
async function main() {
  const needing = await findJobsNeedingClassification(db);
  console.log(`Rules-only classify: ${needing.length} jobs…`);

  const concurrency = 20;
  let done = 0;
  for (let i = 0; i < needing.length; i += concurrency) {
    const batch = needing.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (job) => {
        await classifyAndStoreJob(db, job.id, { rulesOnly: true });
        done += 1;
      }),
    );
    console.log(`  ${done}/${needing.length}`);
  }

  const stats = await getEligibilityStats(db);
  console.log("\n=== india_eligibility stats ===");
  console.log(formatEligibilityStats(stats));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
