import type PgBoss from "pg-boss";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { runCommonCrawlDiscovery } from "./run-cc.js";
import { runDiscovery } from "./run.js";

export const DISCOVER_QUEUE = "discover-companies";
export const DISCOVER_SCHEDULE_QUEUE = "discover-schedule";

export async function registerDiscoverWorkers(boss: PgBoss): Promise<void> {
  await boss.createQueue(DISCOVER_QUEUE);
  await boss.createQueue(DISCOVER_SCHEDULE_QUEUE);

  await boss.work(DISCOVER_QUEUE, async () => {
    console.log("[discover] weekly run starting…");
    const result = await runDiscovery(db, {
      promoteLimit: config.DISCOVER_PROMOTE_LIMIT,
    });
    console.log("[discover] done:", JSON.stringify(result));

    console.log(
      `[discover] common_crawl starting (limit=${config.DISCOVER_CC_LIMIT})…`,
    );
    const cc = await runCommonCrawlDiscovery(db, {
      limit: config.DISCOVER_CC_LIMIT,
      promoteLimit: config.DISCOVER_PROMOTE_LIMIT,
      ingest: true,
    });
    console.log(
      `[discover] common_crawl done: found=${cc.slugsFound} with_jobs=${cc.withJobs} promoted=${cc.promote?.promoted ?? 0}`,
    );
  });

  await boss.work(DISCOVER_SCHEDULE_QUEUE, async () => {
    await boss.send(DISCOVER_QUEUE, {});
  });
}

export async function scheduleDiscoverCron(boss: PgBoss): Promise<void> {
  await boss.schedule(DISCOVER_SCHEDULE_QUEUE, config.DISCOVER_CRON, {}, {
    tz: "UTC",
  });
  console.log(`[discover] cron scheduled: ${config.DISCOVER_CRON} (UTC)`);
}
