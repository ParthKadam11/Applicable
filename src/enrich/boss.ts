import type PgBoss from "pg-boss";
import { db } from "../db/client.js";
import { enrichCompanies } from "./run.js";

export const ENRICH_QUEUE = "enrich-companies";
export const ENRICH_SCHEDULE_QUEUE = "enrich-schedule";

/** Daily enrichment of stale companies (enriched_at older than 7 days). */
export async function registerEnrichWorkers(boss: PgBoss): Promise<void> {
  await boss.createQueue(ENRICH_QUEUE);
  await boss.createQueue(ENRICH_SCHEDULE_QUEUE);

  await boss.work(ENRICH_QUEUE, async () => {
    console.log("[enrich] daily run starting…");
    try {
      const summary = await enrichCompanies(db, {
        limit: 40,
        skipLlm: false,
      });
      console.log(
        "[enrich] done:",
        JSON.stringify({
          enriched: summary.enriched,
          skipped: summary.skipped,
          failed: summary.failed,
          factsWritten: summary.factsWritten,
        }),
      );
    } catch (err) {
      console.error(
        "[enrich] run failed (soft):",
        err instanceof Error ? err.message : err,
      );
    }
  });

  await boss.work(ENRICH_SCHEDULE_QUEUE, async () => {
    await boss.send(ENRICH_QUEUE, {});
  });
}

export async function scheduleEnrichCron(boss: PgBoss): Promise<void> {
  // 05:00 UTC daily — after discover window
  await boss.schedule(ENRICH_SCHEDULE_QUEUE, "0 5 * * *", {}, { tz: "UTC" });
  console.log("[enrich] cron scheduled: 0 5 * * * (UTC)");
}
