import { createHash } from "node:crypto";

/** Max HydraDB/JS-safe node id (53-bit positive integer). */
export const GRAPH_ID_MAX = Number.MAX_SAFE_INTEGER; // 2^53 - 1

/**
 * HydraDB node `id` must be a non-negative integer (USING-HYDRADB.md).
 * Hash namespace:key with SHA-256 and keep the top 53 bits as a positive Number.
 * Original uuid/name is stored as `ext_id` / `name` for Postgres rehydration.
 */
export function stableGraphId(namespace: string, key: string): number {
  const h = createHash("sha256").update(`${namespace}:${key}`).digest();
  // 53 bits from the first 7 bytes (56 bits) >> 3
  let n = 0n;
  for (let i = 0; i < 7; i += 1) {
    n = (n << 8n) | BigInt(h[i]!);
  }
  n = n >> 3n; // 56 -> 53
  const asNum = Number(n);
  if (!Number.isSafeInteger(asNum) || asNum < 0) {
    throw new Error(`stableGraphId produced unsafe id for ${namespace}:${key}`);
  }
  return asNum === 0 ? 1 : asNum;
}

/**
 * Detects hash collisions: same numeric id claimed for two different ext keys.
 * Same key reclaiming the same id is fine (idempotent sync).
 */
export class GraphIdRegistry {
  private readonly byId = new Map<number, string>();

  claim(id: number, extKey: string): number {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error(`invalid graph id ${id} for ${extKey}`);
    }
    const prev = this.byId.get(id);
    if (prev != null && prev !== extKey) {
      throw new Error(
        `graph id collision: id=${id} ext_id=${extKey} conflicts with ${prev}`,
      );
    }
    this.byId.set(id, extKey);
    return id;
  }

  size(): number {
    return this.byId.size;
  }
}

export function createGraphIds(registry: GraphIdRegistry = new GraphIdRegistry()) {
  return {
    registry,
    company: (uuid: string) =>
      registry.claim(stableGraphId("company", uuid), `company:${uuid}`),
    job: (uuid: string) =>
      registry.claim(stableGraphId("job", uuid), `job:${uuid}`),
    skill: (name: string) =>
      registry.claim(stableGraphId("skill", name), `skill:${name}`),
    label: (name: string) =>
      registry.claim(stableGraphId("label", name), `label:${name}`),
    evidence: (jobUuid: string, quote: string) =>
      registry.claim(
        stableGraphId("evidence", `${jobUuid}:${quote}`),
        `evidence:${jobUuid}:${quote}`,
      ),
    user: (uuid: string) =>
      registry.claim(stableGraphId("user", uuid), `user:${uuid}`),
    edge: (kind: string, a: string, b: string) =>
      registry.claim(
        stableGraphId(`edge:${kind}`, `${a}->${b}`),
        `edge:${kind}:${a}->${b}`,
      ),
  };
}

/** Default helpers without collision tracking (queries / one-off). */
export const graphIds = createGraphIds();
