import { z } from "zod";
import { signOut } from "@/auth";
import { corsPreflight, json, requireUser } from "@/lib/api-guard";
import { deleteAccount } from "@/lib/me";

const DeleteBodySchema = z.object({
  confirm: z.literal("delete"),
});

export async function DELETE(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = DeleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: "invalid_params",
        message: 'Type "delete" to confirm',
      },
      400,
      gate.headers,
    );
  }

  try {
    const ok = await deleteAccount(gate.userId);
    if (!ok) {
      return json({ ok: false, error: "not_found" }, 404, gate.headers);
    }
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
