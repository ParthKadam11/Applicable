import {
  applyMeCors,
  clientIp,
  corsPreflight,
  json,
} from "@/lib/api-guard";
import { getCompanyBySlug } from "@/lib/companies-api";
import { ipApiLimiter } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ slug: string }> };

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request, ctx: Ctx) {
  const headers = new Headers();
  applyMeCors(req, headers);

  const ip = clientIp(req);
  if (!ipApiLimiter.allow(`companies:${ip}`)) {
    return json({ ok: false, error: "rate_limit" }, 429, headers);
  }

  const { slug } = await ctx.params;
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) {
    return json(
      { ok: false, error: "invalid_params", message: "invalid slug" },
      400,
      headers,
    );
  }

  try {
    const company = await getCompanyBySlug(slug);
    if (!company) {
      return json({ ok: false, error: "not_found" }, 404, headers);
    }
    return json(company, 200, headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    console.error("[api/companies/:slug]", message);
    return json({ ok: false, error: "server_error" }, 500, headers);
  }
}
