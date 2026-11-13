import {
  applyMeCors,
  clientIp,
  corsPreflight,
  json,
} from "@/lib/api-guard";
import { getJobById } from "@/lib/jobs-api";
import { ipApiLimiter } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request, ctx: Ctx) {
  const headers = new Headers();
  applyMeCors(req, headers);

  const ip = clientIp(req);
  if (!ipApiLimiter.allow(`jobs:${ip}`)) {
    return json({ ok: false, error: "rate_limit" }, 429, headers);
  }

  const { id } = await ctx.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return json({ ok: false, error: "invalid_params", message: "invalid id" }, 400, headers);
  }

  try {
    const job = await getJobById(id);
    if (!job) {
      return json({ ok: false, error: "not_found" }, 404, headers);
    }
    return json(job, 200, headers);
  } catch (err) {
    console.error("[api/jobs/:id]", err instanceof Error ? err.message : err);
    return json({ ok: false, error: "server_error" }, 500, headers);
  }
}
