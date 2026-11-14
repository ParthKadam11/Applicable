import { describe, expect, it } from "vitest";
import {
  GRAPH_ID_MAX,
  GraphIdRegistry,
  createGraphIds,
  stableGraphId,
} from "../../src/graph/ids.js";

describe("graph ids", () => {
  it("produces stable 53-bit-safe positive integers", () => {
    const a = stableGraphId("job", "11111111-1111-1111-1111-111111111111");
    const b = stableGraphId("job", "11111111-1111-1111-1111-111111111111");
    expect(a).toBe(b);
    expect(Number.isSafeInteger(a)).toBe(true);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(GRAPH_ID_MAX);
  });

  it("throws on id collision when different ext_id maps to same id", () => {
    const reg = new GraphIdRegistry();
    reg.claim(42, "job:aaa");
    expect(() => reg.claim(42, "job:bbb")).toThrow(/collision/);
    expect(() => reg.claim(42, "job:aaa")).not.toThrow();
  });

  it("createGraphIds claims through the registry", () => {
    const ids = createGraphIds();
    const j1 = ids.job("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    const j2 = ids.job("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(j1).toBe(j2);
    // Force a collision by claiming the same numeric id under another key
    expect(() => ids.registry.claim(j1, "job:other-uuid")).toThrow(/collision/);
  });
});
