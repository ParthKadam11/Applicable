import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { savedJobs } from "../db/schema.js";
import {
  deleteOutgoingEdgesFromNode,
  deleteTypedEdgesBetween,
  mergeSavedEdges,
  upsertNodesByLabel,
} from "./cypher.js";
import { createGraphClient, type GraphClient } from "./driver.js";
import { graphIds } from "./ids.js";

function q(query: { cypher: string; params: Record<string, unknown> }): [
  string,
  Record<string, unknown>,
] {
  return [query.cypher, query.params];
}

/** Upsert User node (id only — never email/name) and replace SAVED→Job edges. */
export async function syncUserSavedEdges(
  db: Db,
  userId: string,
  client: GraphClient = createGraphClient(),
): Promise<{ synced: number }> {
  if (!client.enabled) return { synced: 0 };
  const rows = await db
    .select({ jobId: savedJobs.jobId })
    .from(savedJobs)
    .where(eq(savedJobs.userId, userId));

  const uid = graphIds.user(userId);
  await client.run(...q(upsertNodesByLabel("User", [{ id: uid }])));
  await client.run(...q(deleteOutgoingEdgesFromNode("SAVED", uid)));

  const edges = rows.map((r) => ({
    src: uid,
    dst: graphIds.job(r.jobId),
  }));
  for (let i = 0; i < edges.length; i += 50) {
    await client.run(...q(mergeSavedEdges(edges.slice(i, i + 50))));
  }
  return { synced: edges.length };
}

export async function addSavedEdge(
  userId: string,
  jobId: string,
  client: GraphClient = createGraphClient(),
): Promise<void> {
  if (!client.enabled) return;
  const uid = graphIds.user(userId);
  const jid = graphIds.job(jobId);
  await client.run(...q(upsertNodesByLabel("User", [{ id: uid }])));
  await client.run(...q(mergeSavedEdges([{ src: uid, dst: jid }])));
}

export async function removeSavedEdge(
  userId: string,
  jobId: string,
  client: GraphClient = createGraphClient(),
): Promise<void> {
  if (!client.enabled) return;
  const uid = graphIds.user(userId);
  const jid = graphIds.job(jobId);
  await client.run(
    ...q(deleteTypedEdgesBetween("SAVED", [{ src: uid, dst: jid }])),
  );
}

/** Drop all SAVED edges + User vertex on account delete. */
export async function removeUserFromGraph(
  userId: string,
  client: GraphClient = createGraphClient(),
): Promise<void> {
  if (!client.enabled) return;
  const uid = graphIds.user(userId);
  try {
    await client.run(...q(deleteOutgoingEdgesFromNode("SAVED", uid)));
    await client.run(`MATCH (u:User {id: $id}) DETACH DELETE u`, { id: uid });
  } catch (err) {
    console.error(
      "[graph:saved] removeUserFromGraph:",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Fire-and-forget — never throw into save/unsave/delete paths. */
export function scheduleGraphSaved(fn: () => Promise<unknown>): void {
  void fn().catch((err) => {
    console.error("[graph:saved]", err instanceof Error ? err.message : err);
  });
}
