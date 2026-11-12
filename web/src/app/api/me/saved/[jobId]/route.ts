import {
  corsPreflight,
  enforceUserSaveRate,
  json,
  requireUser,
} from "@/lib/api-guard";
import { saveJob, unsaveJob } from "@/lib/me";

type Ctx = { params: Promise<{ jobId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  const limited = enforceUserSaveRate(gate.userId, gate.headers);
  if (limited) return limited;
  const { jobId } = await ctx.params;
  try {
    const result = await saveJob(gate.userId, jobId);
    return json({ ok: true, ...result }, 200, gate.headers);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "job_not_found") {
      return json({ ok: false, error: "job_not_found" }, 404, gate.headers);
    }
    console.error("[api/me/saved/:id] POST", msg);
    return json({ ok: false, error: "save_failed" }, 500, gate.headers);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  const limited = enforceUserSaveRate(gate.userId, gate.headers);
  if (limited) return limited;
  const { jobId } = await ctx.params;
  try {
    const result = await unsaveJob(gate.userId, jobId);
    return json({ ok: true, ...result }, 200, gate.headers);
  } catch (err) {
    console.error(
      "[api/me/saved/:id] DELETE",
      err instanceof Error ? err.message : err,
    );
    return json({ ok: false, error: "unsave_failed" }, 500, gate.headers);
  }
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
