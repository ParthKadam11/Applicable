import { describe, expect, it, beforeAll, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: async () => null,
}));

import {
  decodeJobsCursor,
  encodeJobsCursor,
  getJobById,
  listJobs,
  parseJobsListSearchParams,
  ReportBodySchema,
} from "../../web/src/lib/jobs-api.ts";
import { SlidingWindowLimiter } from "../../web/src/lib/rate-limit.ts";
import { db } from "../../web/src/db/client.ts";
import { sql } from "drizzle-orm";
import { GET as getJobs } from "../../web/src/app/api/jobs/route.ts";
import { POST as saveJobPost } from "../../web/src/app/api/me/saved/[jobId]/route.ts";
import { POST as reportJob } from "../../web/src/app/api/jobs/[id]/report/route.ts";

let dbUp = false;

beforeAll(async () => {
  try {
    await db.execute(sql`select 1`);
    dbUp = true;
  } catch {
    dbUp = false;
  }
});

describe("parseJobsListSearchParams", () => {
  it("defaults labels to open/india_remote/india_onsite", () => {
    const r = parseJobsListSearchParams(new URLSearchParams());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.labels).toEqual([
      "open",
      "india_remote",
      "india_onsite",
    ]);
    expect(r.data.limit).toBe(40);
    expect(r.data.sort).toBe("newest");
  });

  it("parses each filter", () => {
    const sp = new URLSearchParams({
      q: "backend",
      labels: "open,india_remote",
      role: "backend",
      ats: "ashby",
      posted: "7d",
      has_salary: "true",
      sort: "company",
      limit: "50",
    });
    const r = parseJobsListSearchParams(sp);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.q).toBe("backend");
    expect(r.data.role).toBe("backend");
    expect(r.data.ats).toBe("ashby");
    expect(r.data.posted).toBe("7d");
    expect(r.data.has_salary).toBe(true);
    expect(r.data.sort).toBe("company");
    expect(r.data.limit).toBe(50);
  });

  it("rejects invalid params", () => {
    expect(
      parseJobsListSearchParams(new URLSearchParams({ role: "wizard" })).ok,
    ).toBe(false);
    expect(
      parseJobsListSearchParams(new URLSearchParams({ limit: "999" })).ok,
    ).toBe(false);
    expect(
      parseJobsListSearchParams(new URLSearchParams({ has_salary: "maybe" }))
        .ok,
    ).toBe(false);
    expect(
      parseJobsListSearchParams(new URLSearchParams({ labels: "nope" })).ok,
    ).toBe(false);
  });

  it("encodes and decodes cursors", () => {
    const raw = encodeJobsCursor({
      sort: "newest",
      v: "2026-01-01T00:00:00.000Z",
      id: "00000000-0000-0000-0000-000000000001",
    });
    const decoded = decodeJobsCursor(raw);
    expect(decoded.sort).toBe("newest");
    expect(decoded.id).toContain("0001");
    expect(() => decodeJobsCursor("!!!")).toThrow();
  });
});

describe("ReportBodySchema", () => {
  it("accepts empty and suggested label", () => {
    expect(ReportBodySchema.parse({}).suggestedLabel).toBeUndefined();
    expect(
      ReportBodySchema.parse({ suggestedLabel: "open", note: "hi" }).note,
    ).toBe("hi");
  });
});

describe("label report rate limit", () => {
  it("allows 5 then blocks within the window", () => {
    const limiter = new SlidingWindowLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(limiter.allow("ip")).toBe(true);
    }
    expect(limiter.allow("ip")).toBe(false);
  });
});

describe("listJobs (db)", () => {
  it("returns default labels shape", async ({ skip }) => {
    if (!dbUp) skip();
    const page = await listJobs({
      labels: ["open", "india_remote"],
      posted: "all",
      sort: "newest",
      limit: 10,
    });
    expect(page).toHaveProperty("items");
    expect(page).toHaveProperty("nextCursor");
    expect(page).toHaveProperty("total");
    expect(page).toHaveProperty("lastIngestionAt");
    expect(Array.isArray(page.items)).toBe(true);
    if (page.items[0]) {
      const j = page.items[0];
      expect(j).toHaveProperty("id");
      expect(j.company).toHaveProperty("name");
      expect(j).toHaveProperty("applyUrl");
      expect(["rule", "llm"]).toContain(j.decidedBy);
    }
  });

  it("applies role / ats / posted / has_salary filters", async ({ skip }) => {
    if (!dbUp) skip();
    const base = await listJobs({
      labels: ["open", "india_remote"],
      posted: "all",
      sort: "newest",
      limit: 5,
    });
    const withRole = await listJobs({
      labels: ["open", "india_remote"],
      role: "backend",
      posted: "all",
      sort: "newest",
      limit: 5,
    });
    const withAts = await listJobs({
      labels: ["open", "india_remote"],
      ats: "ashby",
      posted: "all",
      sort: "newest",
      limit: 5,
    });
    const withPosted = await listJobs({
      labels: ["open", "india_remote"],
      posted: "30d",
      sort: "newest",
      limit: 5,
    });
    const withSalary = await listJobs({
      labels: ["open", "india_remote"],
      posted: "all",
      has_salary: true,
      sort: "newest",
      limit: 5,
    });
    expect(withRole.total).toBeLessThanOrEqual(base.total);
    expect(withAts.total).toBeLessThanOrEqual(base.total);
    expect(withPosted.total).toBeLessThanOrEqual(base.total);
    expect(withSalary.total).toBeLessThanOrEqual(base.total);
  });

  it("paginates with cursor without duplicates", async ({ skip }) => {
    if (!dbUp) skip();
    const first = await listJobs({
      labels: ["open", "india_remote"],
      posted: "all",
      sort: "newest",
      limit: 5,
    });
    if (!first.nextCursor) {
      expect(first.items.length).toBeLessThanOrEqual(5);
      return;
    }
    const second = await listJobs({
      labels: ["open", "india_remote"],
      posted: "all",
      sort: "newest",
      limit: 5,
      cursor: first.nextCursor,
    });
    const ids = new Set([
      ...first.items.map((j) => j.id),
      ...second.items.map((j) => j.id),
    ]);
    expect(ids.size).toBe(first.items.length + second.items.length);
  });

  it("getJobById 200/404", async ({ skip }) => {
    if (!dbUp) skip();
    const page = await listJobs({
      labels: ["open", "india_remote"],
      posted: "all",
      sort: "newest",
      limit: 1,
    });
    if (page.items[0]) {
      const job = await getJobById(page.items[0].id);
      expect(job?.id).toBe(page.items[0].id);
      expect(job).toHaveProperty("description");
      expect(job).toHaveProperty("related");
    }
    const missing = await getJobById("00000000-0000-4000-8000-000000000099");
    expect(missing).toBeNull();
  });
});

describe("GET /api/jobs validation", () => {
  it("returns 400 for invalid params", async () => {
    const res = await getJobs(
      new Request("http://localhost/api/jobs?role=wizard"),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error).toBe("invalid_params");
    expect(body.message).toBeTruthy();
  });
});

describe("save requires auth", () => {
  it("returns 401 when signed out", async () => {
    const res = await saveJobPost(
      new Request(
        "http://localhost/api/me/saved/00000000-0000-4000-8000-000000000001",
        { method: "POST" },
      ),
      {
        params: Promise.resolve({
          jobId: "00000000-0000-4000-8000-000000000001",
        }),
      },
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("unauthorized");
  });
});

describe("POST /api/jobs/:id/report", () => {
  it("returns 404 for missing job when db up, else skips", async ({ skip }) => {
    if (!dbUp) skip();
    const res = await reportJob(
      new Request(
        "http://localhost/api/jobs/00000000-0000-4000-8000-000000000099/report",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: "test" }),
        },
      ),
      {
        params: Promise.resolve({
          id: "00000000-0000-4000-8000-000000000099",
        }),
      },
    );
    expect([404, 429]).toContain(res.status);
  });
});
