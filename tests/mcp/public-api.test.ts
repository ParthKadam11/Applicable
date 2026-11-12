import { describe, expect, it } from "vitest";
import {
  parseEligibilityParam,
  parseQueryString,
} from "../../src/mcp/public-api.js";

describe("public API query parsers", () => {
  it("parses comma and array eligibility", () => {
    expect(parseEligibilityParam("open,india_remote")).toEqual([
      "open",
      "india_remote",
    ]);
    expect(parseEligibilityParam(["open", "unclear"])).toEqual([
      "open",
      "unclear",
    ]);
    expect(parseEligibilityParam("nope")).toBeUndefined();
  });

  it("trims and caps query strings", () => {
    expect(parseQueryString("  backend ")).toBe("backend");
    expect(parseQueryString("")).toBeUndefined();
    expect(parseQueryString("x".repeat(201))).toBeUndefined();
  });
});
