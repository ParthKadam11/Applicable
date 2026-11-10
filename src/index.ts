import { createBoss, registerIngestWorkers, scheduleIngestCron } from "./ingestion/boss.js";
import { pool } from "./db/client.js";

async function main() {
  console.log("JobFit worker starting…");

  const boss = await createBoss();
  await registerIngestWorkers(boss);
  await scheduleIngestCron(boss);

  console.log("Ingestion + classify workers registered. Waiting for jobs.");

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down…`);
    await boss.stop({ graceful: true, timeout: 15_000 });
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
