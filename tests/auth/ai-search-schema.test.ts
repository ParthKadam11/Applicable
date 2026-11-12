import { describe, expect, it } from "vitest";
import { AiSearchFilterSchema } from "../../src/mcp/schemas.js";

describe("AiSearchFilterSchema", () => {
  it("accepts a valid LLM filter object", () => {
    const parsed = AiSearchFilterSchema.parse({
      query: "backend",
      eligibility: ["open", "india_remote"],
      role_keywords: "typescript",
      posted_within_days: 30,
      limit: 20,
    });
    expect(parsed.query).toBe("backend");
    expect(parsed.role_keywords).toBe("typescript");
  });

  it("rejects bad eligibility and out-of-range values", () => {
    expect(() =>
      AiSearchFilterSchema.parse({
        eligibility: ["mars"],
      }),
    ).toThrow();

    expect(() =>
      AiSearchFilterSchema.parse({
        posted_within_days: 999,
      }),
    ).toThrow();

    expect(() =>
      AiSearchFilterSchema.parse({
        limit: 100,
      }),
    ).toThrow();
  });

  it("defaults eligibility and limit", () => {
    const parsed = AiSearchFilterSchema.parse({});
    expect(parsed.eligibility).toEqual(["open", "india_remote"]);
    expect(parsed.limit).toBe(25);
  });
});
