import { config } from "../config.js";
import {
  HydraDeleteResultSchema,
  HydraEnvelopeSchema,
  HydraIngestResultSchema,
  HydraQueryDataSchema,
  type HydraAppKnowledgeItem,
  type HydraGraphPayload,
  type HydraQueryData,
} from "./types.js";

const BASE_URL = "https://api.hydradb.com";
const TIMEOUT_MS = 20_000;
const MAX_RETRIES = 3;

export class HydraHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "HydraHttpError";
  }
}

export type HydraClient = {
  enabled: boolean;
  ingestKnowledge: (input: {
    items: HydraAppKnowledgeItem[];
    graphPayload: Record<string, HydraGraphPayload>;
    collection?: string;
  }) => Promise<{ ids: string[]; failed: number }>;
  deleteKnowledge: (ids: string[], collection?: string) => Promise<number>;
  queryKnowledge: (input: {
    query: string;
    maxResults: number;
    labels: string[];
    collection?: string;
  }) => Promise<HydraQueryData>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number): number {
  const base = 400 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 200);
  return base + jitter;
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!isRetryable(res.status) || attempt === MAX_RETRIES) {
        return res;
      }
      const ra = res.headers.get("retry-after");
      const wait = ra ? Number(ra) * 1000 : backoffMs(attempt);
      await sleep(Number.isFinite(wait) && wait > 0 ? wait : backoffMs(attempt));
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_RETRIES) throw err;
      await sleep(backoffMs(attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("hydra_fetch_failed");
}

function authHeaders(apiKey: string, json = false): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "API-Version": "2",
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

async function parseEnvelope(res: Response): Promise<{
  success: boolean;
  data: unknown;
  errorMessage: string | null;
}> {
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new HydraHttpError(
      `HydraDB non-JSON response (${res.status})`,
      res.status,
      text.slice(0, 500),
    );
  }
  const env = HydraEnvelopeSchema.safeParse(json);
  if (!env.success) {
    throw new HydraHttpError(
      `HydraDB envelope validation failed (${res.status})`,
      res.status,
      text.slice(0, 500),
    );
  }
  const errorMessage =
    env.data.error?.message ??
    (res.ok ? null : `HTTP ${res.status}`);
  if (!res.ok) {
    throw new HydraHttpError(
      errorMessage ?? `HydraDB HTTP ${res.status}`,
      res.status,
      text.slice(0, 500),
    );
  }
  return {
    success: env.data.success,
    data: env.data.data ?? null,
    errorMessage,
  };
}

/** No-op client when HYDRADB_ENABLED=false or key missing. */
function disabledClient(): HydraClient {
  return {
    enabled: false,
    async ingestKnowledge() {
      return { ids: [], failed: 0 };
    },
    async deleteKnowledge() {
      return 0;
    },
    async queryKnowledge() {
      return HydraQueryDataSchema.parse({ chunks: [], graph_context: {} });
    },
  };
}

export function createHydraClient(
  overrides?: Partial<{ enabled: boolean; apiKey: string; database: string }>,
): HydraClient {
  const apiKey = overrides?.apiKey ?? config.HYDRADB_API_KEY;
  const enabled =
    overrides?.enabled ?? (config.HYDRADB_ENABLED && Boolean(apiKey));
  const database = overrides?.database ?? config.HYDRADB_DATABASE;

  if (!enabled) return disabledClient();

  return {
    enabled: true,

    async ingestKnowledge({ items, graphPayload, collection = "jobs" }) {
      if (items.length === 0) return { ids: [], failed: 0 };

      const form = new FormData();
      form.append("type", "knowledge");
      form.append("database", database);
      form.append("collection", collection);
      form.append("upsert", "true");
      form.append("app_knowledge", JSON.stringify(items));
      form.append("graph_payload", JSON.stringify(graphPayload));

      const res = await fetchWithRetry(`${BASE_URL}/context/ingest`, {
        method: "POST",
        headers: authHeaders(apiKey, false),
        body: form,
      });
      const { data } = await parseEnvelope(res);
      const parsed = HydraIngestResultSchema.safeParse(data);
      const results = parsed.success ? (parsed.data.results ?? []) : [];
      const ids =
        parsed.success && parsed.data.ids?.length
          ? parsed.data.ids
          : results
              .map((r) => r.id)
              .filter((id): id is string => Boolean(id));
      const failed = results.filter(
        (r) => r.status === "failed" || Boolean(r.error_code),
      ).length;
      return { ids, failed };
    },

    async deleteKnowledge(ids, collection = "jobs") {
      if (ids.length === 0) return 0;
      const res = await fetchWithRetry(`${BASE_URL}/context`, {
        method: "DELETE",
        headers: authHeaders(apiKey, true),
        body: JSON.stringify({
          type: "knowledge",
          database,
          collection,
          ids,
        }),
      });
      const { data } = await parseEnvelope(res);
      const parsed = HydraDeleteResultSchema.safeParse(data);
      if (parsed.success && typeof parsed.data.deleted_count === "number") {
        return parsed.data.deleted_count;
      }
      return ids.length;
    },

    async queryKnowledge({ query, maxResults, labels, collection = "jobs" }) {
      const metadata_filters =
        labels.length === 1
          ? {
              additional_metadata: {
                label: { equals: labels[0] },
              },
            }
          : {
              additional_metadata: {
                label: { contains_any: labels },
              },
            };

      const res = await fetchWithRetry(`${BASE_URL}/query`, {
        method: "POST",
        headers: authHeaders(apiKey, true),
        body: JSON.stringify({
          database,
          collection,
          query,
          type: "knowledge",
          query_by: "hybrid",
          mode: "thinking",
          max_results: maxResults,
          metadata_filters,
          graph_context: true,
        }),
      });
      const { data } = await parseEnvelope(res);
      if (typeof data === "string") {
        return HydraQueryDataSchema.parse({
          chunks: [],
          llm_prompt: data,
        });
      }
      return HydraQueryDataSchema.parse(data ?? {});
    },
  };
}

/** Singleton for app use; re-created when env flips in tests via createHydraClient. */
let defaultClient: HydraClient | null = null;

export function getHydraClient(): HydraClient {
  if (!defaultClient) defaultClient = createHydraClient();
  return defaultClient;
}

/** Test helper. */
export function resetHydraClientCache(): void {
  defaultClient = null;
}
