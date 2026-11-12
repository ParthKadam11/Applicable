import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";

export type UpsertGoogleUserInput = {
  googleSub: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
};

export async function upsertGoogleUser(db: Db, input: UpsertGoogleUserInput) {
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

export async function getUserById(db: Db, id: string) {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function deleteUserAccount(db: Db, userId: string): Promise<boolean> {
  const deleted = await db
    .delete(users)
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return deleted.length > 0;
}
