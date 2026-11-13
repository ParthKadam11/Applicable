import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/auth", () => ({
  auth: async () => null,
}));

import {
  decodeSavedCursor,
  encodeSavedCursor,
  exportSavedJobsCsv,
  listSavedJobsFiltered,
  parseSavedListSearchParams,
  PatchSavedBodySchema,
  setSavedApplied,
} from "../../web/src/lib/saved-api.ts";
import { GET as getSaved } from "../../web/src/app/api/me/saved/route.ts";
import {
  DELETE as deleteSaved,
  PATCH as patchSaved,
} from "../../web/src/app/api/me/saved/[jobId]/route.ts";
import { GET as exportSaved } from "../../web/src/app/api/me/saved/export/route.ts";
import { db, pool } from "../../src/db/client.js";
import { companies, jobTags, jobs, savedJobs, users } from "../../src/db/schema.js";
import { saveJob as mcpSaveJob } from "../../src/auth/saved-jobs.js";

let dbUp = false;
let userA = "";
let userB = "";
let companyId = "";
let jobActive = "";
let jobClosed = "";
let jobLabelChange = "";

beforeAll(async () => {
  try {
    await pool.query("select 1");
    await pool.query(`
      ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS label_at_save text;
      ALTER TABLE saved_jobs ADD COLUMN IF NOT EXISTS applied_at timestamptz;
    `);
    dbUp = true;
  } catch {
    dbUp = false;
    return;
  }

  const stamp = Date.now();
  const [co] = await db
    .insert(companies)
    .values({
      name: `Saved Test Co ${stamp}`,
      website: "https://example.com",
      ats: "greenhouse",
      atsSlug: `saved-test-${stamp}`,
    })
    .returning();
  companyId = co!.id;

  const mkJob = async (title: string, closed: boolean) => {
    const [job] = await db
      .insert(jobs)
      .values({
        companyId,
        externalId: `ext-${title}-${stamp}`,
        title,
        descriptionText: "backend engineer typescript",
        applyUrl: `https://example.com/jobs/${title}`,
        sourceAts: "greenhouse",
        contentHash: `hash-${title}-${stamp}`,
        locationRaw: "Remote",
        closedAt: closed ? new Date() : null,
      })
      .returning();
    await db.insert(jobTags).values({
      jobId: job!.id,
      indiaEligibility: "india_remote",
      eligibilityEvidence: ["India remote OK"],
      classifier: "rule",
      roleFamily: "backend",
    });
    return job!.id;
  };

  jobActive = await mkJob("ActiveBackend", false);
  jobClosed = await mkJob("ClosedBackend", true);
  jobLabelChange = await mkJob("LabelFlip", false);

  const [a] = await db
    .insert(users)
    .values({
      googleSub: `saved-a-${stamp}`,
      email: `saved-a-${stamp}@example.com`,
      name: "User A",
    })
    .returning();
  const [b] = await db
    .insert(users)
    .values({
      googleSub: `saved-b-${stamp}`,
      email: `saved-b-${stamp}@example.com`,
      name: "User B",
    })
    .returning();
  userA = a!.id;
  userB = b!.id;

  await mcpSaveJob(db, userA, jobActive);
  await mcpSaveJob(db, userA, jobClosed);
  await mcpSaveJob(db, userA, jobLabelChange);

  await db
    .update(savedJobs)
    .set({ labelAtSave: "india_remote" })
    .where(
      and(eq(savedJobs.userId, userA), eq(savedJobs.jobId, jobLabelChange)),
    );
  await db
    .update(jobTags)
    .set({ indiaEligibility: "open" })
    .where(eq(jobTags.jobId, jobLabelChange));
});

afterAll(async () => {
  if (!dbUp) return;
  if (userA) await db.delete(users).where(eq(users.id, userA));
  if (userB) await db.delete(users).where(eq(users.id, userB));
  if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
});

describe("parseSavedListSearchParams", () => {
  it("defaults status all and sort saved_newest", () => {
    const r = parseSavedListSearchParams(new URLSearchParams());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.status).toBe("all");
    expect(r.data.sort).toBe("saved_newest");
    expect(r.data.limit).toBe(30);
    expect(r.data.applied).toBe("all");
  });

  it("rejects invalid params", () => {
    expect(
      parseSavedListSearchParams(new URLSearchParams({ status: "maybe" })).ok,
    ).toBe(false);
    expect(
      parseSavedListSearchParams(new URLSearchParams({ sort: "nope" })).ok,
    ).toBe(false);
    expect(
      parseSavedListSearchParams(new URLSearchParams({ limit: "999" })).ok,
    ).toBe(false);
  });

  it("encodes/decodes cursors", () => {
    const raw = encodeSavedCursor({
      sort: "saved_newest",
      v: "2026-01-01T00:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000001",
    });
    expect(decodeSavedCursor(raw).sort).toBe("saved_newest");
    expect(() => decodeSavedCursor("!!!")).toThrow();
  });
});

describe("GET /api/me/saved auth", () => {
  it("returns 401 when signed out", async () => {
    const res = await getSaved(new Request("http://localhost/api/me/saved"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("unauthorized");
  });

  it("export returns 401 when signed out", async () => {
    const res = await exportSaved(
      new Request("http://localhost/api/me/saved/export?format=csv"),
    );
    expect(res.status).toBe(401);
  });

  it("PATCH returns 401 when signed out", async () => {
    const res = await patchSaved(
      new Request(
        "http://localhost/api/me/saved/00000000-0000-4000-8000-000000000001",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applied: true }),
        },
      ),
      {
        params: Promise.resolve({
          jobId: "00000000-0000-4000-8000-000000000001",
        }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("DELETE returns 401 when signed out", async () => {
    const res = await deleteSaved(
      new Request(
        "http://localhost/api/me/saved/00000000-0000-4000-8000-000000000001",
        { method: "DELETE" },
      ),
      {
        params: Promise.resolve({
          jobId: "00000000-0000-4000-8000-000000000001",
        }),
      },
    );
    expect(res.status).toBe(401);
  });
});

describe("listSavedJobsFiltered (db)", () => {
  it("returns closed jobs with isClosed", async ({ skip }) => {
    if (!dbUp) skip();
    const page = await listSavedJobsFiltered(userA, {
      status: "all",
      applied: "all",
      sort: "saved_newest",
      limit: 30,
    });
    const closed = page.items.find((j) => j.id === jobClosed);
    expect(closed).toBeTruthy();
    expect(closed!.isClosed).toBe(true);
    const active = page.items.find((j) => j.id === jobActive);
    expect(active!.isClosed).toBe(false);
  });

  it("filters status active/closed", async ({ skip }) => {
    if (!dbUp) skip();
    const active = await listSavedJobsFiltered(userA, {
      status: "active",
      applied: "all",
      sort: "saved_newest",
      limit: 30,
    });
    expect(active.items.every((j) => !j.isClosed)).toBe(true);
    expect(active.items.some((j) => j.id === jobClosed)).toBe(false);

    const closed = await listSavedJobsFiltered(userA, {
      status: "closed",
      applied: "all",
      sort: "saved_newest",
      limit: 30,
    });
    expect(closed.items.every((j) => j.isClosed)).toBe(true);
    expect(closed.items.some((j) => j.id === jobClosed)).toBe(true);
  });

  it("filters labels", async ({ skip }) => {
    if (!dbUp) skip();
    const openOnly = await listSavedJobsFiltered(userA, {
      status: "all",
      applied: "all",
      labels: ["open"],
      sort: "saved_newest",
      limit: 30,
    });
    expect(openOnly.items.every((j) => j.label === "open")).toBe(true);
    expect(openOnly.items.some((j) => j.id === jobLabelChange)).toBe(true);
  });

  it("sets labelChanged when label differs from labelAtSave", async ({
    skip,
  }) => {
    if (!dbUp) skip();
    const page = await listSavedJobsFiltered(userA, {
      status: "all",
      applied: "all",
      sort: "saved_newest",
      limit: 30,
    });
    const row = page.items.find((j) => j.id === jobLabelChange);
    expect(row?.labelChanged).toBe(true);
    expect(row?.labelAtSave).toBe("india_remote");
    expect(row?.label).toBe("open");
  });

  it("filters applied yes/no", async ({ skip }) => {
    if (!dbUp) skip();
    await setSavedApplied(userA, jobActive, true);
    const yes = await listSavedJobsFiltered(userA, {
      status: "all",
      applied: "yes",
      sort: "saved_newest",
      limit: 30,
    });
    expect(yes.items.every((j) => j.appliedAt != null)).toBe(true);
    expect(yes.items.some((j) => j.id === jobActive)).toBe(true);

    const no = await listSavedJobsFiltered(userA, {
      status: "all",
      applied: "no",
      sort: "saved_newest",
      limit: 30,
    });
    expect(no.items.every((j) => j.appliedAt == null)).toBe(true);
    await setSavedApplied(userA, jobActive, false);
  });

  it("paginates without duplicates", async ({ skip }) => {
    if (!dbUp) skip();
    const first = await listSavedJobsFiltered(userA, {
      status: "all",
      applied: "all",
      sort: "saved_newest",
      limit: 1,
    });
    if (!first.nextCursor) {
      expect(first.items.length).toBeLessThanOrEqual(1);
      return;
    }
    const second = await listSavedJobsFiltered(userA, {
      status: "all",
      applied: "all",
      sort: "saved_newest",
      limit: 1,
      cursor: first.nextCursor,
    });
    const ids = new Set([
      ...first.items.map((j) => j.id),
      ...second.items.map((j) => j.id),
    ]);
    expect(ids.size).toBe(first.items.length + second.items.length);
  });

  it("user B cannot see or modify user A saves", async ({ skip }) => {
    if (!dbUp) skip();
    const page = await listSavedJobsFiltered(userB, {
      status: "all",
      applied: "all",
      sort: "saved_newest",
      limit: 30,
    });
    expect(page.total).toBe(0);
    expect(page.items.length).toBe(0);

    const patch = await setSavedApplied(userB, jobActive, true);
    expect(patch.ok).toBe(false);
  });

  it("PATCH applied set/clear", async ({ skip }) => {
    if (!dbUp) skip();
    expect(PatchSavedBodySchema.parse({ applied: true }).applied).toBe(true);
    const on = await setSavedApplied(userA, jobActive, true);
    expect(on.ok).toBe(true);
    if (on.ok) expect(on.appliedAt).toBeTruthy();
    const off = await setSavedApplied(userA, jobActive, false);
    expect(off.ok).toBe(true);
    if (off.ok) expect(off.appliedAt).toBeNull();
  });

  it("CSV export has headers and row count", async ({ skip }) => {
    if (!dbUp) skip();
    const csv = await exportSavedJobsCsv(userA, {
      status: "all",
      applied: "all",
      sort: "saved_newest",
      limit: 30,
    });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "title,company,label,location,salary,applyUrl,savedAt,appliedAt,status",
    );
    const list = await listSavedJobsFiltered(userA, {
      status: "all",
      applied: "all",
      sort: "saved_newest",
      limit: 30,
    });
    expect(lines.length - 1).toBe(list.total);
  });

  it("MCP save_job then list shows the job", async ({ skip }) => {
    if (!dbUp) skip();
    const stamp = Date.now();
    const [extra] = await db
      .insert(jobs)
      .values({
        companyId,
        externalId: `mcp-saved-${stamp}`,
        title: "MCP Saved Role",
        descriptionText: "via mcp",
        applyUrl: "https://example.com/mcp",
        sourceAts: "greenhouse",
        contentHash: `mcp-${stamp}`,
      })
      .returning();
    await db.insert(jobTags).values({
      jobId: extra!.id,
      indiaEligibility: "open",
      classifier: "rule",
    });

    await mcpSaveJob(db, userA, extra!.id);
    const page = await listSavedJobsFiltered(userA, {
      status: "all",
      applied: "all",
      sort: "saved_newest",
      limit: 50,
    });
    expect(page.items.some((j) => j.id === extra!.id)).toBe(true);

    await db
      .delete(savedJobs)
      .where(
        and(eq(savedJobs.userId, userA), eq(savedJobs.jobId, extra!.id)),
      );
    await db.delete(jobs).where(eq(jobs.id, extra!.id));
  });
});
