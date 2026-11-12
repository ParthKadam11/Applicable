import { signOut } from "@/auth";
import { corsPreflight, json, requireUser } from "@/lib/api-guard";
import { deleteAccount } from "@/lib/me";

export async function DELETE(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  try {
    const ok = await deleteAccount(gate.userId);
    if (!ok) {
      return json({ ok: false, error: "not_found" }, 404, gate.headers);
    }
    // Best-effort cookie clear; client should also call signOut.
    try {
      await signOut({ redirect: false });
    } catch {
      /* ignore */
    }
    return json({ ok: true }, 200, gate.headers);
  } catch (err) {
    console.error(
      "[api/me/account] DELETE",
      err instanceof Error ? err.message : err,
    );
    return json({ ok: false, error: "delete_failed" }, 500, gate.headers);
  }
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
