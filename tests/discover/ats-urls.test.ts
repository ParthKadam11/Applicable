import { describe, expect, it } from "vitest";
import { domainFromUrl, extractAtsUrls } from "../../src/discover/ats-urls.js";

describe("extractAtsUrls", () => {
  it("parses ashby / greenhouse / lever board URLs", () => {
    const text = `
      Apply at https://jobs.ashbyhq.com/posthog/abc
      or https://boards.greenhouse.io/grafanalabs
      or https://job-boards.greenhouse.io/sourcegraph91/jobs/1
      or https://jobs.lever.co/metabase/xyz
    `;
    const hits = extractAtsUrls(text);
    expect(hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ats: "ashby", atsSlug: "posthog" }),
        expect.objectContaining({ ats: "greenhouse", atsSlug: "grafanalabs" }),
        expect.objectContaining({ ats: "greenhouse", atsSlug: "sourcegraph91" }),
        expect.objectContaining({ ats: "lever", atsSlug: "metabase" }),
      ]),
    );
  });

  it("dedupes same board", () => {
    const hits = extractAtsUrls(
      "https://jobs.ashbyhq.com/modal https://jobs.ashbyhq.com/modal/job-1",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.atsSlug).toBe("modal");
  });

  it("parses Workable apply board URLs and skips reserved slugs", () => {
    const hits = extractAtsUrls(
      "https://apply.workable.com/huggingface/j/ABC https://apply.workable.com/api/v3/x",
    );
    expect(hits).toEqual([
      expect.objectContaining({ ats: "workable", atsSlug: "huggingface" }),
    ]);
  });
});

describe("domainFromUrl", () => {
  it("strips www", () => {
    expect(domainFromUrl("https://www.example.com/careers")).toBe("example.com");
  });
});
