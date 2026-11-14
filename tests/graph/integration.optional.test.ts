import { describe, expect, it } from "vitest";
import { createGraphClient, closeSharedGraphDriver } from "../../src/graph/driver.js";
import { upsertNodesByLabel, mergeTypedEdges } from "../../src/graph/cypher.js";

/**
 * Optional live Bolt test — only runs when HYDRA_BOLT_URL + HYDRA_TOKEN set
 * and HYDRA_GRAPH_ENABLED=true.
 */
describe("hydradb bolt integration (optional)", () => {
  it("round-trips a MERGE edge when graph is enabled", async () => {
    if (
      process.env.HYDRA_GRAPH_ENABLED !== "true" ||
      !process.env.HYDRA_TOKEN ||
      !process.env.HYDRA_BOLT_URL
    ) {
      return;
    }
    const client = createGraphClient({ enabled: true });
    const a = 900001;
    const b = 900002;
    await client.run(
      upsertNodesByLabel("Company", [
        { id: a, ext_id: "t-a", slug: "t-a", name: "T-A", ats: "ashby" },
      ]).cypher,
      {
        rows: [{ id: a, ext_id: "t-a", slug: "t-a", name: "T-A", ats: "ashby" }],
      },
    );
    await client.run(
      upsertNodesByLabel("Job", [
        {
          id: b,
          ext_id: "t-b",
          title: "T",
          label: "open",
          role: "backend",
          posted_at: "",
          first_seen_at: "",
          apply_url: "https://example.com",
          active: true,
        },
      ]).cypher,
      {
        rows: [
          {
            id: b,
            ext_id: "t-b",
            title: "T",
            label: "open",
            role: "backend",
            posted_at: "",
            first_seen_at: "",
            apply_url: "https://example.com",
            active: true,
          },
        ],
      },
    );
    const edge = mergeTypedEdges("POSTS", [{ src: a, dst: b }]);
    await client.run(edge.cypher, edge.params);
    const read = await client.run(
      "MATCH (c:Company {id: $a})-[:POSTS]->(j:Job {id: $b}) RETURN j.ext_id AS id",
      { a, b },
    );
    expect(read.records[0]?.id).toBe("t-b");
    await closeSharedGraphDriver();
  });
});
