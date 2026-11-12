import { corsPreflight, json, requireUser } from "@/lib/api-guard";
import {
  createMcpToken,
  listMcpTokens,
  revokeMcpTokens,
} from "@/lib/me";
import { MCP_URL } from "@/lib/constants";

export async function GET(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  try {
    const tokens = await listMcpTokens(gate.userId);
    return json(
      {
        tokens,
        mcp_base: MCP_URL,
      },
      200,
      gate.headers,
    );
  } catch (err) {
    console.error(
      "[api/me/mcp-token] GET",
      err instanceof Error ? err.message : err,
    );
    return json({ ok: false, error: "token_list_failed" }, 500, gate.headers);
  }
}

export async function POST(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  try {
    const created = await createMcpToken(gate.userId);
    const personalUrl = `${MCP_URL}?token=${encodeURIComponent(created.raw)}`;
    return json(
      {
        ok: true,
        token: created.token,
        /** Shown once. Never logged server-side. */
        raw: created.raw,
        mcp_url: personalUrl,
      },
      200,
      gate.headers,
    );
  } catch (err) {
    console.error(
      "[api/me/mcp-token] POST",
      err instanceof Error ? err.message : err,
    );
    return json({ ok: false, error: "token_create_failed" }, 500, gate.headers);
  }
}

export async function DELETE(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  try {
    const url = new URL(req.url);
    const tokenId = url.searchParams.get("id") ?? undefined;
    const result = await revokeMcpTokens(gate.userId, tokenId);
    return json({ ok: true, ...result }, 200, gate.headers);
  } catch (err) {
    console.error(
      "[api/me/mcp-token] DELETE",
      err instanceof Error ? err.message : err,
    );
    return json({ ok: false, error: "token_revoke_failed" }, 500, gate.headers);
  }
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
