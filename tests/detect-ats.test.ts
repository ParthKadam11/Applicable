import { describe, expect, it } from "vitest";
import { detectAtsFromHtml } from "../src/scripts/detect-ats.js";

describe("detectAtsFromHtml", () => {
  it("finds Ashby / Greenhouse / Lever links in a careers page", () => {
    const html = `
      <a href="https://jobs.ashbyhq.com/acme">Ashby</a>
      <a href="https://boards.greenhouse.io/acme-corp/jobs/1">GH</a>
      <a href="https://jobs.lever.co/acme">Lever</a>
      <a href="https://apply.workable.com/acme">Workable (ignored)</a>
      <a href="https://acme.recruitee.com/">Recruitee (ignored)</a>
      <a href="https://acme.jobs.personio.de/">Personio (ignored)</a>
    `;

    const detections = detectAtsFromHtml(html);
    const byAts = Object.fromEntries(detections.map((d) => [d.ats, d.ats_slug]));

    expect(byAts).toEqual({
      ashby: "acme",
      greenhouse: "acme-corp",
      lever: "acme",
    });
  });

  it("detects ATS from the page URL itself", () => {
    const detections = detectAtsFromHtml(
      "<html></html>",
      "https://jobs.ashbyhq.com/notion",
    );
    expect(detections).toEqual([
      {
        ats: "ashby",
        ats_slug: "notion",
        url: "https://jobs.ashbyhq.com/notion",
      },
    ]);
  });
});
