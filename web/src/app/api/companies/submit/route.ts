import {
  applyMeCors,
  clientIp,
  corsPreflight,
  json,
} from "@/lib/api-guard";
import {
  SubmitCompanyBodySchema,
  submitCompanyUrl,
} from "@/lib/companies-api";
import { companySubmitLimiter } from "@/lib/rate-limit";

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(req: Request) {
  const headers = new Headers();
  applyMeCors(req, headers);

  const ip = clientIp(req);
  if (!companySubmitLimiter.allow(`company-submit:${ip}`)) {
    return json({ ok: false, error: "rate_limit" }, 429, headers);
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = SubmitCompanyBodySchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: "invalid_params",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      },
      400,
      headers,
    );
  }

  try {
    const result = await submitCompanyUrl(parsed.data.url);
    if (result.status === 202) {
      return json(
        { ok: true, status: "queued", candidateId: result.candidateId },
        202,
        headers,
      );
    }
    if (result.status === 409) {
      return json(
        { ok: false, error: "already_tracked" },
        409,
        headers,
      );
    }
    if (result.status === 422) {
      return json({ ok: false, error: "no_ats_found" }, 422, headers);
    }
    return json(
      { ok: false, error: "invalid_params", message: result.message },
      400,
      headers,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    console.error("[api/companies/submit]", message);
    return json({ ok: false, error: "server_error" }, 500, headers);
  }
}
