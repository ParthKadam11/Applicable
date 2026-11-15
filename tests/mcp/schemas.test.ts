import { describe, expect, it } from "vitest";
import {
  GetJobInputSchema,
  SearchJobsInputSchema,
  SubmitCompanyInputSchema,
} from "../../src/mcp/schemas.js";

describe("MCP input schemas", () => {
  it("search_jobs defaults eligibility to open + india_remote", () => {
    const parsed = SearchJobsInputSchema.parse({ query: "backend" });
    expect(parsed.eligibility).toEqual(["open", "india_remote"]);
    expect(parsed.limit).toBe(20);
    expect(parsed.max_per_company).toBe(3);
  });

  it("search_jobs rejects limit > 50", () => {
    expect(() => SearchJobsInputSchema.parse({ limit: 51 })).toThrow();
  });

  it("accepts role_keywords array and location", () => {
    const parsed = SearchJobsInputSchema.parse({
      query: "backend",
      role_keywords: ["typescript", "node"],
      location: "Bangalore",
      limit: 5,
    });
    expect(parsed.role_keywords).toBe("typescript node");
    expect(parsed.location).toBe("Bangalore");
  });

  it("get_job requires uuid", () => {
    expect(() => GetJobInputSchema.parse({ id: "nope" })).toThrow();
    expect(
      GetJobInputSchema.parse({
        id: "11111111-1111-1111-1111-111111111111",
      }).id,
    ).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("submit_company requires http(s) URL", () => {
    expect(() =>
      SubmitCompanyInputSchema.parse({
        name: "Acme",
        careers_url: "not-a-url",
      }),
    ).toThrow();
    const ok = SubmitCompanyInputSchema.parse({
      name: "Acme",
      careers_url: "https://acme.com/careers",
    });
    expect(ok.name).toBe("Acme");
  });
});
