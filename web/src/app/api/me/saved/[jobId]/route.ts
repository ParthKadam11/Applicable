import {
  corsPreflight,
  enforceUserSaveRate,
  json,
  requireUser,
} from "@/lib/api-guard";
import { saveJob, unsaveJob } from "@/lib/me";
import { PatchSavedBodySchema, setSavedApplied } from "@/lib/saved-api";

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

export async function PATCH(req: Request, ctx: Ctx) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;
  const limited = enforceUserSaveRate(gate.userId, gate.headers);
  if (limited) return limited;
  const { jobId } = await ctx.params;

  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
    return json(
      { ok: false, error: "invalid_params", message: "invalid id" },
      400,
      gate.headers,
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = PatchSavedBodySchema.safeParse(body);
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

  const result = await setSavedApplied(
    gate.userId,
    jobId,
    parsed.data.applied,
  );
  if (!result.ok) {
    return json({ ok: false, error: "not_found" }, 404, gate.headers);
  }
  return json(
    { ok: true, applied: parsed.data.applied, appliedAt: result.appliedAt },
    200,
    gate.headers,
  );
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
