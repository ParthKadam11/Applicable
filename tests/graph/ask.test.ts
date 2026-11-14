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

  it("rehydrates and drops inactive graph hits", async () => {
    const activeId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const inactiveId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const client = mockGraphClient(async () => ({
      keys: ["jobId", "skillName", "evidenceQuote"],
      records: [
        { jobId: inactiveId, skillName: "rust", evidenceQuote: null },
        { jobId: activeId, skillName: "postgres", evidenceQuote: null },
        { jobId: activeId, skillName: "postgres", evidenceQuote: "dup" },
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
        location: null,
        eligibility: "india_remote",
        evidence: ["India ok"],
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
