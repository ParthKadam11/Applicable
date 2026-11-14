import { describe, expect, it, vi } from "vitest";
import { AskJobsInputSchema } from "../../src/mcp/schemas.js";
import { askJobs } from "../../src/hydra/ask.js";
import type { HydraClient } from "../../src/hydra/client.js";
import type { Db } from "../../src/db/client.js";

const activeJobId = "22222222-2222-2222-2222-222222222222";
const inactiveJobId = "33333333-3333-3333-3333-333333333333";

function mockDb(rows: Array<Record<string, unknown>>): Db {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.from = vi.fn(self);
  chain.innerJoin = vi.fn(self);
  chain.where = vi.fn(async () => rows);
  return chain as unknown as Db;
}

describe("ask_jobs", () => {
  it("validates input (max 500, max_results <= 25)", () => {
    expect(() =>
      AskJobsInputSchema.parse({ question: "x".repeat(501) }),
    ).toThrow();
    expect(() =>
      AskJobsInputSchema.parse({ question: "ok", max_results: 26 }),
    ).toThrow();
    const ok = AskJobsInputSchema.parse({ question: "remote backend" });
    expect(ok.labels).toEqual(["open", "india_remote"]);
    expect(ok.max_results).toBe(10);
  });

  it("rehydrates from Postgres and drops inactive Hydra hits", async () => {
    const client: HydraClient = {
      enabled: true,
      ingestKnowledge: vi.fn(),
      deleteKnowledge: vi.fn(),
      queryKnowledge: vi.fn(async () => ({
        chunks: [
          { id: inactiveJobId, chunk_content: "gone" },
          { id: activeJobId, chunk_content: "Backend at Acme" },
        ],
        graph_context: {
          query_paths: [
            {
              triplets: [
                {
                  source: { name: "Acme" },
                  relation: { canonical_predicate: "posts" },
                  target: { name: "Backend" },
                },
              ],
            },
          ],
          chunk_relations: [],
        },
      })),
    };

    const db = mockDb([
      {
        id: activeJobId,
        title: "Backend",
        company: "Acme",
        location: "India",
        eligibility: "india_remote",
        evidence: ["Open to India"],
        applyUrl: "https://example.com",
        postedAt: new Date("2024-01-01"),
      },
    ]);

    const result = await askJobs(
      db,
      { question: "backend remote India", labels: ["india_remote"], max_results: 10 },
      client,
    );

    expect(result.source).toBe("hydradb");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]!.id).toBe(activeJobId);
    expect(result.jobs[0]!.evidence).toEqual(["Open to India"]);
    expect(result.graph_paths).toContain("Acme -posts-> Backend");
    expect(client.queryKnowledge).toHaveBeenCalled();
  });

  it("falls back to search_jobs when Hydra errors", async () => {
    const client: HydraClient = {
      enabled: true,
      ingestKnowledge: vi.fn(),
      deleteKnowledge: vi.fn(),
      queryKnowledge: vi.fn(async () => {
        throw new Error("hydra_down");
      }),
    };

    const searchMod = await import("../../src/mcp/tools.js");
    const spy = vi.spyOn(searchMod, "searchJobs").mockResolvedValue({
      results: [
        {
          id: activeJobId,
          title: "Backend",
          company: "Acme",
          company_website: null,
          location: null,
          eligibility: "open",
          evidence: [],
          apply_url: "https://example.com",
          posted_at: null,
          last_seen_at: null,
        },
      ],
      next_cursor: null,
      count: 1,
    });

    const result = await askJobs(
      {} as Db,
      { question: "backend" },
      client,
    );

    expect(result.source).toBe("search_jobs_fallback");
    expect(result.fallback_reason).toMatch(/hydra_down/);
    expect(result.count).toBe(1);
    spy.mockRestore();
  });

  it("falls back when Hydra disabled", async () => {
    const searchMod = await import("../../src/mcp/tools.js");
    const spy = vi.spyOn(searchMod, "searchJobs").mockResolvedValue({
      results: [],
      next_cursor: null,
      count: 0,
    });

    const result = await askJobs(
      {} as Db,
      { question: "sre" },
      {
        enabled: false,
        ingestKnowledge: vi.fn(),
        deleteKnowledge: vi.fn(),
        queryKnowledge: vi.fn(),
      },
    );

    expect(result.source).toBe("search_jobs_fallback");
    expect(result.fallback_reason).toBe("hydradb_disabled");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
