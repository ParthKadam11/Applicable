import { corsPreflight, json, requireUser } from "@/lib/api-guard";
import { getPreferences, updatePreferences } from "@/lib/me";
import { PatchPreferencesSchema } from "@/lib/preferences";

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  try {
    const preferences = await getPreferences(gate.userId);
    return json({ preferences }, 200, gate.headers);
  } catch (err) {
    console.error(
      "[api/me/preferences] GET",
      err instanceof Error ? err.message : err,
    );
    return json({ ok: false, error: "preferences_failed" }, 500, gate.headers);
  }
}

export async function PATCH(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = PatchPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: "invalid_params",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      },
      400,
      gate.headers,
    );
  }

  try {
    const preferences = await updatePreferences(gate.userId, parsed.data);
    if (!preferences) {
      return json({ ok: false, error: "not_found" }, 404, gate.headers);
    }
    return json({ ok: true, preferences }, 200, gate.headers);
  } catch (err) {
    console.error(
      "[api/me/preferences] PATCH",
      err instanceof Error ? err.message : err,
    );
    return json({ ok: false, error: "preferences_failed" }, 500, gate.headers);
  }
}
