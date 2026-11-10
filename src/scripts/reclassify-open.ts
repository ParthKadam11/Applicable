import { registerClassifyWorkers } from "../classify/boss.js";
import { classifyAndStoreJob } from "../classify/classify.js";
import {
  CLASSIFY_QUEUE,
  enqueueClassifyJobs,
  findOpenJobs,
  findOpenUnclearJobs,
} from "../classify/enqueue.js";
import {
  formatEligibilityStats,
  getEligibilityStats,
} from "../classify/stats.js";
import { createBoss } from "../ingestion/boss.js";
import { db, pool } from "../db/client.js";

/**
 * 1) Force rules reclassify of all open jobs (fast) unless cached & no --force.
 * 2) Enqueue remaining unclear for LLM via pg-boss (waits on RPM, never drops).
 * 3) Print stats.
 *
 * Usage: npm run reclassify:open
 *        npm run reclassify:open -- --rules-only
 *        npm run reclassify:open -- --rules-only --force
 *        npm run reclassify:open -- --llm-only
 */
async function main() {
  const rulesOnly = process.argv.includes("--rules-only");
  const llmOnly = process.argv.includes("--llm-only");
  const force = process.argv.includes("--force");

  let stats;
  if (!llmOnly) {
    const open = await findOpenJobs(db);
    console.log(
      `Rules reclassify ${open.length} open jobs${force ? " (force)" : " (skip unchanged hash)"}…`,
    );

    const concurrency = 20;
    let done = 0;
    let cached = 0;
    for (let i = 0; i < open.length; i += concurrency) {
      const batch = open.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (job) => {
          const tag = await classifyAndStoreJob(db, job.id, {
            rulesOnly: true,
            force,
          });
          if (tag.classifier === "cache") cached += 1;
          done += 1;
        }),
      );
      if (done % 100 === 0 || done === open.length) {
        console.log(`  rules ${done}/${open.length} (cache hits ${cached})`);
      }
    }

    stats = await getEligibilityStats(db);
    console.log("\n=== stats after rules ===");
    console.log(formatEligibilityStats(stats));
    console.log(
      `\nJobs still needing LLM: ${stats.needsLlm} (unclear after rules)`,
    );

    if (rulesOnly) {
      await pool.end();
      return;
    }
  }

  const unclear = await findOpenUnclearJobs(db);
  console.log(`\nEnqueue ${unclear.length} unclear jobs for LLM…`);

  const boss = await createBoss();
  await registerClassifyWorkers(boss);
  await enqueueClassifyJobs(
    boss,
    unclear.map((j) => j.id),
  );

  if (unclear.length > 0) {
    console.log("Waiting for classify queue to drain (waits on rate limits)…");
    for (;;) {
      const pending = await boss.getQueueSize(CLASSIFY_QUEUE, {
        before: "completed",
      });
      if (pending === 0) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  stats = await getEligibilityStats(db);
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
