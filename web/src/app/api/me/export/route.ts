import { corsPreflight, json, requireUser } from "@/lib/api-guard";
import { exportUserData } from "@/lib/me";

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  try {
    const data = await exportUserData(gate.userId);
    if (!data) {
      return json({ ok: false, error: "not_found" }, 404, gate.headers);
    }
    gate.headers.set(
      "Content-Disposition",
      `attachment; filename="applicable-export.json"`,
    );
    return json(data, 200, gate.headers);
  } catch (err) {
    console.error(
      "[api/me/export] GET",
      err instanceof Error ? err.message : err,
    );
    return json({ ok: false, error: "export_failed" }, 500, gate.headers);
  }
}
