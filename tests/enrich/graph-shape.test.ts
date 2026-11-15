import { describe, expect, it } from "vitest";
import { hydraMutationIdempotencyKey } from "../../src/graph/driver.js";
import { validateExplorePath } from "../../src/graph/hops.js";
import { stableGraphId } from "../../src/graph/ids.js";

describe("enrichment graph upsert shape", () => {
  it("stable ids differ by namespace for same key", () => {
    const person = stableGraphId("person", "alice");
    const investor = stableGraphId("investor", "alice");
    expect(person).not.toBe(investor);
  });

  it("idempotency key stable for identical cypher+params", () => {
    const cypher =
      "UNWIND $rows AS row MERGE (n {id: row.id}) SET n:Investor, n.name = row.name";
    const params = { rows: [{ id: 1, name: "Accel" }] };
    expect(hydraMutationIdempotencyKey(cypher, params)).toBe(
      hydraMutationIdempotencyKey(cypher, params),
    );
    expect(
      hydraMutationIdempotencyKey(cypher, {
        rows: [{ id: 1, name: "Different" }],
      }),
    ).not.toBe(hydraMutationIdempotencyKey(cypher, params));
  });

  it("allows investor INVESTED_IN company POSTS", () => {
    const p = validateExplorePath("investor", ["INVESTED_IN", "POSTS"]);
    expect(p.kinds).toEqual(["Investor", "Company", "Job"]);
  });

  it("allows batch IN_BATCH POSTS", () => {
    const p = validateExplorePath("batch", ["IN_BATCH", "POSTS"]);
    expect(p.kinds[0]).toBe("Batch");
    expect(p.kinds[1]).toBe("Company");
  });
});
