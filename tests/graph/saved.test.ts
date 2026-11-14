import { describe, expect, it, vi } from "vitest";
import {
  addSavedEdge,
  removeSavedEdge,
  removeUserFromGraph,
} from "../../src/graph/saved.js";
import { mockGraphClient } from "../../src/graph/driver.js";
import { graphIds } from "../../src/graph/ids.js";

describe("SAVED graph sync", () => {
  it("addSavedEdge upserts User and CREATE SAVED", async () => {
    const calls: Array<{ cypher: string; params: Record<string, unknown> }> = [];
    const client = mockGraphClient(async (cypher, params = {}) => {
      calls.push({ cypher, params });
      return { keys: [], records: [] };
    });
    await addSavedEdge(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      client,
    );
    expect(calls.some((c) => c.cypher.includes("SET n:User"))).toBe(true);
    expect(calls.some((c) => c.cypher.includes(":SAVED"))).toBe(true);
    const uid = graphIds.user("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(
      calls.some((c) => JSON.stringify(c.params).includes(String(uid))),
    ).toBe(true);
  });

  it("removeSavedEdge deletes SAVED between endpoints", async () => {
    const calls: string[] = [];
    const client = mockGraphClient(async (cypher) => {
      calls.push(cypher);
      return { keys: [], records: [] };
    });
    await removeSavedEdge(
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      client,
    );
    expect(calls.some((c) => c.includes("DELETE") && c.includes("SAVED"))).toBe(
      true,
    );
  });

  it("removeUserFromGraph DETACH DELETEs User", async () => {
    const calls: string[] = [];
    const client = mockGraphClient(async (cypher) => {
      calls.push(cypher);
      return { keys: [], records: [] };
    });
    await removeUserFromGraph("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", client);
    expect(calls.some((c) => /DETACH DELETE/i.test(c))).toBe(true);
    expect(calls.some((c) => c.includes(":SAVED"))).toBe(true);
  });

  it("no-ops when graph disabled", async () => {
    const run = vi.fn();
    const client = mockGraphClient(run, false);
    await addSavedEdge("a", "b", client);
    await removeSavedEdge("a", "b", client);
    await removeUserFromGraph("a", client);
    expect(run).not.toHaveBeenCalled();
  });
});
