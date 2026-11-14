import { describe, expect, it } from "vitest";
import {
  buildExploreCypher,
  validateExplorePath,
} from "../../src/graph/hops.js";
import { assertParameterized } from "../../src/graph/cypher.js";
import { trimLinesToTokens } from "../../src/graph/explore.js";

describe("explore hops", () => {
  it("rejects unknown hops with allowlist message", () => {
    expect(() => validateExplorePath("company", ["HACK"])).toThrow(/unknown hop/);
    expect(() => validateExplorePath("company", ["HACK"])).toThrow(/SIMILAR_TO/);
  });

  it("rejects paths longer than 3", () => {
    expect(() =>
      validateExplorePath("company", [
        "SIMILAR_TO",
        "POSTS",
        "REQUIRES",
        "LABELED",
      ]),
    ).toThrow(/max 3/);
  });

  it("rejects illegal transitions", () => {
    expect(() => validateExplorePath("skill", ["SIMILAR_TO"])).toThrow(
      /invalid hop/,
    );
  });

  it("rejects SAVED without me start", () => {
    expect(() => validateExplorePath("job", ["SAVED"])).toThrow(/personal/);
  });

  it("accepts company SIMILAR_TO POSTS LABELED", () => {
    const p = validateExplorePath("company", [
      "SIMILAR_TO",
      "POSTS",
      "LABELED",
    ]);
    expect(p.kinds).toEqual(["Company", "Company", "Job", "Label"]);
  });

  it("builds parameterized cypher (no start value interpolation)", () => {
    const path = validateExplorePath("company", ["SIMILAR_TO", "POSTS"]);
    const evil = "DROP'; MATCH (n) RETURN n";
    const q = buildExploreCypher({
      startType: "company",
      startValue: evil,
      path,
      labels: ["open", "india_remote"],
    });
    assertParameterized(q, [evil]);
    expect(q.params.start).toBe(evil);
    expect(q.cypher).toContain("SIMILAR_TO");
    expect(q.cypher).toContain("POSTS");
    expect(q.cypher).toMatch(/:Job\) WHERE .*label = \$jl/);
    expect(q.cypher).not.toMatch(/\nWHERE /);
    expect(q.cypher).not.toContain(evil);
  });
});

describe("token trim", () => {
  it("sets truncated when over budget", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i} ` + "x".repeat(40));
    const r = trimLinesToTokens(lines, 50);
    expect(r.truncated).toBe(true);
    expect(r.tokens_used).toBeLessThanOrEqual(50);
    expect(r.lines.length).toBeGreaterThan(0);
  });
});
