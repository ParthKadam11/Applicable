import { z } from "zod";

/** Client-safe filter schemas shared by /api/jobs and BYOK NL parser. No DB imports. */

export const LabelSchema = z.enum([
  "open",
  "india_remote",
  "india_onsite",
  "region_locked",
  "unclear",
]);

export const RoleSchema = z.enum([
  "backend",
  "frontend",
  "fullstack",
  "devops",
  "data",
  "mobile",
  "other",
]);

export const AtsSchema = z.enum(["ashby", "greenhouse", "lever"]);
export const PostedSchema = z.enum(["24h", "7d", "30d", "all"]);
export const SortSchema = z.enum(["newest", "last_seen", "company"]);

export const JobsFilterFieldsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  labels: z
    .array(LabelSchema)
    .min(1)
    .default(["open", "india_remote"]),
  role: RoleSchema.optional(),
  ats: AtsSchema.optional(),
  /** Public company slug — restrict results to one company. */
  company: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, "invalid company slug")
    .optional(),
  posted: PostedSchema.default("all"),
  has_salary: z.boolean().optional(),
  sort: SortSchema.default("newest"),
});

export type JobsFilterFields = z.infer<typeof JobsFilterFieldsSchema>;

export const JobsListQuerySchema = JobsFilterFieldsSchema.extend({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

export type JobsListQuery = z.infer<typeof JobsListQuerySchema>;

export type JobsCursorPayload = {
  sort: z.infer<typeof SortSchema>;
  v: string | null;
  id: string;
};

export function encodeJobsCursor(payload: JobsCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeJobsCursor(raw: string): JobsCursorPayload {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as JobsCursorPayload;
    if (!parsed?.id || !SortSchema.safeParse(parsed.sort).success) {
      throw new Error("bad_cursor");
    }
    return parsed;
  } catch {
    throw new Error("invalid_cursor");
  }
}

export function parseJobsListSearchParams(
  sp: URLSearchParams,
): { ok: true; data: JobsListQuery } | { ok: false; message: string } {
  const labelsRaw = sp.get("labels");
  const labels = labelsRaw
    ? labelsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const hasSalaryRaw = sp.get("has_salary");
  let has_salary: boolean | undefined;
  if (hasSalaryRaw != null && hasSalaryRaw !== "") {
    if (hasSalaryRaw === "true" || hasSalaryRaw === "1") has_salary = true;
    else if (hasSalaryRaw === "false" || hasSalaryRaw === "0")
      has_salary = false;
    else {
      return { ok: false, message: "has_salary must be true or false" };
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

  const parsed = JobsListQuerySchema.safeParse({
    q: sp.get("q") || undefined,
    labels,
    role: sp.get("role") || undefined,
    ats: sp.get("ats") || undefined,
    company: sp.get("company") || undefined,
    posted: sp.get("posted") || undefined,
    has_salary,
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
