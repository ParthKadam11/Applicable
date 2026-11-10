import { describe, expect, it } from "vitest";
import type { NormalizedJob } from "../../src/ats/types.js";
import { contentHash } from "../../src/utils/hash.js";
import { stripHtml } from "../../src/utils/html.js";

describe("contentHash", () => {
  it("is stable for identical content and changes when description changes", () => {
    const base = {
      title: "Backend Engineer",
      descriptionText: "Build APIs",
      locationRaw: "Remote",
      employmentType: "Full-time",
      applyUrl: "https://example.com/jobs/1",
    };

    const a = contentHash(base);
    const b = contentHash(base);
    const c = contentHash({ ...base, descriptionText: "Build APIs and workers" });

    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("stripHtml", () => {
  it("removes tags and decodes entities", () => {
    expect(stripHtml("<p>Hello&nbsp;<b>world</b>&amp; friends</p>")).toBe(
      "Hello world & friends",
    );
  });
});

describe("NormalizedJob shape (fixture round-trip)", () => {
  it("requires applyUrl and externalId", () => {
    const job: NormalizedJob = {
      externalId: "x",
      companyId: "11111111-1111-4111-8111-111111111111",
      title: "Eng",
      department: null,
      locationRaw: null,
      isRemoteFlag: null,
      employmentType: null,
      descriptionText: "",
      applyUrl: "https://example.com/a",
      compensationRaw: null,
      postedAt: null,
      sourceAts: "ashby",
    };
    expect(job.externalId).toBe("x");
  });
});
