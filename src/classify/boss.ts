import type PgBoss from "pg-boss";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { classifyAndStoreJob } from "./classify.js";
import {
  CLASSIFY_QUEUE,
  type ClassifyJobPayload,
} from "./enqueue.js";
import { createLlmProvider } from "./llm/index.js";
import { runNightlyLlmPass } from "./nightly.js";
import { TokenBucket } from "./rate-limit.js";

export { CLASSIFY_QUEUE } from "./enqueue.js";

export const CLASSIFY_UNCLEAR_NIGHTLY_QUEUE = "classify-unclear-nightly";

export async function registerClassifyWorkers(boss: PgBoss): Promise<void> {
  await boss.createQueue(CLASSIFY_QUEUE);
  await boss.createQueue(CLASSIFY_UNCLEAR_NIGHTLY_QUEUE);

  const rateLimiter = new TokenBucket(config.LLM_RPM);
  const llm = createLlmProvider();

  for (let i = 0; i < config.CLASSIFY_CONCURRENCY; i += 1) {
    await boss.work<ClassifyJobPayload>(
      CLASSIFY_QUEUE,
      { batchSize: 1 },
      async ([job]) => {
        if (!job) return;
        const { jobId } = job.data;
        console.log(`[classify] job ${jobId}`);
        const tag = await classifyAndStoreJob(db, jobId, {
          llm,
          rateLimiter: llm ? rateLimiter : null,
          rulesOnly: !llm,
          llmOnlyIfUnclear: true,
          force: true, // queue jobs are enqueued for unclear — always run
        });
        console.log(
          `[classify] ok ${jobId}: india=${tag.india_eligibility} via ${tag.classifier}`,
        );
      },
    );
  }

  await boss.work(CLASSIFY_UNCLEAR_NIGHTLY_QUEUE, async () => {
    console.log("[classify:nightly] cron fired");
    const result = await runNightlyLlmPass(db, {
      limit: config.CLASSIFY_UNCLEAR_BATCH,
    });
    console.log(
      `[classify:nightly] moved_out_of_unclear=${result.movedOutOfUnclear} ` +
        `attempted=${result.attempted} stopped=${result.stoppedReason}`,
    );
  });

  console.log(
    `[classify] ${config.CLASSIFY_CONCURRENCY} workers registered (LLM RPM=${config.LLM_RPM})`,
  );
}

export async function scheduleClassifyUnclearCron(boss: PgBoss): Promise<void> {
  await boss.schedule(
    CLASSIFY_UNCLEAR_NIGHTLY_QUEUE,
    config.CLASSIFY_UNCLEAR_CRON,
    {},
    { tz: config.CLASSIFY_UNCLEAR_TZ },
  );
  console.log(
    `[classify:nightly] cron scheduled: ${config.CLASSIFY_UNCLEAR_CRON} (${config.CLASSIFY_UNCLEAR_TZ})`,
  );
}
