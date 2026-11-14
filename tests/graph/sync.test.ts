import { describe, expect, it, vi } from "vitest";
import { graphContentHash } from "../../src/graph/sync.js";
import { runGraphSync } from "../../src/graph/sync.js";
import { mockGraphClient } from "../../src/graph/driver.js";
import type { Db } from "../../src/db/client.js";

describe("graph sync helpers", () => {
  it("content hash includes skills", () => {
    expect(graphContentHash("abc", "open", ["postgres", "rust"])).toBe(
      "abc:open:postgres,rust",
    );
  });

  it("disabled client is no-op without throwing", async () => {
    const runs: unknown[] = [];
    const db = {
      insert: () => ({
        values: () => ({
          returning: async () => {
            const id = "run-1";
            runs.push(id);
            return [{ id }];
          },
        }),
      }),
      update: () => ({
        set: () => ({
          where: async () => undefined,
        }),
      }),
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: async () => [],
            }),
          }),
        }),
      }),
    } as unknown as Db;

    const client = mockGraphClient(vi.fn(), false);
    const result = await runGraphSync(db, { full: true }, client);
    expect(result.error).toBe("graph_disabled");
    expect(client.run).not.toHaveBeenCalled();
  });

  it("records failure without throwing when driver errors", async () => {
    const job = {
      id: "11111111-1111-1111-1111-111111111111",
      title: "Backend",
      descriptionText: "Python and PostgreSQL",
      applyUrl: "https://example.com",
      contentHash: "h1",
      postedAt: null,
      firstSeenAt: new Date(),
      closedAt: null,
      hydraSyncedAt: null,
      hydraContentHash: null,
      companyId: "22222222-2222-2222-2222-222222222222",
      companyName: "Acme",
      companySlug: "acme",
      companyAts: "ashby",
      label: "open",
      roleFamily: "backend",
      eligibilityEvidence: ["Open worldwide"],
    };

    let finished: Record<string, unknown> | null = null;
    const db = {
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: "run-err" }],
        }),
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            if ("error" in v || "nodesAdded" in v) finished = v;
          },
        }),
      }),
      select: () => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.from = self;
        chain.innerJoin = self;
        chain.where = async () => [job];
        return chain;
      },
    } as unknown as Db;

    const client = mockGraphClient(async () => {
      throw new Error("bolt_down");
    }, true);

    const result = await runGraphSync(db, { full: true }, client);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.error).toMatch(/bolt_down/);
    expect(finished?.error).toMatch(/bolt_down/);
  });
});
