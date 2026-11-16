import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WorkableAdapter,
  countWorkableJobs,
  normalizeWorkableJob,
} from "../../src/ats/workable.js";

const fixture = JSON.parse(
  readFileSync(resolve("tests/fixtures/workable-widget.json"), "utf8"),
);

const COMPANY_ID = "44444444-4444-4444-8444-444444444444";

describe("WorkableAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes widget jobs and dedupes shortcodes", () => {
    const jobs = (fixture.jobs as Array<Record<string, unknown>>).map((j) =>
      normalizeWorkableJob(j as never, "huggingface", COMPANY_ID),
    );
    expect(jobs[0]).toMatchObject({
      externalId: "ABC123",
      title: "Open-Source Machine Learning Engineer - EMEA Remote",
      isRemoteFlag: true,
      sourceAts: "workable",
      applyUrl: "https://apply.workable.com/huggingface/j/ABC123/apply",
    });
    expect(jobs[0]!.descriptionText).toContain("Build open-source ML tools");
  });

  it("fetchJobs prefers widget details=true", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(fixture),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new WorkableAdapter();
    const jobs = await adapter.fetchJobs("huggingface", COMPANY_ID);

    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "/api/v1/widget/accounts/huggingface?details=true",
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.externalId).toBe("ABC123");
    expect(jobs[0]!.locationRaw).toMatch(/France|Germany|Remote/i);
  });

  it("countWorkableJobs POSTs /api/v3/accounts/<slug>/jobs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ results: [{ shortcode: "X" }], total: 7 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(countWorkableJobs("acme")).resolves.toBe(7);
    expect(String(fetchMock.mock.calls[0]![0])).toContain(
      "/api/v3/accounts/acme/jobs",
    );
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "POST" });
  });

  it("countWorkableJobs returns null on 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "missing",
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(countWorkableJobs("nope")).resolves.toBeNull();
  });
});
