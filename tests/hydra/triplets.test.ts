import { describe, expect, it } from "vitest";
import {
  buildAppKnowledgeItem,
  buildJobGraph,
  buildJobText,
  hydraContentHash,
} from "../../src/hydra/triplets.js";
import type { SyncJobRow } from "../../src/hydra/types.js";

const fixture: SyncJobRow = {
  id: "11111111-1111-1111-1111-111111111111",
  title: "Senior Backend Engineer",
  descriptionText: "Build APIs. ".repeat(500),
  locationRaw: "Remote - India",
  applyUrl: "https://jobs.example.com/1",
  contentHash: "abc123",
  postedAt: new Date("2024-06-01T00:00:00Z"),
  firstSeenAt: new Date("2024-06-02T00:00:00Z"),
  closedAt: null,
  hydraSyncedAt: null,
  hydraContentHash: null,
  companyName: "Acme",
  companySlug: "acme",
  companyAts: "ashby",
  label: "india_remote",
  roleFamily: "backend",
  eligibilityEvidence: [
    "Open to candidates in India",
    "Remote within India timezone",
  ],
  hasSalary: true,
};

describe("hydra triplets", () => {
  it("builds content hash from content_hash + label", () => {
    expect(hydraContentHash("abc", "open")).toBe("abc:open");
  });

  it("caps text around 4k chars", () => {
    const text = buildJobText(fixture);
    expect(text.length).toBeLessThanOrEqual(4000);
    expect(text).toContain("Senior Backend Engineer");
    expect(text).toContain("Acme");
    expect(text).toContain('"Open to candidates in India"');
  });

  it("builds BYOG entities and relations from verified fields", () => {
    const graph = buildJobGraph(fixture);
    expect(graph.entities.company?.name).toBe("Acme");
    expect(graph.entities.job?.identifier).toBe(fixture.id);
    expect(graph.entities.label?.name).toBe("india_remote");
    expect(graph.entities.role?.name).toBe("backend");
    expect(graph.entities.ats?.name).toBe("ashby");

    const preds = graph.relations.map((r) => r.predicate);
    expect(preds).toContain("posts");
    expect(preds).toContain("labeled");
    expect(preds).toContain("has_role");
    expect(preds).toContain("uses_ats");
    expect(preds.filter((p) => p === "evidence")).toHaveLength(2);

    const posts = graph.relations.find((r) => r.predicate === "posts");
    expect(posts).toEqual(
      expect.objectContaining({ source: "company", target: "job" }),
    );
  });

  it("builds app_knowledge item with metadata", () => {
    const item = buildAppKnowledgeItem(fixture);
    expect(item.id).toBe(fixture.id);
    expect(item.title).toBe("Senior Backend Engineer @ Acme");
    expect(item.kind).toBe("custom");
    expect(item.additional_metadata.label).toBe("india_remote");
    expect(item.additional_metadata.company_slug).toBe("acme");
    expect(item.additional_metadata.ats).toBe("ashby");
    expect(item.additional_metadata.has_salary).toBe(true);
  });
});
