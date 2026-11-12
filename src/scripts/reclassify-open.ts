import { classifyAndStoreJob } from "../classify/classify.js";
import {
  findOpenJobs,
  findOpenUnclearJobs,
} from "../classify/enqueue.js";
import { createLlmProvider } from "../classify/llm/index.js";
import { TokenBucket } from "../classify/rate-limit.js";
import {
  formatEligibilityStats,
  getEligibilityStats,
} from "../classify/stats.js";
import { config } from "../config.js";
import { db, pool } from "../db/client.js";

/**
 * Fast path: rules in parallel, then LLM on unclear in parallel (no pg-boss).
 *
 * Usage:
 *   npm run reclassify:open -- --rules-only --force
 *   npm run reclassify:open -- --llm-only
 *   npm run reclassify:open -- --force
 */
async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await fn(items[idx]!, idx);
      }
    },
  );
  await Promise.all(workers);
}

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

    let done = 0;
    let cached = 0;
    await mapPool(open, 20, async (job) => {
      const tag = await classifyAndStoreJob(db, job.id, {
        rulesOnly: true,
        force,
      });
      if (tag.classifier === "cache") cached += 1;
      done += 1;
      if (done % 100 === 0 || done === open.length) {
        console.log(`  rules ${done}/${open.length} (cache hits ${cached})`);
      }
    });

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
  const llm = createLlmProvider();
  if (!llm) {
    console.log(`\nNo LLM providers configured - leaving ${unclear.length} unclear.`);
    stats = await getEligibilityStats(db);
    console.log(formatEligibilityStats(stats));
    await pool.end();
    return;
  }

  const concurrency = config.CLASSIFY_CONCURRENCY;
  const rateLimiter = new TokenBucket(config.LLM_RPM);
  console.log(
    `\nLLM classify ${unclear.length} unclear jobs (concurrency=${concurrency}, RPM=${config.LLM_RPM}, no queue)…`,
  );

  const started = Date.now();
  let done = 0;
  let llmHits = 0;
  await mapPool(unclear, concurrency, async (job) => {
    const tag = await classifyAndStoreJob(db, job.id, {
      llm,
      rateLimiter,
      llmOnlyIfUnclear: true,
      force: true,
    });
    if (tag.classifier === "llm") llmHits += 1;
    done += 1;
    console.log(
      `  [${done}/${unclear.length}] ${tag.india_eligibility} via ${tag.classifier}${tag.model ? ` (${tag.model})` : ""}`,
    );
  });

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\nLLM pass done in ${secs}s - ${llmHits}/${unclear.length} resolved by LLM`,
  );

  stats = await getEligibilityStats(db);
  console.log("\n=== india_eligibility stats ===");
  console.log(formatEligibilityStats(stats));

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
