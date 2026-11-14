import type PgBoss from "pg-boss";
import { db } from "../db/client.js";
import { createGraphClient } from "./driver.js";
import {
  GRAPH_SYNC_QUEUE,
  runGraphSync,
  type GraphSyncPayload,
} from "./sync.js";

export { GRAPH_SYNC_QUEUE };

export async function registerGraphWorkers(boss: PgBoss): Promise<void> {
  await boss.createQueue(GRAPH_SYNC_QUEUE);

  await boss.work<GraphSyncPayload>(
    GRAPH_SYNC_QUEUE,
    { batchSize: 1 },
    async ([job]) => {
      if (!job) return;
      const payload = job.data ?? {};
      console.log(
        `[graph-sync] job full=${Boolean(payload.full)} ` +
          `jobIds=${payload.jobIds?.length ?? 0} companyId=${payload.companyId ?? "-"}`,
      );
      await runGraphSync(db, payload, createGraphClient());
    },
  );

  console.log("[graph-sync] worker registered");
}

export async function enqueueGraphSync(
  boss: PgBoss,
  payload: GraphSyncPayload = {},
): Promise<void> {
  try {
    const client = createGraphClient();
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

    await boss.send(GRAPH_SYNC_QUEUE, payload, {
      singletonKey,
      retryLimit: 2,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 600,
    });
  } catch (err) {
    console.error(
      "[graph-sync] enqueue failed (ignored):",
      err instanceof Error ? err.message : err,
    );
  }
}
