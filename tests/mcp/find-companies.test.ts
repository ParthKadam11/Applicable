import { describe, expect, it } from "vitest";
import {
  FindCompaniesInputSchema,
  GetCompanyInputSchema,
} from "../../src/mcp/schemas.js";

describe("find_companies / get_company schemas", () => {
  it("parses find_companies filters", () => {
    const parsed = FindCompaniesInputSchema.parse({
      investor: "Accel",
      has_india_jobs: true,
      limit: 10,
    });
    expect(parsed.investor).toBe("Accel");
    expect(parsed.has_india_jobs).toBe(true);
  });

  it("requires some lookup key for get_company at call site", () => {
    const parsed = GetCompanyInputSchema.parse({ slug: "webflow" });
    expect(parsed.slug).toBe("webflow");
  });
});
