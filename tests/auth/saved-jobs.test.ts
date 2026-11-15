import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, pool } from "../../src/db/client.js";
import { companies, jobs, users } from "../../src/db/schema.js";
import {
  listSavedJobs,
  saveJob,
  unsaveJob,
} from "../../src/auth/saved-jobs.js";
import {
  createMcpToken,
  resolveMcpTokenUserId,
  revokeMcpToken,
} from "../../src/auth/mcp-tokens.js";
import { SIGN_IN_TO_SAVE } from "../../src/mcp/auth-context.js";
import { createApplicableMcpServer } from "../../src/mcp/server.js";

describe("save_job auth messaging", () => {
  it("tells agents to sign in when no personal token", () => {
    expect(SIGN_IN_TO_SAVE).toBe(
      "Sign in at https://applicable.click to save jobs.",
    );
  });

  it("builds MCP server with and without userId", () => {
    expect(createApplicableMcpServer(db, { userId: null })).toBeTruthy();
    expect(
      createApplicableMcpServer(db, {
        userId: "11111111-1111-1111-1111-111111111111",
      }),
    ).toBeTruthy();
  });
});

describe("saved jobs + mcp tokens (db)", () => {
  let ready = false;
  let userId = "";
  let jobId = "";
  let companyId = "";

  beforeAll(async () => {
    try {
      await pool.query("select 1");
      ready = true;
    } catch {
      ready = false;
      return;
    }

    const [company] = await db
      .insert(companies)
      .values({
        name: `Auth Test Co ${Date.now()}`,
        website: "https://example.com",
        ats: "greenhouse",
        atsSlug: `auth-test-${Date.now()}`,
      })
      .returning();
    companyId = company!.id;

    const [job] = await db
      .insert(jobs)
      .values({
        companyId,
        externalId: `ext-${Date.now()}`,
        title: "Auth Test Engineer",
        descriptionText: "test",
        applyUrl: "https://example.com/jobs/1",
        sourceAts: "greenhouse",
        contentHash: `hash-${Date.now()}`,
      })
      .returning();
    jobId = job!.id;

    const [user] = await db
      .insert(users)
      .values({
        googleSub: `test-sub-${Date.now()}`,
        email: `test-${Date.now()}@example.com`,
        name: "Test User",
      })
      .returning();
    userId = user!.id;
  });

  afterAll(async () => {
    if (!ready) return;
    if (userId) await db.delete(users).where(eq(users.id, userId));
    if (companyId) await db.delete(companies).where(eq(companies.id, companyId));
  });

  it("save/unsave is idempotent", async ({ skip }) => {
    if (!ready) skip();
    const a = await saveJob(db, userId, jobId);
    expect(a.saved).toBe(true);
    expect(a.already).toBe(false);

    const b = await saveJob(db, userId, jobId);
    expect(b.saved).toBe(true);
    expect(b.already).toBe(true);

    const listed = await listSavedJobs(db, userId);
    expect(listed.some((j) => j.job_id === jobId)).toBe(true);

    const u1 = await unsaveJob(db, userId, jobId);
    expect(u1.removed).toBe(true);
    const u2 = await unsaveJob(db, userId, jobId);
    expect(u2.removed).toBe(false);
  });

  it("hashes tokens, resolves, and revokes", async ({ skip }) => {
    if (!ready) skip();
    const created = await createMcpToken(db, userId);
    expect(created.raw.startsWith("app_mcp_")).toBe(true);

    const resolved = await resolveMcpTokenUserId(db, created.raw);
    expect(resolved).toBe(userId);

    await revokeMcpToken(db, userId, created.token.id);
    const after = await resolveMcpTokenUserId(db, created.raw);
    expect(after).toBeNull();
  });
});
