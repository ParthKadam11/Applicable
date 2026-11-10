import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GreenhouseAdapter,
  normalizeGreenhouseJob,
} from "../../src/ats/greenhouse.js";

const fixture = JSON.parse(
  readFileSync(resolve("tests/fixtures/greenhouse.json"), "utf8"),
);

const COMPANY_ID = "22222222-2222-4222-8222-222222222222";

describe("GreenhouseAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes fixture jobs and strips HTML", () => {
    const jobs = fixture.jobs.map((j: (typeof fixture.jobs)[0]) =>
      normalizeGreenhouseJob(j, COMPANY_ID),
    );

    expect(jobs[0]).toMatchObject({
      externalId: "4001",
      title: "Staff Software Engineer, Infrastructure",
      department: "Engineering, Infrastructure",
      locationRaw: "Remote - US",
      isRemoteFlag: true,
      applyUrl: "https://boards.greenhouse.io/stripe/jobs/4001",
      sourceAts: "greenhouse",
    });
    expect(jobs[0].descriptionText).toContain("Own our edge network.");
    expect(jobs[0].descriptionText).not.toContain("<p>");

    expect(jobs[1]).toMatchObject({
      externalId: "4002",
      locationRaw: "Dublin, Ireland",
      isRemoteFlag: null,
    });
  });

  it("fetchJobs uses boards-api with content=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(fixture),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new GreenhouseAdapter();
    const jobs = await adapter.fetchJobs("stripe", COMPANY_ID);

    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true",
    );
    expect(jobs).toHaveLength(2);
  });
});
