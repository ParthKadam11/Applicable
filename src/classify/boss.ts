import type PgBoss from "pg-boss";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { classifyAndStoreJob } from "./classify.js";
import {
  CLASSIFY_QUEUE,
  type ClassifyJobPayload,
} from "./enqueue.js";
import { createLlmProvider } from "./llm/index.js";
import { TokenBucket } from "./rate-limit.js";

export { CLASSIFY_QUEUE } from "./enqueue.js";

export async function registerClassifyWorkers(boss: PgBoss): Promise<void> {
  await boss.createQueue(CLASSIFY_QUEUE);

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

  console.log(
    `[classify] ${config.CLASSIFY_CONCURRENCY} workers registered (LLM RPM=${config.LLM_RPM})`,
  );
}
