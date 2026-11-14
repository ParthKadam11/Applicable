/**
 * Thin HydraDB HTTP helper for SAVED edges (web app).
 * Mirrors src/graph/saved.ts — never stores email/name. Behind HYDRA_GRAPH_ENABLED.
 */
import { createHash } from "node:crypto";

function enabled(): boolean {
  return (
    process.env.HYDRA_GRAPH_ENABLED === "true" ||
    process.env.HYDRA_GRAPH_ENABLED === "1"
  );
}

function httpBase(): string {
  return process.env.HYDRA_HTTP_URL ?? "http://127.0.0.1:8443";
}

function token(): string {
  return process.env.HYDRA_TOKEN ?? "";
}

function graphId(): string {
  return process.env.HYDRA_GRAPH_ID ?? "default";
}

function stableGraphId(namespace: string, key: string): number {
  const h = createHash("sha256").update(`${namespace}:${key}`).digest();
  // Avoid bigint literals — web tsconfig targets ES2017.
  let n = BigInt(0);
  for (let i = 0; i < 7; i += 1) {
    n = (n << BigInt(8)) | BigInt(h[i]!);
  }
  n = n >> BigInt(3);
  const asNum = Number(n);
  return asNum === 0 ? 1 : asNum;
}

async function run(cypher: string, parameters: Record<string, unknown> = {}) {
  if (!enabled() || !token()) return;
  const res = await fetch(`${httpBase()}/v1/graphs/${graphId()}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "X-Graph-Namespace": "default",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cell_id: "cell-0", query: cypher, parameters }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HydraDB ${res.status}: ${text.slice(0, 200)}`);
  }
}

export async function addSavedEdge(userId: string, jobId: string) {
  const uid = stableGraphId("user", userId);
  const jid = stableGraphId("job", jobId);
  await run(`UNWIND $rows AS row MERGE (n {id: row.id}) SET n:User`, {
    rows: [{ id: uid }],
  });
  await run(
    `UNWIND $rows AS row MATCH (a:User {id: row.src}), (b:Job {id: row.dst}) CREATE (a)-[:SAVED]->(b)`,
    { rows: [{ src: uid, dst: jid }] },
  );
}

export async function removeSavedEdge(userId: string, jobId: string) {
  const uid = stableGraphId("user", userId);
  const jid = stableGraphId("job", jobId);
  await run(
    `UNWIND $rows AS row MATCH (a {id: row.src})-[r:SAVED]->(b {id: row.dst}) DELETE r`,
    { rows: [{ src: uid, dst: jid }] },
  );
}

export async function removeUserFromGraph(userId: string) {
  const uid = stableGraphId("user", userId);
  await run(`MATCH (n {id: $id})-[r:SAVED]->() DELETE r`, { id: uid });
  await run(`MATCH (u:User {id: $id}) DETACH DELETE u`, { id: uid });
}

export function scheduleGraphSaved(fn: () => Promise<unknown>) {
  void fn().catch((err) => {
    console.error("[graph:saved:web]", err instanceof Error ? err.message : err);
  });
}
