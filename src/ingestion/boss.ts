import { eq } from "drizzle-orm";
import PgBoss from "pg-boss";
import {
  registerClassifyWorkers,
  scheduleClassifyUnclearCron,
} from "../classify/boss.js";
import { enqueueJobsNeedingClassification } from "../classify/enqueue.js";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { companies } from "../db/schema.js";
import { enqueueHydraSync, registerHydraWorkers } from "../hydra/boss.js";
import { writeDailyStats } from "../stats/daily.js";
import { fetchCompanyJobs } from "./fetch-company.js";

export const INGEST_QUEUE = "ingest-company";
export const SCHEDULE_QUEUE = "ingest-schedule";
export const DAILY_STATS_QUEUE = "daily-stats";

export type IngestCompanyJob = {
  companyId: string;
};

export async function createBoss(): Promise<PgBoss> {
  const boss = new PgBoss({
    connectionString: config.DATABASE_URL,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: Math.ceil(config.INGEST_COMPANY_TIMEOUT_MS / 1000) + 30,
  });

  boss.on("error", (err) => {
    console.error("[pg-boss] error:", err);
  });

  await boss.start();
  return boss;
}

async function handleIngestJob(
  jobs: Array<{ data: IngestCompanyJob }>,
  boss: PgBoss,
): Promise<void> {
  const job = jobs[0];
  if (!job) return;

  const { companyId } = job.data;
  console.log(`[ingest] fetching company ${companyId}`);
  const result = await fetchCompanyJobs(db, companyId, {
    timeoutMs: config.INGEST_COMPANY_TIMEOUT_MS,
  });

  if (result.ok) {
    console.log(
      `[ingest] ok ${result.companyName}: ${result.jobCount} jobs (${result.closedCount} closed)`,
    );
    await enqueueJobsNeedingClassification(boss, db, companyId);
    // Catch jobs that already had fresh tags (no classify enqueue) + deletes
    await enqueueHydraSync(boss, { companyId });
  } else {
    console.error(
      `[ingest] fail ${result.companyName}: ${result.error ?? "unknown"}`,
    );
    throw new Error(result.error ?? "ingest failed");
  }
}

export async function registerIngestWorkers(boss: PgBoss): Promise<void> {
  await boss.createQueue(INGEST_QUEUE);
  await boss.createQueue(SCHEDULE_QUEUE);
  await boss.createQueue(DAILY_STATS_QUEUE);

  for (let i = 0; i < config.INGEST_CONCURRENCY; i += 1) {
    await boss.work<IngestCompanyJob>(
      INGEST_QUEUE,
      { batchSize: 1 },
      (jobs) => handleIngestJob(jobs, boss),
    );
  }

  await registerClassifyWorkers(boss);
  await registerHydraWorkers(boss);

  await boss.work(SCHEDULE_QUEUE, async () => {
    await enqueueActiveCompanies(boss);
    // Refresh today's snapshot after each ingest wave is enqueued.
    await writeDailyStats(db);
  });

  await boss.work(DAILY_STATS_QUEUE, async () => {
    await writeDailyStats(db);
  });
}

export async function enqueueActiveCompanies(boss: PgBoss): Promise<number> {
  const active = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.active, true));

  for (const company of active) {
    await boss.send(
      INGEST_QUEUE,
      { companyId: company.id } satisfies IngestCompanyJob,
      {
        singletonKey: company.id,
        retryLimit: 3,
        retryDelay: 30,
        retryBackoff: true,
        expireInSeconds:
          Math.ceil(config.INGEST_COMPANY_TIMEOUT_MS / 1000) + 30,
      },
    );
  }

  console.log(`[ingest] enqueued ${active.length} active companies`);
  return active.length;
}

export async function scheduleIngestCron(boss: PgBoss): Promise<void> {
  await boss.schedule(SCHEDULE_QUEUE, config.INGEST_CRON, {}, {
    tz: "UTC",
  });
  console.log(`[ingest] cron scheduled: ${config.INGEST_CRON} (UTC)`);

  // Daily stats safety net (after typical IST overnight ingest + nightly LLM).
  await boss.schedule(DAILY_STATS_QUEUE, "0 4 * * *", {}, {
    tz: "Asia/Kolkata",
  });
  console.log(`[daily_stats] cron scheduled: 0 4 * * * (Asia/Kolkata)`);

  await scheduleClassifyUnclearCron(boss);
}

export { CLASSIFY_QUEUE } from "../classify/enqueue.js";
