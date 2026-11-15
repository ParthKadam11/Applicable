import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AshbyAdapter, normalizeAshbyJob } from "../../src/ats/ashby.js";

const fixture = JSON.parse(
  readFileSync(resolve("tests/fixtures/ashby.json"), "utf8"),
);

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

describe("AshbyAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes fixture jobs", () => {
    const jobs = fixture.jobs.map((j: (typeof fixture.jobs)[0]) =>
      normalizeAshbyJob(j, "notion", COMPANY_ID),
    );

    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      externalId: "ashby-job-1",
      companyId: COMPANY_ID,
      title: "Senior Backend Engineer",
      department: "Engineering",
      locationRaw: "Remote - Worldwide",
      isRemoteFlag: true,
      employmentType: "FullTime",
      descriptionText: "Build APIs. Remote from India welcome.",
      applyUrl: "https://jobs.ashbyhq.com/notion/ashby-job-1",
      sourceAts: "ashby",
    });
    expect(jobs[0].compensationRaw).toEqual({ summary: "$180k–$220k" });
    expect(jobs[0].postedAt?.toISOString()).toBe("2026-01-15T12:00:00.000Z");

    expect(jobs[1]).toMatchObject({
      externalId: "ashby-job-2",
      title: "Frontend Engineer",
      locationRaw: "San Francisco, CA",
      isRemoteFlag: false,
      descriptionText: "Build delightful product UIs.",
      applyUrl: "https://jobs.ashbyhq.com/notion/ashby-job-2/application",
    });
  });

  it("fetchJobs hits the public board API and returns NormalizedJob[]", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(fixture),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new AshbyAdapter();
    const jobs = await adapter.fetchJobs("notion", COMPANY_ID);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://api.ashbyhq.com/posting-api/job-board/notion?includeCompensation=true",
    );
    expect(init.headers["User-Agent"]).toContain("Applicable");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.sourceAts).toBe("ashby");
  });
});
