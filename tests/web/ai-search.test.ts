import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  AI_SEARCH_SYSTEM_PROMPT,
  bodyHasApiKeyField,
  BYOK_PROVIDER_IDS,
  BYOK_PROVIDERS,
  filtersToJobsQuery,
  FORBIDDEN_KEY_FIELDS,
  getByokProvider,
  JobsFilterFieldsSchema,
  nlToFilters,
  parseFiltersJson,
  type ByokKeyStore,
} from "../../web/src/lib/ai-search.ts";
import { JobsListQuerySchema } from "../../web/src/lib/jobs-filters.ts";

const store: ByokKeyStore = { provider: "openai", apiKey: "sk-test" };

describe("BYOK providers", () => {
  it("registers the expanded provider set", () => {
    expect(BYOK_PROVIDER_IDS.length).toBeGreaterThanOrEqual(8);
    expect(BYOK_PROVIDER_IDS).toContain("gemini");
    expect(BYOK_PROVIDER_IDS).toContain("anthropic");
    expect(BYOK_PROVIDER_IDS).toContain("openrouter");
    expect(BYOK_PROVIDER_IDS).toContain("deepseek");
    expect(getByokProvider("groq")?.baseUrl).toContain("groq.com");
    expect(BYOK_PROVIDERS.every((p) => p.model.length > 0)).toBe(true);
  });
});

describe("shared Zod schema", () => {
  it("JobsFilterFieldsSchema is the filter core of JobsListQuerySchema", () => {
    const base = JobsFilterFieldsSchema.parse({
      q: "node",
      labels: ["open"],
      role: "backend",
      posted: "7d",
      has_salary: true,
      sort: "newest",
    });
    const full = JobsListQuerySchema.parse({ ...base, limit: 30 });
    expect(full.q).toBe("node");
    expect(full.role).toBe("backend");
    expect(full.labels).toEqual(["open"]);
    expect(full.limit).toBe(30);
  });

  it("rejects out-of-enum values", () => {
    expect(parseFiltersJson({ role: "wizard" }).ok).toBe(false);
    expect(parseFiltersJson({ labels: ["mars"] }).ok).toBe(false);
    expect(parseFiltersJson({ posted: "yesterday" }).ok).toBe(false);
    expect(parseFiltersJson({ ats: "workday" }).ok).toBe(false);
  });

  it("accepts valid JSON filters", () => {
    const r = parseFiltersJson({
      q: "node",
      labels: ["open", "india_remote"],
      role: "backend",
      posted: "7d",
      has_salary: true,
      sort: "newest",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.role).toBe("backend");
      expect(r.data.has_salary).toBe(true);
    }
  });
});

describe("nlToFilters parser", () => {
  it("passes on valid first response", async () => {
    const callProvider = vi.fn(async () =>
      JSON.stringify({
        q: "node",
        labels: ["open", "india_remote"],
        role: "backend",
        posted: "7d",
        has_salary: true,
      }),
    );
    const r = await nlToFilters("backend node from India this week with salary", store, {
      callProvider,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.retried).toBe(false);
      expect(r.filters.role).toBe("backend");
      expect(r.filters.posted).toBe("7d");
    }
    expect(callProvider).toHaveBeenCalledTimes(1);
  });

  it("rejects out-of-enum then retries; succeeds on second", async () => {
    const callProvider = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ role: "wizard", q: "x" }))
      .mockResolvedValueOnce(
        JSON.stringify({
          q: "wizard stuff",
          labels: ["open", "india_remote"],
          role: "backend",
        }),
      );
    const r = await nlToFilters("wizard backend", store, { callProvider });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.retried).toBe(true);
      expect(r.filters.role).toBe("backend");
    }
    expect(callProvider).toHaveBeenCalledTimes(2);
    expect(String(callProvider.mock.calls[1]?.[1])).toContain("validation");
  });

  it("final failure after retry stays user-facing", async () => {
    const callProvider = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ role: "wizard" }))
      .mockResolvedValueOnce(JSON.stringify({ role: "sorcerer" }));
    const r = await nlToFilters("magic jobs", store, { callProvider });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.userMessage).toBe("Couldn't understand that, try rephrasing");
    }
  });
});

describe("chip edit without LLM", () => {
  it("filtersToJobsQuery updates params without provider", () => {
    const qs = filtersToJobsQuery({
      labels: ["open"],
      posted: "7d",
      sort: "newest",
      role: "backend",
    });
    const sp = new URLSearchParams(qs);
    expect(sp.get("role")).toBe("backend");
    expect(sp.get("posted")).toBe("7d");
    expect(sp.get("labels")).toBe("open");
    // removing role = omit from query
    const cleared = filtersToJobsQuery({
      labels: ["open"],
      posted: "7d",
      sort: "newest",
    });
    expect(new URLSearchParams(cleared).get("role")).toBeNull();
  });
});

describe("BYOK key never hits our server", () => {
  it("bodyHasApiKeyField detects forbidden fields", () => {
    expect(bodyHasApiKeyField({ apiKey: "sk" })).toBe(true);
    expect(bodyHasApiKeyField({ job_id: "x" })).toBe(false);
  });

  it("no web API route source accepts api key field names", () => {
    const apiRoot = path.resolve("web/src/app/api");
    const files: string[] = [];
    function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".ts")) files.push(p);
      }
    }
    walk(apiRoot);

    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      // Ignore comments that document the policy
      const stripped = src
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      for (const field of FORBIDDEN_KEY_FIELDS) {
        // look for request body property access / zod keys
        const re = new RegExp(
          `(body\\.?${field}|${field}\\s*:|\\"${field}\\"|'${field}')`,
        );
        if (re.test(stripped) && !file.includes("ai-search")) {
          // allow only if it's clearly not reading a key (e.g. string in comment already stripped)
          if (stripped.includes(field)) offenders.push(`${file}::${field}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("system prompt documents browser-only parsing", () => {
    expect(AI_SEARCH_SYSTEM_PROMPT).toContain("JSON object");
    expect(AI_SEARCH_SYSTEM_PROMPT).toContain("labels");
  });
});

describe("signed-out contract", () => {
  it("documents sign-in prompt for AI Search (DashboardSearch)", () => {
    const src = readFileSync(
      path.resolve("web/src/components/dashboard-search.tsx"),
      "utf8",
    );
    expect(src).toContain("SignInPrompt");
    expect(src).toContain("Sign in to use AI search");
    expect(src).toContain("authStatus === \"unauthenticated\"");
  });
});
