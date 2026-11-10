import { registerClassifyWorkers } from "../classify/boss.js";
import {
  CLASSIFY_QUEUE,
  enqueueJobsNeedingClassification,
} from "../classify/enqueue.js";
import {
  formatEligibilityStats,
  getEligibilityStats,
} from "../classify/stats.js";
import { createBoss } from "../ingestion/boss.js";
import { db, pool } from "../db/client.js";

/**
 * Classify-only pass: does NOT start ingest workers (avoids re-fetch storms).
 * Enqueues jobs needing tags, drains the queue, prints india_eligibility stats.
 */
async function main() {
  const boss = await createBoss();
  await registerClassifyWorkers(boss);

  const enqueued = await enqueueJobsNeedingClassification(boss, db);
  if (enqueued === 0) {
    console.log("No jobs need classification.");
  } else {
    console.log(`Waiting for classify queue to drain (${enqueued} enqueued)…`);
    for (;;) {
      const pending = await boss.getQueueSize(CLASSIFY_QUEUE, {
        before: "completed",
      });
      if (pending === 0) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  const stats = await getEligibilityStats(db);
  console.log("\n=== india_eligibility stats ===");
  console.log(formatEligibilityStats(stats));

  await boss.stop({ graceful: true, timeout: 15_000 });
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
