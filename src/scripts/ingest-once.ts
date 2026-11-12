import {
  createBoss,
  enqueueActiveCompanies,
  INGEST_QUEUE,
  registerIngestWorkers,
} from "../ingestion/boss.js";
import { pool } from "../db/client.js";

/**
 * Enqueue all active companies once and wait for the queue to drain.
 * Useful for local smoke tests without waiting for cron.
 */
async function main() {
  const boss = await createBoss();
  await registerIngestWorkers(boss);
  const count = await enqueueActiveCompanies(boss);

  if (count === 0) {
    console.log("No active companies - seed first with npm run db:seed");
    await boss.stop({ graceful: true, timeout: 5_000 });
    await pool.end();
    return;
  }

  console.log("Waiting for ingest queue to drain (Ctrl+C to stop early)…");

  // Poll until no created/retry/active jobs remain
  for (;;) {
    const pending = await boss.getQueueSize(INGEST_QUEUE, {
      before: "completed",
    });
    if (pending === 0) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("Ingest pass complete.");
  await boss.stop({ graceful: true, timeout: 15_000 });
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
