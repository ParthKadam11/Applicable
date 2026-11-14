import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  companies,
  jobTags,
  jobs,
  labelReports,
  mcpTokens,
  savedJobs,
  users,
} from "@/db/schema";
import type { McpTokenPublic, SavedJobRow } from "@/lib/me-types";
import {
  DEFAULT_PREFERENCES,
  mergePreferences,
  normalizePreferences,
  type PatchPreferences,
  type UserPreferences,
} from "@/lib/preferences";

export type { McpTokenPublic, SavedJobRow, UserPreferences };

const TOKEN_PREFIX = "app_mcp_";

export function hashMcpToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function generateRawMcpToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export async function upsertGoogleUser(input: {
  googleSub: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}) {
  const now = new Date();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.googleSub, input.googleSub))
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(users)
      .set({
        email: input.email,
        name: input.name ?? existing[0].name,
        avatarUrl: input.avatarUrl ?? existing[0].avatarUrl,
        lastLoginAt: now,
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    return row!;
  }

  const [row] = await db
    .insert(users)
    .values({
      googleSub: input.googleSub,
      email: input.email,
      name: input.name ?? null,
      avatarUrl: input.avatarUrl ?? null,
      createdAt: now,
      lastLoginAt: now,
    })
    .returning();
  return row!;
}

export async function saveJob(userId: string, jobId: string) {
  const exists = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!exists[0]) {
    throw new Error("job_not_found");
  }
  const [tag] = await db
    .select({ label: jobTags.indiaEligibility })
    .from(jobTags)
    .where(eq(jobTags.jobId, jobId))
    .limit(1);
  const inserted = await db
    .insert(savedJobs)
    .values({
      userId,
      jobId,
      labelAtSave: tag?.label ?? null,
    })
    .onConflictDoNothing()
    .returning({ jobId: savedJobs.jobId });
  if (inserted.length > 0) {
    const { addSavedEdge, scheduleGraphSaved } = await import(
      "@/lib/graph-saved"
    );
    scheduleGraphSaved(() => addSavedEdge(userId, jobId));
  }
  return { saved: true as const, already: inserted.length === 0 };
}

export async function unsaveJob(userId: string, jobId: string) {
  const deleted = await db
    .delete(savedJobs)
    .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)))
    .returning({ jobId: savedJobs.jobId });
  if (deleted.length > 0) {
    const { removeSavedEdge, scheduleGraphSaved } = await import(
      "@/lib/graph-saved"
    );
    scheduleGraphSaved(() => removeSavedEdge(userId, jobId));
  }
  return { removed: deleted.length > 0 };
}

export async function listSavedJobIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ jobId: savedJobs.jobId })
    .from(savedJobs)
    .where(eq(savedJobs.userId, userId));
  return rows.map((r) => r.jobId);
}

export async function listSavedJobs(userId: string): Promise<SavedJobRow[]> {
  const rows = await db
    .select({
      jobId: savedJobs.jobId,
      savedAt: savedJobs.createdAt,
      title: jobs.title,
      company: companies.name,
      location: jobs.locationRaw,
      applyUrl: jobs.applyUrl,
      closedAt: jobs.closedAt,
      eligibility: jobTags.indiaEligibility,
      evidence: jobTags.eligibilityEvidence,
      jobPresent: jobs.id,
    })
    .from(savedJobs)
    .leftJoin(jobs, eq(jobs.id, savedJobs.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(eq(savedJobs.userId, userId))
    .orderBy(desc(savedJobs.createdAt));

  return rows.map((r) => {
    let status: SavedJobRow["status"] = "open";
    if (!r.jobPresent) status = "removed";
    else if (r.closedAt) status = "closed";
    return {
      job_id: r.jobId,
      title: r.title ?? "Removed job",
      company: r.company ?? "-",
      location: r.location ?? null,
      eligibility: r.eligibility ?? null,
      evidence: r.evidence ?? null,
      apply_url: r.applyUrl ?? "#",
      saved_at: r.savedAt.toISOString(),
      status,
    };
  });
}

export async function createMcpToken(userId: string) {
  await db
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)));

  const raw = generateRawMcpToken();
  const [row] = await db
    .insert(mcpTokens)
    .values({ userId, tokenHash: hashMcpToken(raw) })
    .returning();

  return {
    raw,
    token: {
      id: row!.id,
      created_at: row!.createdAt.toISOString(),
      last_used_at: null,
      revoked_at: null,
      active: true,
    } satisfies McpTokenPublic,
  };
}

export async function listMcpTokens(userId: string): Promise<McpTokenPublic[]> {
  const rows = await db
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.userId, userId))
    .orderBy(desc(mcpTokens.createdAt));
  return rows.map((r) => ({
    id: r.id,
    created_at: r.createdAt.toISOString(),
    last_used_at: r.lastUsedAt?.toISOString() ?? null,
    revoked_at: r.revokedAt?.toISOString() ?? null,
    active: r.revokedAt == null,
  }));
}

export async function revokeMcpTokens(userId: string, tokenId?: string) {
  const where = tokenId
    ? and(
        eq(mcpTokens.userId, userId),
        eq(mcpTokens.id, tokenId),
        isNull(mcpTokens.revokedAt),
      )
    : and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt));
  const updated = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(where)
    .returning({ id: mcpTokens.id });
  return { revoked: updated.length };
}

export async function getUserProfile(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      preferences: users.preferences,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt.toISOString(),
    preferences: normalizePreferences(row.preferences),
  };
}

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const [row] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return { ...DEFAULT_PREFERENCES };
  return normalizePreferences(row.preferences);
}

export async function updatePreferences(
  userId: string,
  patch: PatchPreferences,
): Promise<UserPreferences | null> {
  const current = await getPreferences(userId);
  const next = mergePreferences(current, patch);
  const updated = await db
    .update(users)
    .set({ preferences: next })
    .where(eq(users.id, userId))
    .returning({ id: users.id, preferences: users.preferences });
  if (!updated[0]) return null;
  return normalizePreferences(updated[0].preferences);
}

export async function exportUserData(userId: string) {
  const profile = await getUserProfile(userId);
  if (!profile) return null;

  const saved = await db
    .select({
      jobId: savedJobs.jobId,
      savedAt: savedJobs.createdAt,
      labelAtSave: savedJobs.labelAtSave,
      appliedAt: savedJobs.appliedAt,
      title: jobs.title,
      company: companies.name,
      applyUrl: jobs.applyUrl,
      closedAt: jobs.closedAt,
      eligibility: jobTags.indiaEligibility,
    })
    .from(savedJobs)
    .leftJoin(jobs, eq(jobs.id, savedJobs.jobId))
    .leftJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(eq(savedJobs.userId, userId))
    .orderBy(desc(savedJobs.createdAt));

  const tokens = await listMcpTokens(userId);

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      memberSince: profile.createdAt,
    },
    preferences: profile.preferences,
    savedJobs: saved.map((r) => ({
      jobId: r.jobId,
      title: r.title ?? null,
      company: r.company ?? null,
      applyUrl: r.applyUrl ?? null,
      eligibility: r.eligibility ?? null,
      labelAtSave: r.labelAtSave ?? null,
      savedAt: r.savedAt.toISOString(),
      appliedAt: r.appliedAt?.toISOString() ?? null,
      isClosed: r.closedAt != null,
    })),
    mcpTokens: tokens.map((t) => ({
      id: t.id,
      createdAt: t.created_at,
      lastUsedAt: t.last_used_at,
      revokedAt: t.revoked_at,
      active: t.active,
    })),
  };
}

export async function deleteAccount(userId: string) {
  // Anonymize reports first (FK is ON DELETE SET NULL, but be explicit).
  await db
    .update(labelReports)
    .set({ userId: null })
    .where(eq(labelReports.userId, userId));

  // Drop personal graph SAVED edges before cascade delete (best-effort).
  const { removeUserFromGraph, scheduleGraphSaved } = await import(
    "@/lib/graph-saved"
  );
  scheduleGraphSaved(() => removeUserFromGraph(userId));

  // saved_jobs + mcp_tokens cascade on user delete
  const deleted = await db
    .delete(users)
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return deleted.length > 0;
}
