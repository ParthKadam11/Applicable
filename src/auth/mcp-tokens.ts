import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { mcpTokens } from "../db/schema.js";

const TOKEN_PREFIX = "app_mcp_";

export function hashMcpToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function generateRawMcpToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export type McpTokenPublic = {
  id: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  active: boolean;
};

export async function createMcpToken(
  db: Db,
  userId: string,
): Promise<{ token: McpTokenPublic; raw: string }> {
  // Revoke any active tokens first (one active personal token).
  await db
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)));

  const raw = generateRawMcpToken();
  const tokenHash = hashMcpToken(raw);
  const [row] = await db
    .insert(mcpTokens)
    .values({ userId, tokenHash })
    .returning();

  return {
    raw,
    token: {
      id: row!.id,
      created_at: row!.createdAt.toISOString(),
      last_used_at: null,
      revoked_at: null,
      active: true,
    },
  };
}

export async function listMcpTokens(
  db: Db,
  userId: string,
): Promise<McpTokenPublic[]> {
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

export async function revokeMcpToken(
  db: Db,
  userId: string,
  tokenId?: string,
): Promise<{ revoked: number }> {
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

/**
 * Resolve a bearer / query token to a user id. Updates last_used_at.
 * Never log or return the raw token.
 */
export async function resolveMcpTokenUserId(
  db: Db,
  rawToken: string | undefined | null,
): Promise<string | null> {
  if (!rawToken || typeof rawToken !== "string") return null;
  const trimmed = rawToken.trim();
  if (!trimmed.startsWith(TOKEN_PREFIX) || trimmed.length < 20) return null;

  const tokenHash = hashMcpToken(trimmed);
  const rows = await db
    .select({
      id: mcpTokens.id,
      userId: mcpTokens.userId,
      revokedAt: mcpTokens.revokedAt,
      lastUsedAt: mcpTokens.lastUsedAt,
    })
    .from(mcpTokens)
    .where(eq(mcpTokens.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row || row.revokedAt) return null;

  // Throttle last_used_at writes to once per minute per token.
  const last = row.lastUsedAt?.getTime() ?? 0;
  if (Date.now() - last >= 60_000) {
    await db
      .update(mcpTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(mcpTokens.id, row.id));
  }

  return row.userId;
}

export function extractBearerToken(
  authorization: string | undefined,
  queryToken: unknown,
): string | null {
  if (typeof authorization === "string") {
    const m = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
    if (m?.[1]) return m[1];
  }
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }
  return null;
}
