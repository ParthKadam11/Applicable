import type { Db } from "../db/client.js";
import {
  extractBearerToken,
  resolveMcpTokenUserId,
} from "../auth/mcp-tokens.js";

export type McpAuthContext = {
  userId: string | null;
};

export async function resolveMcpAuth(
  db: Db,
  authorization: string | undefined,
  queryToken: unknown,
): Promise<McpAuthContext> {
  const raw = extractBearerToken(authorization, queryToken);
  if (!raw) return { userId: null };
  const userId = await resolveMcpTokenUserId(db, raw);
  return { userId };
}

export const SIGN_IN_TO_SAVE =
  "Sign in at https://applicable.click to save jobs.";
