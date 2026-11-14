import type PgBoss from "pg-boss";
import { db } from "../db/client.js";
import { createHydraClient } from "./client.js";
import { HYDRA_SYNC_QUEUE, runHydraSync, type HydraSyncPayload } from "./sync.js";

export { HYDRA_SYNC_QUEUE };

export async function registerHydraWorkers(boss: PgBoss): Promise<void> {
  await boss.createQueue(HYDRA_SYNC_QUEUE);

  await boss.work<HydraSyncPayload>(
    HYDRA_SYNC_QUEUE,
    { batchSize: 1 },
    async ([job]) => {
      if (!job) return;
      const payload = job.data ?? {};
      console.log(
        `[hydra-sync] job full=${Boolean(payload.full)} ` +
          `jobIds=${payload.jobIds?.length ?? 0} companyId=${payload.companyId ?? "-"}`,
      );
      // Never throw: sync records failures in hydra_sync_runs
      await runHydraSync(db, payload, createHydraClient());
    },
  );

  console.log("[hydra-sync] worker registered");
}

/** Enqueue after classify. Failures here must not break classify. */
export async function enqueueHydraSync(
  boss: PgBoss,
  payload: HydraSyncPayload = {},
): Promise<void> {
  try {
    const client = createHydraClient();
    if (!client.enabled) return;

    const singletonKey = payload.full
      ? "full"
      : payload.companyId
        ? `company:${payload.companyId}`
        : payload.jobIds?.length === 1
          ? `job:${payload.jobIds[0]}`
          : payload.jobIds?.length
            ? `jobs:${payload.jobIds.slice().sort().join(",").slice(0, 80)}`
            : "incremental";

    await boss.send(HYDRA_SYNC_QUEUE, payload, {
      singletonKey,
      retryLimit: 2,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 600,
    });
  } catch (err) {
    console.error(
      "[hydra-sync] enqueue failed (ignored):",
      err instanceof Error ? err.message : err,
    );
  }
}
