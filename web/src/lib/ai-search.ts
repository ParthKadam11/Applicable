/**
 * BYOK AI search — keys live ONLY in browser localStorage.
 * They are never sent to Applicable/CaniApply API routes, never logged,
 * and never placed in URLs. Provider calls go directly from the browser
 * to the chosen provider (Gemini, Anthropic, OpenAI-compatible hosts, etc.).
 */
import {
  JobsFilterFieldsSchema,
  type JobsFilterFields,
} from "@/lib/jobs-filters";

export {
  JobsFilterFieldsSchema,
  type JobsFilterFields,
} from "@/lib/jobs-filters";

/** @deprecated Alias — use JobsFilterFieldsSchema (shared with /api/jobs). */
export const AiSearchFilterSchema = JobsFilterFieldsSchema;
export type AiSearchFilter = JobsFilterFields;

export type ByokProvider =
  | "gemini"
  | "anthropic"
  | "openai"
  | "groq"
  | "openrouter"
  | "deepseek"
  | "mistral"
  | "together"
  | "fireworks"
  | "xai"
  | "perplexity";

type ProviderKind = "gemini" | "anthropic" | "openai_compatible";

type ByokProviderConfig = {
  id: ByokProvider;
  label: string;
  hint?: string;
  kind: ProviderKind;
  /** OpenAI-compatible base URL (…/v1) */
  baseUrl?: string;
  model: string;
};

export const BYOK_PROVIDERS: readonly ByokProviderConfig[] = [
  {
    id: "gemini",
    label: "Gemini",
    hint: "Google AI Studio",
    kind: "gemini",
    model: "gemini-2.0-flash",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    hint: "Claude",
    kind: "anthropic",
    model: "claude-3-5-haiku-latest",
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai_compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    hint: "Many models, one key",
    kind: "openai_compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai_compatible",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "openai_compatible",
    baseUrl: "https://api.mistral.ai/v1",
    model: "mistral-small-latest",
  },
  {
    id: "together",
    label: "Together",
    kind: "openai_compatible",
    baseUrl: "https://api.together.xyz/v1",
    model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
  },
  {
    id: "fireworks",
    label: "Fireworks",
    kind: "openai_compatible",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
  },
  {
    id: "xai",
    label: "xAI",
    hint: "Grok",
    kind: "openai_compatible",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-2-latest",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    kind: "openai_compatible",
    baseUrl: "https://api.perplexity.ai",
    model: "sonar",
  },
] as const;

export const BYOK_PROVIDER_IDS = BYOK_PROVIDERS.map((p) => p.id);

export const BYOK_PROVIDER_OPTIONS = BYOK_PROVIDERS.map((p) => ({
  value: p.id,
  label: p.label,
  hint: p.hint,
}));

export function getByokProvider(id: string): ByokProviderConfig | undefined {
  return BYOK_PROVIDERS.find((p) => p.id === id);
}

export type ByokKeyStore = {
  provider: ByokProvider;
  apiKey: string;
};

export type RecentSearch = {
  nl: string;
  filters: JobsFilterFields;
  at: number;
};

const STORAGE_KEY = "applicable.byok.ai-search";
const RECENT_KEY = "applicable.byok.ai-search.recent";
const PROVIDER_TIMEOUT_MS = 20_000;

export const AI_SEARCH_SYSTEM_PROMPT = `You convert a natural-language job search into JSON filters for Applicable (India-eligibility job board).
Return ONLY a single JSON object. No markdown, no commentary, no code fences.

Allowed keys (all optional except use defaults when unclear):
- q (string): free-text for title/company/skill keywords. Put anything that is not an enum value here.
- labels (array): subset of open | india_remote | india_onsite | region_locked | unclear. Default ["open","india_remote"] when the user wants India-friendly remote/open roles.
- role (string): exactly one of backend | frontend | fullstack | devops | data | mobile | other
- ats (string): exactly one of ashby | greenhouse | lever
- posted (string): exactly one of 24h | 7d | 30d | all. Map "this week"→7d, "today/last day"→24h, "this month"→30d.
- has_salary (boolean): true if they want salary listed; false only if they explicitly want no salary; omit otherwise.
- sort (string): newest | last_seen | company. Default newest.

Rules:
- NEVER invent enum values. If unsure, put the phrase into q and omit that field.
- Prefer labels ["open","india_remote"] for "from India" / "India remote" / "can apply from India".
- Do not include cursor, limit, or any other keys.`;

export function loadByokKey(): ByokKeyStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ByokKeyStore;
    if (
      !parsed?.apiKey ||
      !BYOK_PROVIDER_IDS.includes(parsed.provider as ByokProvider)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveByokKey(store: ByokKeyStore): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function clearByokKey(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function loadRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentSearch[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 10);
  } catch {
    return [];
  }
}

export function pushRecentSearch(nl: string, filters: JobsFilterFields): void {
  const next: RecentSearch[] = [
    { nl, filters, at: Date.now() },
    ...loadRecentSearches().filter((r) => r.nl !== nl),
  ].slice(0, 10);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function clearRecentSearches(): void {
  window.localStorage.removeItem(RECENT_KEY);
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const body = fence?.[1]?.trim() ?? trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no_json");
  return JSON.parse(body.slice(start, end + 1));
}

export type ProviderCallError = {
  kind: "invalid_key" | "quota" | "network" | "timeout" | "empty" | "http";
  status?: number;
  message: string;
};

export function mapProviderHttpError(status: number): ProviderCallError {
  if (status === 401 || status === 403) {
    return {
      kind: "invalid_key",
      status,
      message: "API key rejected. Check the key in Change key, then try again.",
    };
  }
  if (status === 429) {
    return {
      kind: "quota",
      status,
      message: "Provider quota / rate limit hit. Wait or switch provider.",
    };
  }
  return {
    kind: "http",
    status,
    message: `Provider error (HTTP ${status}). Try again or change key.`,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms = PROVIDER_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      const e: ProviderCallError = {
        kind: "timeout",
        message: "Provider timed out (20s). Try a shorter query or another provider.",
      };
      throw e;
    }
    const e: ProviderCallError = {
      kind: "network",
      message: "Network error reaching the provider. Check your connection.",
    };
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function callGemini(
  apiKey: string,
  userContent: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${AI_SEARCH_SYSTEM_PROMPT}\n\nUser: ${userContent}` }],
        },
      ],
      generationConfig: { temperature: 0.1 },
    }),
  });
  if (!res.ok) throw mapProviderHttpError(res.status);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw {
      kind: "empty",
      message: "Provider returned an empty response.",
    } satisfies ProviderCallError;
  }
  return text;
}

async function callAnthropic(
  apiKey: string,
  model: string,
  userContent: string,
): Promise<string> {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // Required for browser calls when Anthropic allows the origin
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0.1,
      system: AI_SEARCH_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) throw mapProviderHttpError(res.status);
  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text;
  if (!text) {
    throw {
      kind: "empty",
      message: "Provider returned an empty response.",
    } satisfies ProviderCallError;
  }
  return text;
}

async function callOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  userContent: string,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: AI_SEARCH_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (!res.ok) throw mapProviderHttpError(res.status);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw {
      kind: "empty",
      message: "Provider returned an empty response.",
    } satisfies ProviderCallError;
  }
  return text;
}

function openRouterHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return {
    "HTTP-Referer": window.location.origin,
    "X-Title": "Applicable AI Search",
  };
}

async function callProvider(
  store: ByokKeyStore,
  userContent: string,
): Promise<string> {
  const cfg = getByokProvider(store.provider);
  if (!cfg) {
    throw {
      kind: "http",
      message: "Unknown provider. Pick another in Change key.",
    } satisfies ProviderCallError;
  }
  if (cfg.kind === "gemini") {
    return callGemini(store.apiKey, userContent);
  }
  if (cfg.kind === "anthropic") {
    return callAnthropic(store.apiKey, cfg.model, userContent);
  }
  return callOpenAiCompatible(
    cfg.baseUrl!,
    store.apiKey,
    cfg.model,
    userContent,
    cfg.id === "openrouter" ? openRouterHeaders() : undefined,
  );
}

export function parseFiltersJson(raw: unknown): {
  ok: true;
  data: JobsFilterFields;
} | { ok: false; message: string } {
  const parsed = JobsFilterFieldsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  return { ok: true, data: parsed.data };
}

export type NlParseResult =
  | { ok: true; filters: JobsFilterFields; retried: boolean }
  | {
      ok: false;
      error: ProviderCallError | { kind: "parse"; message: string };
      userMessage: string;
    };

/**
 * NL → JobsFilterFields via the user's BYOK provider (browser → provider only).
 * Validates with JobsFilterFieldsSchema; retries once with the Zod error appended.
 */
export async function nlToFilters(
  prompt: string,
  store: ByokKeyStore,
  deps?: {
    callProvider?: (store: ByokKeyStore, userContent: string) => Promise<string>;
  },
): Promise<NlParseResult> {
  const call = deps?.callProvider ?? callProvider;
  const failParse = (message: string): NlParseResult => ({
    ok: false,
    error: { kind: "parse", message },
    userMessage: "Couldn't understand that, try rephrasing",
  });

  try {
    const text1 = await call(store, prompt);
    let raw: unknown;
    try {
      raw = extractJsonObject(text1);
    } catch {
      const text2 = await call(
        store,
        `${prompt}\n\nPrevious reply was not valid JSON. Return ONLY a JSON object matching the schema.`,
      );
      try {
        raw = extractJsonObject(text2);
      } catch {
        return failParse("no_json");
      }
      const second = parseFiltersJson(raw);
      if (!second.ok) return failParse(second.message);
      return { ok: true, filters: second.data, retried: true };
    }

    const first = parseFiltersJson(raw);
    if (first.ok) {
      return { ok: true, filters: first.data, retried: false };
    }

    const text2 = await call(
      store,
      `${prompt}\n\nYour previous JSON failed validation: ${first.message}. Fix it and return ONLY corrected JSON.`,
    );
    let raw2: unknown;
    try {
      raw2 = extractJsonObject(text2);
    } catch {
      return failParse("no_json_retry");
    }
    const second = parseFiltersJson(raw2);
    if (!second.ok) return failParse(second.message);
    return { ok: true, filters: second.data, retried: true };
  } catch (err) {
    const pe = err as ProviderCallError;
    if (pe?.kind && pe?.message) {
      return { ok: false, error: pe, userMessage: pe.message };
    }
    return {
      ok: false,
      error: {
        kind: "network",
        message: "Network error reaching the provider. Check your connection.",
      },
      userMessage: "Network error reaching the provider. Check your connection.",
    };
  }
}

/** Tiny client-side provider ping to validate the key (never hits our server). */
export async function testByokKey(
  store: ByokKeyStore,
): Promise<{ ok: true } | { ok: false; error: ProviderCallError }> {
  try {
    await callProvider(store, "Reply with the single word ok");
    return { ok: true };
  } catch (err) {
    const pe = err as ProviderCallError;
    if (pe?.kind && pe?.message) return { ok: false, error: pe };
    return {
      ok: false,
      error: {
        kind: "network",
        message: "Network error reaching the provider. Check your connection.",
      },
    };
  }
}

/** Build query string for GET /api/jobs and /dashboard/jobs (no nl). */
export function filtersToJobsQuery(
  f: JobsFilterFields,
  extra?: { nl?: string; job?: string | null },
): string {
  const sp = new URLSearchParams();
  if (f.q) sp.set("q", f.q);
  if (f.labels?.length) sp.set("labels", f.labels.join(","));
  if (f.role) sp.set("role", f.role);
  if (f.ats) sp.set("ats", f.ats);
  if (f.posted && f.posted !== "all") sp.set("posted", f.posted);
  if (f.has_salary === true) sp.set("has_salary", "true");
  if (f.has_salary === false) sp.set("has_salary", "false");
  if (f.sort && f.sort !== "newest") sp.set("sort", f.sort);
  if (extra?.nl) sp.set("nl", extra.nl);
  if (extra?.job) sp.set("job", extra.job);
  return sp.toString();
}

export function filtersFromSearchParams(
  sp: URLSearchParams,
  preferences?: {
    defaultLabels: JobsFilterFields["labels"];
    defaultRoles: NonNullable<JobsFilterFields["roles"]> | [];
    hideNoSalary: boolean;
  } | null,
): JobsFilterFields {
  const hasLabels = Boolean(sp.get("labels"));
  const hasRole = Boolean(sp.get("role"));
  const hasSalaryParam =
    sp.get("has_salary") != null && sp.get("has_salary") !== "";

  const labelsRaw = sp.get("labels");
  const labels = hasLabels
    ? labelsRaw!
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : preferences?.defaultLabels;

  let has_salary: boolean | undefined;
  const hs = sp.get("has_salary");
  if (hasSalaryParam) {
    if (hs === "true" || hs === "1") has_salary = true;
    else if (hs === "false" || hs === "0") has_salary = false;
  } else if (preferences?.hideNoSalary) {
    has_salary = true;
  }

  let role: string | undefined = hasRole
    ? (sp.get("role") || undefined)
    : undefined;
  let roles: string[] | undefined;
  if (!hasRole && preferences?.defaultRoles?.length) {
    if (preferences.defaultRoles.length === 1) {
      role = preferences.defaultRoles[0];
    } else {
      roles = [...preferences.defaultRoles];
    }
  }

  const parsed = JobsFilterFieldsSchema.safeParse({
    q: sp.get("q") || undefined,
    labels,
    role,
    roles,
    ats: sp.get("ats") || undefined,
    posted: sp.get("posted") || undefined,
    has_salary,
    sort: sp.get("sort") || undefined,
  });
  if (parsed.success) return parsed.data;
  return JobsFilterFieldsSchema.parse({});
}

/** Assert helper for tests: our API route bodies must never accept apiKey. */
export const FORBIDDEN_KEY_FIELDS = [
  "apiKey",
  "api_key",
  "openai_key",
  "gemini_key",
  "groq_key",
  "anthropic_key",
  "openrouter_key",
] as const;

export function bodyHasApiKeyField(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  return FORBIDDEN_KEY_FIELDS.some((k) => k in o && o[k] != null && o[k] !== "");
}
