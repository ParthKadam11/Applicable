import { z } from "zod";
import { AtsSchema } from "@/lib/jobs-filters";

/** Client-safe filter schemas for /api/companies. No DB imports. */

export const CompaniesSortSchema = z.enum([
  "most_open",
  "most_jobs",
  "name",
  "recently_added",
]);

export const CompaniesListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  ats: AtsSchema.optional(),
  has_open: z.boolean().default(true),
  sort: CompaniesSortSchema.default("most_open"),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

export type CompaniesListQuery = z.infer<typeof CompaniesListQuerySchema>;

export type CompaniesCursorPayload = {
  sort: z.infer<typeof CompaniesSortSchema>;
  /** Sort value: number as string, name, or ISO date. */
  v: string | null;
  id: string;
};

export function encodeCompaniesCursor(payload: CompaniesCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCompaniesCursor(raw: string): CompaniesCursorPayload {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as CompaniesCursorPayload;
    if (!parsed?.id || !CompaniesSortSchema.safeParse(parsed.sort).success) {
      throw new Error("bad_cursor");
    }
    return parsed;
  } catch {
    throw new Error("invalid_cursor");
  }
}

export function parseCompaniesListSearchParams(
  sp: URLSearchParams,
): { ok: true; data: CompaniesListQuery } | { ok: false; message: string } {
  const hasOpenRaw = sp.get("has_open");
  let has_open: boolean | undefined;
  if (hasOpenRaw != null && hasOpenRaw !== "") {
    if (hasOpenRaw === "true" || hasOpenRaw === "1") has_open = true;
    else if (hasOpenRaw === "false" || hasOpenRaw === "0") has_open = false;
    else {
      return { ok: false, message: "has_open must be true or false" };
    }
  }

  const limitRaw = sp.get("limit");
  let limit: number | undefined;
  if (limitRaw != null && limitRaw !== "") {
    const n = Number(limitRaw);
    if (!Number.isFinite(n)) {
      return { ok: false, message: "limit must be a number" };
    }
    limit = n;
  }

  const parsed = CompaniesListQuerySchema.safeParse({
    q: sp.get("q") || undefined,
    ats: sp.get("ats") || undefined,
    has_open,
    sort: sp.get("sort") || undefined,
    cursor: sp.get("cursor") || undefined,
    limit,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  return { ok: true, data: parsed.data };
}

export const SubmitCompanyBodySchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), {
      message: "url must use http or https",
    }),
});
