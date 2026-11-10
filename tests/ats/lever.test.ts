import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeverAdapter, normalizeLeverJob } from "../../src/ats/lever.js";

const fixture = JSON.parse(
  readFileSync(resolve("tests/fixtures/lever.json"), "utf8"),
);

const COMPANY_ID = "33333333-3333-4333-8333-333333333333";

describe("LeverAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes fixture jobs", () => {
    const jobs = fixture.map((j: (typeof fixture)[0]) =>
      normalizeLeverJob(j, COMPANY_ID),
    );

    expect(jobs[0]).toMatchObject({
      externalId: "lever-abc",
      title: "Backend Engineer",
      department: "Engineering",
      locationRaw: "Remote; Los Gatos",
      isRemoteFlag: true,
      employmentType: "Full-time",
      applyUrl: "https://jobs.lever.co/netflix/lever-abc",
      sourceAts: "lever",
    });
    expect(jobs[0].descriptionText).toContain("Build streaming services.");
    expect(jobs[0].descriptionText).toContain("take-home");
    expect(jobs[0].postedAt?.getTime()).toBe(1700000000000);

    expect(jobs[1]).toMatchObject({
      externalId: "lever-def",
      isRemoteFlag: false,
      locationRaw: "Los Gatos, CA",
    });
  });

  it("fetchJobs hits Lever postings API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(fixture),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new LeverAdapter();
    const jobs = await adapter.fetchJobs("netflix", COMPANY_ID);

    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://api.lever.co/v0/postings/netflix?mode=json",
    );
    expect(jobs).toHaveLength(2);
  });
});
