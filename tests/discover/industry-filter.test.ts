import { describe, expect, it } from "vitest";
import {
  evaluateIndustryFilter,
  industryKeywordHit,
  techJobRatio,
} from "../../src/discover/industry-filter.js";
import {
  cleanCompanyDisplayName,
  displayNameFromSlug,
  stripAtsSuffix,
} from "../../src/discover/company-name.js";

describe("industry filter", () => {
  it("rejects dental / pharma / construction names", () => {
    expect(industryKeywordHit("42 North Dental")).toMatch(/dental/i);
    expect(industryKeywordHit("Summit Therapeutics")).toMatch(/therapeutic/i);
    expect(industryKeywordHit("Acme Pharma Inc")).toMatch(/pharma/i);
    expect(
      evaluateIndustryFilter({ name: "Oldcastle Building Envelope" }).ok,
    ).toBe(false);
  });

  it("accepts a SaaS / software company name", () => {
    expect(industryKeywordHit("Vercel", "vercel.com")).toBeNull();
    expect(
      evaluateIndustryFilter({
        name: "Vercel",
        domain: "vercel.com",
        atsSlug: "vercel",
        jobTitles: [
          "Senior Software Engineer",
          "Staff Backend Engineer",
          "Frontend Engineer",
          "Product Designer",
        ],
      }).ok,
    ).toBe(true);
  });

  it("rejects boards with low tech job ratio", () => {
    const titles = [
      "Dental Hygienist",
      "Front Desk Coordinator",
      "Billing Specialist",
      "Office Manager",
      "Patient Care Associate",
      "Regional Sales Manager",
      "Account Executive",
    ];
    const r = evaluateIndustryFilter({
      name: "Smile Co",
      jobTitles: titles,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/low tech ratio/i);
  });

  it("computes tech ratio", () => {
    const { ratio, tech, total } = techJobRatio([
      "Software Engineer",
      "Account Executive",
      "Backend Engineer",
    ]);
    expect(total).toBe(3);
    expect(tech).toBe(2);
    expect(ratio).toBeCloseTo(2 / 3);
  });
});

describe("company display names", () => {
  it("strips ATS suffixes", () => {
    expect(stripAtsSuffix("Datavant (greenhouse)")).toBe("Datavant");
    expect(stripAtsSuffix("Acme (lever)")).toBe("Acme");
    expect(stripAtsSuffix("Foo (ashby)")).toBe("Foo");
  });

  it("humanizes slugs", () => {
    expect(displayNameFromSlug("datavant2")).toBe("Datavant");
    expect(displayNameFromSlug("acme-corp")).toBe("Acme Corp");
  });

  it("cleans candidate names", () => {
    expect(cleanCompanyDisplayName("Cookunity (greenhouse)", "cookunity")).toBe(
      "Cookunity",
    );
    expect(cleanCompanyDisplayName("", "datavant2")).toBe("Datavant");
  });
});
