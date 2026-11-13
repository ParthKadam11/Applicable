import { auth } from "@/auth";
import {
  applyMeCors,
  clientIp,
  corsPreflight,
  json,
} from "@/lib/api-guard";
import {
  createLabelReport,
  hashIp,
  ReportBodySchema,
} from "@/lib/jobs-api";
import { labelReportLimiter } from "@/lib/rate-limit";

type Ctx = { params: Promise<{ id: string }> };

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}

export async function POST(req: Request, ctx: Ctx) {
  const headers = new Headers();
  applyMeCors(req, headers);

  const ip = clientIp(req);
  if (!labelReportLimiter.allow(`report:${ip}`)) {
    return json({ ok: false, error: "rate_limit" }, 429, headers);
  }

  const { id } = await ctx.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return json({ ok: false, error: "invalid_params", message: "invalid id" }, 400, headers);
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = ReportBodySchema.safeParse(body);
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

  const session = await auth();
  const result = await createLabelReport({
    jobId: id,
    userId: session?.user?.id ?? null,
    suggestedLabel: parsed.data.suggestedLabel,
    note: parsed.data.note,
    ipHash: hashIp(ip),
  });

  if (!result.ok) {
    return json({ ok: false, error: "not_found" }, 404, headers);
  }

  return json({ ok: true, id: result.id }, 201, headers);
}
