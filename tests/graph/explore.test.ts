import { describe, expect, it, vi } from "vitest";
import { explore } from "../../src/graph/explore.js";
import { mockGraphClient } from "../../src/graph/driver.js";
import type { Db } from "../../src/db/client.js";

describe("explore", () => {
  it("me without token returns clear error", async () => {
    const client = mockGraphClient(async () => ({ keys: [], records: [] }));
    const result = await explore(
      {} as Db,
      { start: { type: "me" }, path: ["SAVED"] },
      { userId: null, client },
    );
    expect(result.source).toBe("error");
    expect(result.error).toMatch(/personal MCP bearer token/i);
  });

  it("rehydrate drops inactive graph hits", async () => {
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
          n1_label: "open",
          proof_quote: "India ok",
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
        label: "open",
        applyUrl: "https://example.com",
        evidence: ["Remote - India eligible"],
      },
    ];

    const result = await explore(
      chain as unknown as Db,
      {
        start: { type: "skill", value: "postgres" },
        path: ["REQUIRES"],
        max_results: 10,
      },
      { client },
    );
    expect(result.source).toBe("graph");
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]!.id).toBe(activeId);
    expect(result.lines.some((l) => l.includes(inactiveId))).toBe(false);
    expect(result.lines.some((l) => l.includes('proof: "Remote - India eligible"'))).toBe(
      true,
    );
    // Graph proof_quote must not win over job_tags evidence
    expect(result.lines.some((l) => l.includes("India ok"))).toBe(false);
  });

  it("disabled graph returns disabled source", async () => {
    const result = await explore(
      {} as Db,
      { start: { type: "skill", value: "rust" }, path: ["REQUIRES"] },
      { client: mockGraphClient(vi.fn(), false) },
    );
    expect(result.source).toBe("disabled");
  });
});
