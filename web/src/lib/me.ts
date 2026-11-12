import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  companies,
  jobTags,
  jobs,
  mcpTokens,
  savedJobs,
  users,
} from "@/db/schema";
import type { McpTokenPublic, SavedJobRow } from "@/lib/me-types";

export type { McpTokenPublic, SavedJobRow };

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
  const inserted = await db
    .insert(savedJobs)
    .values({ userId, jobId })
    .onConflictDoNothing()
    .returning({ jobId: savedJobs.jobId });
  return { saved: true as const, already: inserted.length === 0 };
}

export async function unsaveJob(userId: string, jobId: string) {
  const deleted = await db
    .delete(savedJobs)
    .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)))
    .returning({ jobId: savedJobs.jobId });
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

export async function deleteAccount(userId: string) {
  const deleted = await db
    .delete(users)
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return deleted.length > 0;
}
