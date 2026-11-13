import { corsPreflight, requireUser } from "@/lib/api-guard";
import {
  exportSavedJobsCsv,
  parseSavedListSearchParams,
} from "@/lib/saved-api";

export async function GET(req: Request) {
  const gate = await requireUser(req);
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  if (format !== "csv") {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "invalid_params",
        message: "format must be csv",
      }),
      {
        status: 400,
        headers: {
          ...Object.fromEntries(gate.headers.entries()),
          "Content-Type": "application/json",
        },
      },
    );
  }

  const parsed = parseSavedListSearchParams(url.searchParams);
  if (!parsed.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "invalid_params",
        message: parsed.message,
      }),
      {
        status: 400,
        headers: {
          ...Object.fromEntries(gate.headers.entries()),
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    const csv = await exportSavedJobsCsv(gate.userId, parsed.data);
    const headers = new Headers(gate.headers);
    headers.set("Content-Type", "text/csv; charset=utf-8");
    headers.set(
      "Content-Disposition",
      'attachment; filename="applicable-saved-jobs.csv"',
    );
    return new Response(csv, { status: 200, headers });
  } catch (err) {
    console.error(
      "[api/me/saved/export]",
      err instanceof Error ? err.message : err,
    );
    return new Response(
      JSON.stringify({ ok: false, error: "export_failed" }),
      {
        status: 500,
        headers: {
          ...Object.fromEntries(gate.headers.entries()),
          "Content-Type": "application/json",
        },
      },
    );
  }
}

export async function OPTIONS(req: Request) {
  return corsPreflight(req);
}
