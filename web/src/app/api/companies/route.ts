import {
  applyMeCors,
  clientIp,
  corsPreflight,
  json,
} from "@/lib/api-guard";
import {
  listCompanies,
  parseCompaniesListSearchParams,
} from "@/lib/companies-api";
import { ipApiLimiter } from "@/lib/rate-limit";

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function GET(req: Request) {
  const headers = new Headers();
  applyMeCors(req, headers);

  const ip = clientIp(req);
  if (!ipApiLimiter.allow(`companies:${ip}`)) {
    return json({ ok: false, error: "rate_limit" }, 429, headers);
  }

  const url = new URL(req.url);
  const parsed = parseCompaniesListSearchParams(url.searchParams);
  if (!parsed.ok) {
    return json(
      { ok: false, error: "invalid_params", message: parsed.message },
      400,
      headers,
    );
  }

  try {
    const data = await listCompanies(parsed.data);
    return json(data, 200, headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    if (message === "invalid_cursor") {
      return json(
        { ok: false, error: "invalid_params", message: "invalid cursor" },
        400,
        headers,
      );
    }
    console.error("[api/companies]", message);
    return json({ ok: false, error: "server_error" }, 500, headers);
  }
}
