import { describe, expect, it } from "vitest";
import { IpRateLimiter } from "../../src/mcp/rate-limit.js";

describe("IpRateLimiter", () => {
  it("allows up to rpm then blocks", () => {
    const lim = new IpRateLimiter(3, 60_000);
    expect(lim.allow("1.1.1.1")).toBe(true);
    expect(lim.allow("1.1.1.1")).toBe(true);
    expect(lim.allow("1.1.1.1")).toBe(true);
    expect(lim.allow("1.1.1.1")).toBe(false);
    expect(lim.allow("2.2.2.2")).toBe(true);
  });
});
