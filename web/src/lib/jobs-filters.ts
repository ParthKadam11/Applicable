import { z } from "zod";

/** Client-safe filter schemas shared by /api/jobs and BYOK NL parser. No DB imports. */

export const LabelSchema = z.enum([
  "open",
  "india_remote",
  "india_onsite",
  "region_locked",
  "unclear",
]);

/** Every eligibility label — used for “All” filter / uncapped jobs list. */
export const ALL_LABELS = LabelSchema.options;

export const RoleSchema = z.enum([
  "backend",
  "frontend",
  "fullstack",
  "devops",
  "data",
  "mobile",
  "other",
]);

export const AtsSchema = z.enum([
  "ashby",
  "greenhouse",
  "lever",
  "smartrecruiters",
]);
export const PostedSchema = z.enum(["24h", "7d", "30d", "all"]);
export const SortSchema = z.enum(["newest", "last_seen", "company"]);

/** Default list: roles an India applicant can act on (not region_locked/unclear). */
export const DEFAULT_JOB_LABELS = [
  "open",
  "india_remote",
  "india_onsite",
] as const satisfies ReadonlyArray<z.infer<typeof LabelSchema>>;

export const JobsFilterFieldsSchema = z.object({
  q: z.string().trim().max(200).optional(),
  labels: z
    .array(LabelSchema)
    .min(1)
    .default([...DEFAULT_JOB_LABELS]),
  role: RoleSchema.optional(),
  /** Multi-role filter (from preferences.defaultRoles when URL has no role). */
  roles: z.array(RoleSchema).min(1).optional(),
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
  /** Early career = intern + entry + mid with ≤2 years. */
  early_career: z.boolean().optional(),
  seniority: z
    .array(z.enum(["intern", "entry", "mid", "senior", "staff", "unknown"]))
    .min(1)
    .optional(),
  sort: SortSchema.default("newest"),
});

export type JobsFilterFields = z.infer<typeof JobsFilterFieldsSchema>;

export const JobsListQuerySchema = JobsFilterFieldsSchema.extend({
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(40),
});

export type JobsListQuery = z.infer<typeof JobsListQuerySchema>;

export type JobsUrlPresence = {
  labels: boolean;
  role: boolean;
  has_salary: boolean;
  early_career: boolean;
};

export function jobsUrlPresence(sp: URLSearchParams): JobsUrlPresence {
  return {
    labels: Boolean(sp.get("labels")),
    role: Boolean(sp.get("role")),
    has_salary: sp.get("has_salary") != null && sp.get("has_salary") !== "",
    early_career:
      sp.get("early_career") != null && sp.get("early_career") !== "",
  };
}

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

export type JobsPreferencesInput = {
  defaultLabels: Array<z.infer<typeof LabelSchema>>;
  defaultRoles: Array<z.infer<typeof RoleSchema>>;
  hideNoSalary: boolean;
};

/**
 * Parse list query. When `preferences` is provided, fills labels / role(s) /
 * has_salary only for keys absent from the URL (URL always wins).
 */
export function parseJobsListSearchParams(
  sp: URLSearchParams,
  preferences?: JobsPreferencesInput | null,
): { ok: true; data: JobsListQuery } | { ok: false; message: string } {
  const present = jobsUrlPresence(sp);

  const labelsRaw = sp.get("labels");
  const labels = present.labels
    ? labelsRaw!
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : preferences?.defaultLabels;

  const hasSalaryRaw = sp.get("has_salary");
  let has_salary: boolean | undefined;
  if (present.has_salary) {
    if (hasSalaryRaw === "true" || hasSalaryRaw === "1") has_salary = true;
    else if (hasSalaryRaw === "false" || hasSalaryRaw === "0")
      has_salary = false;
    else {
      return { ok: false, message: "has_salary must be true or false" };
    }
  } else if (preferences?.hideNoSalary) {
    has_salary = true;
  }

  let early_career: boolean | undefined;
  if (present.early_career) {
    const raw = sp.get("early_career");
    if (raw === "true" || raw === "1") early_career = true;
    else if (raw === "false" || raw === "0") early_career = false;
    else {
      return { ok: false, message: "early_career must be true or false" };
    }
  }

  let role: string | undefined = present.role
    ? (sp.get("role") || undefined)
    : undefined;
  let roles: string[] | undefined;
  if (!present.role && preferences?.defaultRoles?.length) {
    if (preferences.defaultRoles.length === 1) {
      role = preferences.defaultRoles[0];
    } else {
      roles = preferences.defaultRoles;
    }
  }

  const seniorityRaw = sp.get("seniority");
  const seniority = seniorityRaw
    ? seniorityRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

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
    role,
    roles,
    ats: sp.get("ats") || undefined,
    company: sp.get("company") || undefined,
    posted: sp.get("posted") || undefined,
    has_salary,
    early_career,
    seniority,
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
