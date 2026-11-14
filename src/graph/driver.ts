import neo4j, { type Driver, type Session } from "neo4j-driver";
import { config } from "../config.js";

export type GraphRunResult = {
  keys: string[];
  records: Array<Record<string, unknown>>;
};

export type GraphClient = {
  enabled: boolean;
  run: (
    cypher: string,
    params?: Record<string, unknown>,
  ) => Promise<GraphRunResult>;
  close: () => Promise<void>;
};

let sharedDriver: Driver | null = null;

function disabledClient(): GraphClient {
  return {
    enabled: false,
    async run() {
      return { keys: [], records: [] };
    },
    async close() {},
  };
}

/** Decode HydraDB HTTP typed cells → plain JS. */
function unwrapHttpCell(cell: unknown): unknown {
  if (cell == null || typeof cell !== "object") return cell;
  const c = cell as { type?: string; value?: unknown };
  if (c.type === "null" || !("type" in c)) return null;
  if (c.type === "list" && Array.isArray(c.value)) {
    return c.value.map(unwrapHttpCell);
  }
  return c.value ?? null;
}

function httpBaseUrl(): string {
  // Prefer loopback HTTP (8443). Admin is on 19090 host-mapped.
  return process.env.HYDRA_HTTP_URL ?? "http://127.0.0.1:8443";
}

/**
 * Prefer HTTP JSON API: Bolt packing of 53-bit ids / aggregate decode is flaky
 * with neo4j-driver against HydraDB ("offset out of range").
 */
async function runHttp(
  graphId: string,
  token: string,
  cypher: string,
  params: Record<string, unknown>,
): Promise<GraphRunResult> {
  const res = await fetch(`${httpBaseUrl()}/v1/graphs/${graphId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Graph-Namespace": "default",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cell_id: "cell-0",
      query: cypher,
      parameters: params,
    }),
  });
  const text = await res.text();
  let json: {
    columns?: string[];
    rows?: unknown[][];
    error?: { message?: string };
  };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(`HydraDB HTTP non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.error) {
    throw new Error(
      json.error?.message ?? `HydraDB HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  const keys = json.columns ?? [];
  const records = (json.rows ?? []).map((row) => {
    const out: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      out[k] = unwrapHttpCell(row[i]);
    });
    return out;
  });
  return { keys, records };
}

function unwrapNeo4jValue(v: unknown): unknown {
  if (v == null) return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    try {
      return (v as { toNumber: () => number }).toNumber();
    } catch {
      return Number((v as { toString: () => string }).toString());
    }
  }
  if (Array.isArray(v)) return v.map(unwrapNeo4jValue);
  return v;
}

function packParams(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return neo4j.int(value);
  }
  if (Array.isArray(value)) return value.map(packParams);
  if (typeof value === "object") {
    if (
      "toNumber" in (value as object) ||
      "toStandardDate" in (value as object)
    ) {
      return value;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = packParams(v);
    }
    return out;
  }
  return value;
}

export function createGraphClient(
  overrides?: Partial<{
    enabled: boolean;
    boltUrl: string;
    token: string;
    graphId: string;
    /** Force Bolt even though HTTP is default for reliability. */
    transport?: "http" | "bolt";
  }>,
): GraphClient {
  const enabled =
    overrides?.enabled ??
    (config.HYDRA_GRAPH_ENABLED && Boolean(config.HYDRA_TOKEN));
  if (!enabled) return disabledClient();

  const boltUrl = overrides?.boltUrl ?? config.HYDRA_BOLT_URL;
  const token = overrides?.token ?? config.HYDRA_TOKEN;
  const graphId = overrides?.graphId ?? config.HYDRA_GRAPH_ID;
  const transport = overrides?.transport ?? "http";

  if (transport === "bolt" && !sharedDriver) {
    sharedDriver = neo4j.driver(boltUrl, neo4j.auth.basic("neo4j", token), {
      encrypted: "ENCRYPTION_OFF",
    });
  }

  return {
    enabled: true,
    async run(cypher, params = {}) {
      if (transport === "http") {
        return runHttp(graphId, token, cypher, params);
      }
      let session: Session | null = null;
      try {
        session = sharedDriver!.session({ database: graphId });
        const result = await session.run(
          cypher,
          packParams(params) as Record<string, unknown>,
        );
        const keys = result.records[0]?.keys.map(String) ?? [];
        const records = result.records.map((rec) => {
          const row: Record<string, unknown> = {};
          for (const key of rec.keys) {
            row[String(key)] = unwrapNeo4jValue(rec.get(key));
          }
          return row;
        });
        return { keys, records };
      } finally {
        await session?.close();
      }
    },
    async close() {},
  };
}

export async function closeSharedGraphDriver(): Promise<void> {
  if (sharedDriver) {
    await sharedDriver.close();
    sharedDriver = null;
  }
}

export function mockGraphClient(
  runFn: GraphClient["run"],
  enabled = true,
): GraphClient {
  return {
    enabled,
    run: runFn,
    async close() {},
  };
}
