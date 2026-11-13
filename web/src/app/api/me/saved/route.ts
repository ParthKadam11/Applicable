import {
  corsPreflight,
  enforceUserSaveRate,
  json,
  requireUser,
} from "@/lib/api-guard";
import { listSavedJobIds, saveJob } from "@/lib/me";
import {
  listSavedJobsFiltered,
  parseSavedListSearchParams,
} from "@/lib/saved-api";

export async function GET(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  try {
    const sp = new URL(req.url).searchParams;
    if (sp.get("ids") === "1") {
      const ids = await listSavedJobIds(gate.userId);
      return json({ ids }, 200, gate.headers);
    }

    const parsed = parseSavedListSearchParams(sp);
    if (!parsed.ok) {
      return json(
        { ok: false, error: "invalid_params", message: parsed.message },
        400,
        gate.headers,
      );
    }

    const data = await listSavedJobsFiltered(gate.userId, parsed.data);
    return json(data, 200, gate.headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    if (message === "invalid_cursor") {
      return json(
        { ok: false, error: "invalid_params", message: "invalid cursor" },
        400,
        gate.headers,
      );
    }
    console.error("[api/me/saved] GET", message);
    return json({ ok: false, error: "saved_list_failed" }, 500, gate.headers);
  }
}

/** POST body: { job_id } — convenience for clients without path param. */
export async function POST(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  const limited = enforceUserSaveRate(gate.userId, gate.headers);
  if (limited) return limited;
  try {
    const body = (await req.json().catch(() => null)) as {
      job_id?: string;
    } | null;
    const jobId = body?.job_id;
    if (!jobId || typeof jobId !== "string") {
      return json({ ok: false, error: "job_id_required" }, 400, gate.headers);
    }
    const result = await saveJob(gate.userId, jobId);
    return json({ ok: true, ...result }, 200, gate.headers);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "job_not_found") {
      return json({ ok: false, error: "job_not_found" }, 404, gate.headers);
    }
    console.error("[api/me/saved] POST", msg);
    return json({ ok: false, error: "save_failed" }, 500, gate.headers);
  }
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
