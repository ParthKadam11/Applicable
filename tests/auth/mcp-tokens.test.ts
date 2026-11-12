import { describe, expect, it } from "vitest";
import {
  extractBearerToken,
  generateRawMcpToken,
  hashMcpToken,
} from "../../src/auth/mcp-tokens.js";

describe("mcp token hashing", () => {
  it("hashes deterministically and never equals raw", () => {
    const raw = generateRawMcpToken();
    expect(raw.startsWith("app_mcp_")).toBe(true);
    const a = hashMcpToken(raw);
    const b = hashMcpToken(raw);
    expect(a).toBe(b);
    expect(a).not.toBe(raw);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("extracts Bearer and query token", () => {
    expect(extractBearerToken("Bearer abc.def", undefined)).toBe("abc.def");
    expect(extractBearerToken(undefined, "qtoken")).toBe("qtoken");
    expect(extractBearerToken("Basic x", undefined)).toBeNull();
  });
});
