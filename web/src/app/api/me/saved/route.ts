import {
  corsPreflight,
  enforceUserSaveRate,
  json,
  requireUser,
} from "@/lib/api-guard";
import { listSavedJobIds, listSavedJobs, saveJob } from "@/lib/me";

export async function GET(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  try {
    const idsOnly = new URL(req.url).searchParams.get("ids") === "1";
    if (idsOnly) {
      const ids = await listSavedJobIds(gate.userId);
      return json({ ids }, 200, gate.headers);
    }
    const results = await listSavedJobs(gate.userId);
    return json({ results, count: results.length }, 200, gate.headers);
  } catch (err) {
    console.error("[api/me/saved] GET", err instanceof Error ? err.message : err);
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
