import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { companies, jobTags, jobs, savedJobs } from "@/db/schema";
import type { ApiJob } from "@/lib/jobs-api";
import { LabelSchema } from "@/lib/jobs-filters";
import { formatSalaryText } from "@/lib/salary";

export const SavedStatusSchema = z.enum(["active", "closed", "all"]);
export const SavedSortSchema = z.enum([
  "saved_newest",
  "posted_newest",
  "company",
]);
export const AppliedFilterSchema = z.enum(["yes", "no", "all"]);

export const SavedListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  labels: z.array(LabelSchema).min(1).optional(),
  status: SavedStatusSchema.default("all"),
  applied: AppliedFilterSchema.default("all"),
  sort: SavedSortSchema.default("saved_newest"),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(100).default(30),
});

export type SavedListQuery = z.infer<typeof SavedListQuerySchema>;

export type SavedApiJob = ApiJob & {
  savedAt: string;
  appliedAt: string | null;
  isClosed: boolean;
  labelChanged: boolean;
  labelAtSave: string | null;
};

type CursorPayload = {
  sort: z.infer<typeof SavedSortSchema>;
  v: string | null;
  id: string;
};

export function encodeSavedCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeSavedCursor(raw: string): CursorPayload {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as CursorPayload;
    if (!parsed?.id || !SavedSortSchema.safeParse(parsed.sort).success) {
      throw new Error("bad_cursor");
    }
    return parsed;
  } catch {
    throw new Error("invalid_cursor");
  }
}

export function parseSavedListSearchParams(
  sp: URLSearchParams,
): { ok: true; data: SavedListQuery } | { ok: false; message: string } {
  const labelsRaw = sp.get("labels");
  const labels = labelsRaw
    ? labelsRaw
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

  const parsed = SavedListQuerySchema.safeParse({
    q: sp.get("q") || undefined,
    labels,
    status: sp.get("status") || undefined,
    applied: sp.get("applied") || undefined,
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

function salaryText(row: {
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  compensationPeriod: string | null;
}): string | null {
  return formatSalaryText(row);
}

function decidedBy(classifier: string | null): "rule" | "llm" {
  return classifier === "llm" ? "llm" : "rule";
}

function mapSavedRow(row: {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  locationRaw: string | null;
  indiaEligibility: string | null;
  eligibilityEvidence: string[] | null;
  classifier: string | null;
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  compensationPeriod: string | null;
  postedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  applyUrl: string;
  closedAt: Date | null;
  savedAt: Date;
  appliedAt: Date | null;
  labelAtSave: string | null;
}): SavedApiJob {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const label = row.indiaEligibility;
  const labelAtSave = row.labelAtSave;
  return {
    id: row.id,
    title: row.title,
    company: { id: row.companyId, name: row.companyName, logoUrl: null },
    locationText: row.locationRaw,
    label,
    evidence: row.eligibilityEvidence ?? [],
    decidedBy: decidedBy(row.classifier),
    salaryText: salaryText(row),
    postedAt: row.postedAt?.toISOString() ?? null,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    applyUrl: row.applyUrl,
    isNew: row.firstSeenAt.getTime() > dayAgo,
    savedAt: row.savedAt.toISOString(),
    appliedAt: row.appliedAt?.toISOString() ?? null,
    isClosed: row.closedAt != null,
    labelChanged:
      labelAtSave != null && label != null && labelAtSave !== label,
    labelAtSave,
  };
}

async function baseConditions(
  userId: string,
  q: SavedListQuery,
): Promise<SQL[]> {
  const conditions: SQL[] = [eq(savedJobs.userId, userId)];

  if (q.status === "active") {
    conditions.push(isNull(jobs.closedAt));
  } else if (q.status === "closed") {
    conditions.push(isNotNull(jobs.closedAt));
  }

  if (q.applied === "yes") {
    conditions.push(isNotNull(savedJobs.appliedAt));
  } else if (q.applied === "no") {
    conditions.push(isNull(savedJobs.appliedAt));
  }

  if (q.labels?.length) {
    conditions.push(inArray(jobTags.indiaEligibility, q.labels));
  }

  if (q.q) {
    const like = `%${q.q}%`;
    conditions.push(
      or(
        ilike(jobs.title, like),
        ilike(companies.name, like),
        ilike(jobs.descriptionText, like),
      )!,
    );
  }

  return conditions;
}

function cursorCondition(
  sort: z.infer<typeof SavedSortSchema>,
  cursor: CursorPayload,
): SQL | null {
  if (sort !== cursor.sort) return null;

  if (sort === "company") {
    const name = cursor.v ?? "";
    return or(
      gt(companies.name, name),
      and(eq(companies.name, name), gt(jobs.id, cursor.id)),
    )!;
  }

  if (sort === "posted_newest") {
    const v = cursor.v ? new Date(cursor.v) : null;
    if (!v || Number.isNaN(v.getTime())) return eq(jobs.id, cursor.id);
    const sortExpr = sql`coalesce(${jobs.postedAt}, ${jobs.firstSeenAt})`;
    return or(
      sql`${sortExpr} < ${v}`,
      and(sql`${sortExpr} = ${v}`, lt(jobs.id, cursor.id)),
    )!;
  }

  // saved_newest
  const v = cursor.v ? new Date(cursor.v) : null;
  if (!v || Number.isNaN(v.getTime())) return eq(jobs.id, cursor.id);
  return or(
    lt(savedJobs.createdAt, v),
    and(eq(savedJobs.createdAt, v), lt(jobs.id, cursor.id)),
  )!;
}

const selectFields = {
  id: jobs.id,
  title: jobs.title,
  companyId: companies.id,
  companyName: companies.name,
  locationRaw: jobs.locationRaw,
  indiaEligibility: jobTags.indiaEligibility,
  eligibilityEvidence: jobTags.eligibilityEvidence,
  classifier: jobTags.classifier,
  compensationMin: jobTags.compensationMin,
  compensationMax: jobTags.compensationMax,
  compensationCurrency: jobTags.compensationCurrency,
  compensationPeriod: jobTags.compensationPeriod,
  postedAt: jobs.postedAt,
  firstSeenAt: jobs.firstSeenAt,
  lastSeenAt: jobs.lastSeenAt,
  applyUrl: jobs.applyUrl,
  closedAt: jobs.closedAt,
  savedAt: savedJobs.createdAt,
  appliedAt: savedJobs.appliedAt,
  labelAtSave: savedJobs.labelAtSave,
};

export async function listSavedJobsFiltered(
  userId: string,
  q: SavedListQuery,
): Promise<{
  items: SavedApiJob[];
  nextCursor: string | null;
  total: number;
}> {
  const conditions = await baseConditions(userId, q);
  if (q.cursor) {
    const cursor = decodeSavedCursor(q.cursor);
    const cc = cursorCondition(q.sort, cursor);
    if (cc) conditions.push(cc);
  }

  const where = and(...conditions);

  const orderBy =
    q.sort === "company"
      ? [asc(companies.name), asc(jobs.id)]
      : q.sort === "posted_newest"
        ? [
            desc(sql`coalesce(${jobs.postedAt}, ${jobs.firstSeenAt})`),
            desc(jobs.id),
          ]
        : [desc(savedJobs.createdAt), desc(jobs.id)];

  const [totalRow] = await db
    .select({ n: count() })
    .from(savedJobs)
    .innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(and(...(await baseConditions(userId, q))));

  const rows = await db
    .select(selectFields)
    .from(savedJobs)
    .innerJoin(jobs, eq(jobs.id, savedJobs.jobId))
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const items = page.map(mapSavedRow);

  let nextCursor: string | null = null;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1]!;
    const v =
      q.sort === "company"
        ? last.companyName
        : q.sort === "posted_newest"
          ? (last.postedAt ?? last.firstSeenAt).toISOString()
          : last.savedAt.toISOString();
    nextCursor = encodeSavedCursor({ sort: q.sort, v, id: last.id });
  }

  return {
    items,
    nextCursor,
    total: Number(totalRow?.n ?? 0),
  };
}

export const PatchSavedBodySchema = z.object({
  applied: z.boolean(),
});

export async function setSavedApplied(
  userId: string,
  jobId: string,
  applied: boolean,
): Promise<{ ok: true; appliedAt: string | null } | { ok: false }> {
  const [row] = await db
    .update(savedJobs)
    .set({ appliedAt: applied ? new Date() : null })
    .where(and(eq(savedJobs.userId, userId), eq(savedJobs.jobId, jobId)))
    .returning({
      appliedAt: savedJobs.appliedAt,
    });
  if (!row) return { ok: false };
  return {
    ok: true,
    appliedAt: row.appliedAt?.toISOString() ?? null,
  };
}

export async function exportSavedJobsCsv(
  userId: string,
  q: SavedListQuery,
): Promise<string> {
  const page = await listSavedJobsFiltered(userId, {
    ...q,
    cursor: undefined,
    limit: 100,
  });
  // Pull all pages
  let items = page.items;
  let cursor = page.nextCursor;
  while (cursor) {
    const next = await listSavedJobsFiltered(userId, {
      ...q,
      cursor,
      limit: 100,
    });
    items = items.concat(next.items);
    cursor = next.nextCursor;
  }

  const headers = [
    "title",
    "company",
    "label",
    "location",
    "salary",
    "applyUrl",
    "savedAt",
    "appliedAt",
    "status",
  ];

  function esc(v: string): string {
    if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  }

  const lines = [headers.join(",")];
  for (const j of items) {
    lines.push(
      [
        esc(j.title),
        esc(j.company.name),
        esc(j.label ?? ""),
        esc(j.locationText ?? ""),
        esc(j.salaryText ?? ""),
        esc(j.applyUrl),
        esc(j.savedAt),
        esc(j.appliedAt ?? ""),
        esc(j.isClosed ? "closed" : "active"),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}
