import { describe, expect, it } from "vitest";
import {
  CC_ATS_URL_PATTERNS,
  cdxShardPatterns,
  evidenceUrlFor,
  extractSlugFromAtsUrl,
  humanizeSlug,
  hitsToDiscovered,
  isJunkSlug,
} from "../../src/discover/sources/common-crawl.js";

describe("common crawl slug helpers", () => {
  it("extracts greenhouse / lever / ashby slugs", () => {
    expect(
      extractSlugFromAtsUrl(
        "greenhouse",
        "https://boards.greenhouse.io/acme/jobs/123",
      ),
    ).toBe("acme");
    expect(
      extractSlugFromAtsUrl(
        "greenhouse",
        "https://job-boards.greenhouse.io/FooBar",
      ),
    ).toBe("FooBar");
    expect(
      extractSlugFromAtsUrl("lever", "https://jobs.lever.co/acme-corp/abc"),
    ).toBe("acme-corp");
    expect(
      extractSlugFromAtsUrl("ashby", "https://jobs.ashbyhq.com/acme"),
    ).toBe("acme");
  });

  it("drops junk slugs", () => {
    expect(isJunkSlug("embed")).toBe(true);
    expect(isJunkSlug("api")).toBe(true);
    expect(isJunkSlug("assets")).toBe(true);
    expect(isJunkSlug("123")).toBe(true);
    expect(isJunkSlug("acme")).toBe(false);
    expect(isJunkSlug("acme-corp")).toBe(false);
  });

  it("humanizes slugs and builds evidence URLs", () => {
    expect(humanizeSlug("acme-corp")).toBe("Acme Corp");
    expect(evidenceUrlFor("ashby", "acme")).toBe(
      "https://jobs.ashbyhq.com/acme",
    );
    expect(evidenceUrlFor("lever", "acme")).toBe(
      "https://jobs.lever.co/acme",
    );
  });

  it("exposes ATS URL patterns for greenhouse/lever/ashby", () => {
    expect(CC_ATS_URL_PATTERNS.length).toBe(4);
    const shards = cdxShardPatterns();
    expect(shards.length).toBe(CC_ATS_URL_PATTERNS.length * 36);
    expect(shards.some((s) => s.url.startsWith("boards.greenhouse.io/"))).toBe(
      true,
    );
  });

  it("maps hits to DiscoveredCompany with common_crawl source", () => {
    const rows = hitsToDiscovered([
      {
        ats: "greenhouse",
        slug: "acme",
        evidenceUrl: "https://boards.greenhouse.io/acme",
      },
    ]);
    expect(rows[0]?.source).toBe("common_crawl");
    expect(rows[0]?.ats).toBe("greenhouse");
    expect(rows[0]?.atsSlug).toBe("acme");
    expect(rows[0]?.name).toBe("Acme");
    expect(rows[0]?.name).not.toMatch(/greenhouse/i);
  });
});
