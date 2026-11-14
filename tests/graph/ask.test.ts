import { describe, expect, it, vi } from "vitest";
import { AskJobsInputSchema } from "../../src/mcp/schemas.js";
import { askJobs } from "../../src/graph/ask.js";
import { mockGraphClient } from "../../src/graph/driver.js";
import {
  companyJobsBySkillQuery,
  matchSkillsQueryV2,
  similarCompaniesQuery,
} from "../../src/graph/cypher.js";
import type { Db } from "../../src/db/client.js";

describe("ask_jobs templates + fallback", () => {
  it("validates discriminated ops", () => {
    expect(() => AskJobsInputSchema.parse({ op: "match_skills" })).toThrow();
    const ok = AskJobsInputSchema.parse({
      op: "match_skills",
      skills: ["postgres", "rust"],
    });
    expect(ok.op).toBe("match_skills");
    if (ok.op === "match_skills") {
      expect(ok.labels).toEqual(["open", "india_remote"]);
    }
  });

  it("builders cover all three templates", () => {
    expect(matchSkillsQueryV2({ skills: ["a"], labels: ["open"] }).cypher).toContain(
      "REQUIRES",
    );
    expect(similarCompaniesQuery({ companySlug: "acme" }).cypher).toContain(
      "SIMILAR_TO",
    );
    expect(
      companyJobsBySkillQuery({ skill: "rust", labels: ["open"] }).cypher,
    ).toContain("REQUIRES");
  });

  it("rehydrates and drops inactive graph hits (via explore alias)", async () => {
    const activeId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const inactiveId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const client = mockGraphClient(async () => ({
      keys: ["n0_name", "n1_ext", "n1_title", "n1_label", "proof_quote"],
      records: [
        {
          n0_name: "postgres",
          n1_ext: inactiveId,
          n1_title: "Gone",
          n1_label: "open",
          proof_quote: null,
        },
        {
          n0_name: "postgres",
          n1_ext: activeId,
          n1_title: "Backend",
          n1_label: "india_remote",
          proof_quote: null,
        },
      ],
    }));

    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.from = self;
    chain.innerJoin = self;
    chain.where = async () => [
      {
        id: activeId,
        title: "Backend",
        company: "Acme",
        label: "india_remote",
        applyUrl: "https://example.com",
      },
    ];

    const result = await askJobs(
      chain as unknown as Db,
      { op: "match_skills", skills: ["postgres"] },
      client,
    );
    expect(result.source).toBe("graph");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]!.id).toBe(activeId);
    expect(result.jobs[0]!.matched_skills).toContain("postgres");
  });

  function emptySearchDb(): Db {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self;
    chain.from = self;
    chain.innerJoin = self;
    chain.where = self;
    chain.limit = async () => [];
    return chain as unknown as Db;
  }

  it("falls back when graph disabled", async () => {
    const result = await askJobs(
      emptySearchDb(),
      { op: "match_skills", skills: ["rust"] },
      mockGraphClient(vi.fn(), false),
    );
    expect(result.source).toBe("search_jobs_fallback");
    expect(result.fallback_reason).toBe("graph_disabled");
  });

  it("falls back when graph errors", async () => {
    const result = await askJobs(
      emptySearchDb(),
      { op: "similar_companies", company_slug: "acme" },
      mockGraphClient(async () => {
        throw new Error("bolt_down");
      }, true),
    );
    expect(result.source).toBe("search_jobs_fallback");
    expect(result.fallback_reason).toMatch(/bolt_down/);
  });
});
