import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/auth", () => ({
  auth: async () => null,
  signOut: async () => undefined,
}));

import {
  normalizePreferences,
  PatchPreferencesSchema,
  UserPreferencesSchema,
} from "../../web/src/lib/preferences.ts";
import { parseJobsListSearchParams } from "../../web/src/lib/jobs-filters.ts";
import {
  createMcpToken,
  deleteAccount,
  exportUserData,
  getPreferences,
  hashMcpToken,
  updatePreferences,
} from "../../web/src/lib/me.ts";
import {
  resolveMcpTokenUserId,
} from "../../src/auth/mcp-tokens.js";
import { GET as getPrefs } from "../../web/src/app/api/me/preferences/route.ts";
import { PATCH as patchPrefs } from "../../web/src/app/api/me/preferences/route.ts";
import { GET as getExport } from "../../web/src/app/api/me/export/route.ts";
import { GET as getProfile } from "../../web/src/app/api/me/profile/route.ts";
import { GET as getMcpToken } from "../../web/src/app/api/me/mcp-token/route.ts";
import { DELETE as deleteAccountRoute } from "../../web/src/app/api/me/account/route.ts";
import { GET as getSaved } from "../../web/src/app/api/me/saved/route.ts";
import { db, pool } from "../../src/db/client.js";
import {
  companies,
  jobTags,
  jobs,
  labelReports,
  mcpTokens,
  savedJobs,
  users,
} from "../../src/db/schema.js";

let dbUp = false;
const stamp = Date.now();
let userA = "";
let userB = "";
let companyId = "";
let jobId = "";
let reportId = "";

beforeAll(async () => {
  try {
    await pool.query("select 1");
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}'::jsonb NOT NULL;
      ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
    `);
    dbUp = true;
  } catch {
    dbUp = false;
    return;
  }

  const [a] = await db
    .insert(users)
    .values({
      googleSub: `settings-a-${stamp}`,
      email: `settings-a-${stamp}@example.com`,
      name: "Settings A",
      avatarUrl: "https://example.com/a.png",
      preferences: {},
    })
    .returning();
  userA = a!.id;

  const [b] = await db
    .insert(users)
    .values({
      googleSub: `settings-b-${stamp}`,
      email: `settings-b-${stamp}@example.com`,
      name: "Settings B",
      preferences: {},
    })
    .returning();
  userB = b!.id;

  const [co] = await db
    .insert(companies)
    .values({
      name: `Settings Co ${stamp}`,
      website: "https://example.com",
      ats: "greenhouse",
      atsSlug: `settings-co-${stamp}`,
      slug: `settings-co-${stamp}`,
    })
    .returning();
  companyId = co!.id;

  const [job] = await db
    .insert(jobs)
    .values({
      companyId,
      externalId: `settings-job-${stamp}`,
      title: "Backend",
      descriptionText: "ts",
      applyUrl: "https://example.com/j",
      sourceAts: "greenhouse",
      contentHash: `settings-hash-${stamp}`,
    })
    .returning();
  jobId = job!.id;
  await db.insert(jobTags).values({
    jobId,
    indiaEligibility: "open",
    roleFamily: "backend",
    classifier: "rule",
  });

  await db.insert(savedJobs).values({ userId: userA, jobId });
  const [rep] = await db
    .insert(labelReports)
    .values({
      jobId,
      userId: userA,
      note: "settings test",
      ipHash: "abc",
    })
    .returning();
  reportId = rep!.id;
});

afterAll(async () => {
  if (!dbUp) return;
  if (reportId) {
    await db.delete(labelReports).where(eq(labelReports.id, reportId));
  }
  if (userA) {
    await db.delete(users).where(eq(users.id, userA));
  }
  if (userB) {
    await db.delete(users).where(eq(users.id, userB));
  }
  if (companyId) {
    await db.delete(companies).where(eq(companies.id, companyId));
  }
});

describe("preferences schema", () => {
  it("defaults empty object", () => {
    const p = normalizePreferences({});
    expect(p.defaultLabels).toEqual([
      "open",
      "india_remote",
      "india_onsite",
    ]);
    expect(p.defaultRoles).toEqual([]);
    expect(p.hideNoSalary).toBe(false);
    expect(UserPreferencesSchema.parse({}).defaultLabels).toEqual([
      "open",
      "india_remote",
      "india_onsite",
    ]);
  });

  it("rejects invalid PATCH", () => {
    expect(
      PatchPreferencesSchema.safeParse({ defaultLabels: ["nope"] }).success,
    ).toBe(false);
    expect(
      PatchPreferencesSchema.safeParse({ hideNoSalary: "yes" }).success,
    ).toBe(false);
    expect(
      PatchPreferencesSchema.safeParse({ extra: true }).success,
    ).toBe(false);
  });
});

describe("Jobs API preferences merge", () => {
  it("uses preferences only when URL param absent", () => {
    const prefs = {
      defaultLabels: ["india_onsite"] as const,
      defaultRoles: ["backend"] as const,
      hideNoSalary: true,
    };

    const withPrefs = parseJobsListSearchParams(
      new URLSearchParams(),
      prefs,
    );
    expect(withPrefs.ok).toBe(true);
    if (!withPrefs.ok) return;
    expect(withPrefs.data.labels).toEqual(["india_onsite"]);
    expect(withPrefs.data.role).toBe("backend");
    expect(withPrefs.data.has_salary).toBe(true);

    const urlWins = parseJobsListSearchParams(
      new URLSearchParams({
        labels: "open",
        role: "frontend",
        has_salary: "false",
      }),
      prefs,
    );
    expect(urlWins.ok).toBe(true);
    if (!urlWins.ok) return;
    expect(urlWins.data.labels).toEqual(["open"]);
    expect(urlWins.data.role).toBe("frontend");
    expect(urlWins.data.has_salary).toBe(false);

    const multi = parseJobsListSearchParams(new URLSearchParams(), {
      defaultLabels: ["open", "india_remote"],
      defaultRoles: ["backend", "frontend"],
      hideNoSalary: false,
    });
    expect(multi.ok).toBe(true);
    if (!multi.ok) return;
    expect(multi.data.roles).toEqual(["backend", "frontend"]);
    expect(multi.data.role).toBeUndefined();
  });
});

describe("401 signed out on /api/me/*", () => {
  it("returns 401 for preferences, export, profile, mcp-token, saved, account", async () => {
    const routes = [
      getPrefs(new Request("http://localhost/api/me/preferences")),
      patchPrefs(
        new Request("http://localhost/api/me/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      ),
      getExport(new Request("http://localhost/api/me/export")),
      getProfile(new Request("http://localhost/api/me/profile")),
      getMcpToken(new Request("http://localhost/api/me/mcp-token")),
      getSaved(new Request("http://localhost/api/me/saved")),
      deleteAccountRoute(
        new Request("http://localhost/api/me/account", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: "delete" }),
        }),
      ),
    ];
    const results = await Promise.all(routes);
    for (const res of results) {
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toBe("unauthorized");
    }
  });
});

describe("preferences + token + export + delete (db)", () => {
  it("PATCH preferences and GET defaults", async ({ skip }) => {
    if (!dbUp) skip();
    const before = await getPreferences(userA);
    // Defaults: open + india_remote + india_onsite (actionable for India applicants).
    expect(before.defaultLabels).toEqual([
      "open",
      "india_remote",
      "india_onsite",
    ]);

    const updated = await updatePreferences(userA, {
      defaultLabels: ["open"],
      defaultRoles: ["backend"],
      hideNoSalary: true,
    });
    expect(updated?.defaultLabels).toEqual(["open"]);
    expect(updated?.defaultRoles).toEqual(["backend"]);
    expect(updated?.hideNoSalary).toBe(true);
    expect((await getPreferences(userA)).hideNoSalary).toBe(true);
  });

  it("token plaintext once, hash stored, regenerate revokes, last_used throttled", async ({
    skip,
  }) => {
    if (!dbUp) skip();
    const first = await createMcpToken(userA);
    expect(first.raw.startsWith("app_mcp_")).toBe(true);
    const hash = hashMcpToken(first.raw);

    const [row] = await db
      .select()
      .from(mcpTokens)
      .where(eq(mcpTokens.id, first.token.id));
    expect(row!.tokenHash).toBe(hash);
    expect(row!.tokenHash).not.toBe(first.raw);

    const uid = await resolveMcpTokenUserId(db, first.raw);
    expect(uid).toBe(userA);
    const [afterUse] = await db
      .select({ lastUsedAt: mcpTokens.lastUsedAt })
      .from(mcpTokens)
      .where(eq(mcpTokens.id, first.token.id));
    expect(afterUse!.lastUsedAt).toBeTruthy();

    // Immediate second resolve should not error (throttle still allows read)
    expect(await resolveMcpTokenUserId(db, first.raw)).toBe(userA);

    const second = await createMcpToken(userA);
    expect(await resolveMcpTokenUserId(db, first.raw)).toBeNull();
    expect(await resolveMcpTokenUserId(db, second.raw)).toBe(userA);

    const [old] = await db
      .select({ revokedAt: mcpTokens.revokedAt })
      .from(mcpTokens)
      .where(eq(mcpTokens.id, first.token.id));
    expect(old!.revokedAt).toBeTruthy();
  });

  it("export has no token hash and only this user's data", async ({ skip }) => {
    if (!dbUp) skip();
    await db.insert(savedJobs).values({ userId: userB, jobId }).onConflictDoNothing();

    const data = await exportUserData(userA);
    expect(data).toBeTruthy();
    const json = JSON.stringify(data);
    expect(json).not.toMatch(/tokenHash|token_hash|"hash"/i);
    expect(data!.profile.email).toContain("settings-a-");
    expect(data!.savedJobs.every((j) => j.jobId === jobId)).toBe(true);
    expect(data!.mcpTokens.every((t) => t.id && !("tokenHash" in t))).toBe(
      true,
    );

    const dataB = await exportUserData(userB);
    expect(dataB!.profile.email).toContain("settings-b-");
    expect(dataB!.profile.email).not.toBe(data!.profile.email);
  });

  it("delete account removes user rows and anonymizes reports; isolation", async ({
    skip,
  }) => {
    if (!dbUp) skip();

    // Ensure B still has a save
    await db
      .insert(savedJobs)
      .values({ userId: userB, jobId })
      .onConflictDoNothing();

    const ok = await deleteAccount(userA);
    expect(ok).toBe(true);

    const [gone] = await db.select().from(users).where(eq(users.id, userA));
    expect(gone).toBeUndefined();

    const aSaved = await db
      .select()
      .from(savedJobs)
      .where(eq(savedJobs.userId, userA));
    expect(aSaved).toHaveLength(0);

    const aTokens = await db
      .select()
      .from(mcpTokens)
      .where(eq(mcpTokens.userId, userA));
    expect(aTokens).toHaveLength(0);

    const [rep] = await db
      .select()
      .from(labelReports)
      .where(eq(labelReports.id, reportId));
    expect(rep!.userId).toBeNull();

    const [stillB] = await db.select().from(users).where(eq(users.id, userB));
    expect(stillB).toBeTruthy();
    const bSaved = await db
      .select()
      .from(savedJobs)
      .where(eq(savedJobs.userId, userB));
    expect(bSaved.length).toBeGreaterThanOrEqual(1);

    // prevent afterAll double-delete
    userA = "";
  });
});
