import { createHash } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  companies,
  fetchRuns,
  jobTags,
  jobs,
  labelReports,
} from "@/db/schema";
import {
  decodeJobsCursor,
  encodeJobsCursor,
  JobsListQuerySchema,
  LabelSchema,
  parseJobsListSearchParams,
  PostedSchema,
  RoleSchema,
  SortSchema,
  type JobsCursorPayload,
  type JobsListQuery,
} from "@/lib/jobs-filters";

export {
  decodeJobsCursor,
  encodeJobsCursor,
  JobsFilterFieldsSchema,
  JobsListQuerySchema,
  LabelSchema,
  parseJobsListSearchParams,
  PostedSchema,
  RoleSchema,
  SortSchema,
  type JobsFilterFields,
  type JobsListQuery,
} from "@/lib/jobs-filters";

const ROLE_FAMILY_MAP: Record<z.infer<typeof RoleSchema>, string[]> = {
  backend: ["backend"],
  frontend: ["frontend"],
  fullstack: ["fullstack"],
  devops: ["infra"],
  data: ["data", "ml"],
  mobile: ["mobile"],
  other: ["other", "security", "qa", "developer_relations", "solutions"],
};

export type ApiJob = {
  id: string;
  title: string;
  company: { id: string; name: string; logoUrl?: string | null };
  locationText: string | null;
  label: string | null;
  evidence: string[];
  decidedBy: "rule" | "llm";
  salaryText: string | null;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  applyUrl: string;
  isNew: boolean;
};

export type ApiJobDetail = ApiJob & {
  description: string;
  related: ApiJob[];
};

function salaryText(row: {
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  compensationPeriod: string | null;
}): string | null {
  const cur = row.compensationCurrency?.trim() || "USD";
  const period = row.compensationPeriod?.trim();
  const suffix = period ? ` / ${period}` : "";
  if (row.compensationMin != null && row.compensationMax != null) {
    return `${cur} ${row.compensationMin.toLocaleString()}–${row.compensationMax.toLocaleString()}${suffix}`;
  }
  if (row.compensationMin != null) {
    return `${cur} ${row.compensationMin.toLocaleString()}+${suffix}`;
  }
  if (row.compensationMax != null) {
    return `Up to ${cur} ${row.compensationMax.toLocaleString()}${suffix}`;
  }
  return null;
}

function decidedBy(classifier: string | null): "rule" | "llm" {
  if (classifier === "llm") return "llm";
  return "rule";
}

function mapRow(row: {
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
}): ApiJob {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return {
    id: row.id,
    title: row.title,
    company: { id: row.companyId, name: row.companyName, logoUrl: null },
    locationText: row.locationRaw,
    label: row.indiaEligibility,
    evidence: row.eligibilityEvidence ?? [],
    decidedBy: decidedBy(row.classifier),
    salaryText: salaryText(row),
    postedAt: row.postedAt?.toISOString() ?? null,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    applyUrl: row.applyUrl,
    isNew: row.firstSeenAt.getTime() > dayAgo,
  };
}

function postedSince(posted: z.infer<typeof PostedSchema>): Date | null {
  if (posted === "all") return null;
  const hours = posted === "24h" ? 24 : posted === "7d" ? 24 * 7 : 24 * 30;
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

async function baseConditions(q: JobsListQuery): Promise<SQL[]> {
  const conditions: SQL[] = [
    isNull(jobs.closedAt),
    or(eq(companies.active, true), isNull(companies.active))!,
    or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech"))!,
    inArray(jobTags.indiaEligibility, q.labels),
  ];

  if (q.q) {
    const like = `%${q.q}%`;
    conditions.push(
      or(
        ilike(jobs.title, like),
        ilike(companies.name, like),
        ilike(jobs.descriptionText, like),
        // skill / keyword hits often live in evidence quotes
        sql`array_to_string(coalesce(${jobTags.eligibilityEvidence}, '{}'::text[]), ' ') ilike ${like}`,
      )!,
    );
  }

  if (q.role) {
    conditions.push(inArray(jobTags.roleFamily, ROLE_FAMILY_MAP[q.role]));
  }

  if (q.ats) {
    conditions.push(
      or(eq(companies.ats, q.ats), eq(jobs.sourceAts, q.ats))!,
    );
  }

  const since = postedSince(q.posted);
  if (since) {
    conditions.push(
      or(
        and(isNotNull(jobs.postedAt), gte(jobs.postedAt, since)),
        and(isNull(jobs.postedAt), gte(jobs.firstSeenAt, since)),
      )!,
    );
  }

  if (q.has_salary === true) {
    conditions.push(
      or(
        isNotNull(jobTags.compensationMin),
        isNotNull(jobTags.compensationMax),
      )!,
    );
  } else if (q.has_salary === false) {
    conditions.push(
      and(
        isNull(jobTags.compensationMin),
        isNull(jobTags.compensationMax),
      )!,
    );
  }

  return conditions;
}

function cursorCondition(
  sort: z.infer<typeof SortSchema>,
  cursor: JobsCursorPayload,
): SQL | null {
  if (sort !== cursor.sort) return null;

  if (sort === "company") {
    const name = cursor.v ?? "";
    return or(
      gt(companies.name, name),
      and(eq(companies.name, name), gt(jobs.id, cursor.id)),
    )!;
  }

  if (sort === "last_seen") {
    const v = cursor.v ? new Date(cursor.v) : null;
    if (!v || Number.isNaN(v.getTime())) return eq(jobs.id, cursor.id);
    return or(
      lt(jobs.lastSeenAt, v),
      and(eq(jobs.lastSeenAt, v), lt(jobs.id, cursor.id)),
    )!;
  }

  // newest — prefer postedAt, fall back to firstSeenAt via coalesce in SQL
  const v = cursor.v ? new Date(cursor.v) : null;
  if (!v || Number.isNaN(v.getTime())) return eq(jobs.id, cursor.id);
  const sortExpr = sql`coalesce(${jobs.postedAt}, ${jobs.firstSeenAt})`;
  return or(
    sql`${sortExpr} < ${v}`,
    and(sql`${sortExpr} = ${v}`, lt(jobs.id, cursor.id)),
  )!;
}

export async function listJobs(q: JobsListQuery): Promise<{
  items: ApiJob[];
  nextCursor: string | null;
  total: number;
  lastIngestionAt: string | null;
}> {
  const conditions = await baseConditions(q);
  let cursor: JobsCursorPayload | null = null;
  if (q.cursor) {
    cursor = decodeJobsCursor(q.cursor);
    const cc = cursorCondition(q.sort, cursor);
    if (cc) conditions.push(cc);
  }

  const where = and(...conditions);

  const orderBy =
    q.sort === "company"
      ? [asc(companies.name), asc(jobs.id)]
      : q.sort === "last_seen"
        ? [desc(jobs.lastSeenAt), desc(jobs.id)]
        : [
            desc(sql`coalesce(${jobs.postedAt}, ${jobs.firstSeenAt})`),
            desc(jobs.id),
          ];

  const [totalRow] = await db
    .select({ n: count() })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(and(...(await baseConditions(q))));

  const rows = await db
    .select({
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
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const items = page.map(mapRow);

  let nextCursor: string | null = null;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1]!;
    const v =
      q.sort === "company"
        ? last.companyName
        : q.sort === "last_seen"
          ? last.lastSeenAt.toISOString()
          : (last.postedAt ?? last.firstSeenAt).toISOString();
    nextCursor = encodeJobsCursor({ sort: q.sort, v, id: last.id });
  }

  const [ingest] = await db
    .select({ t: max(fetchRuns.finishedAt) })
    .from(fetchRuns)
    .where(eq(fetchRuns.ok, true));

  const [seen] = await db
    .select({ t: max(jobs.lastSeenAt) })
    .from(jobs)
    .where(isNull(jobs.closedAt));

  const last =
    ingest?.t?.toISOString() ??
    seen?.t?.toISOString() ??
    null;

  return {
    items,
    nextCursor,
    total: Number(totalRow?.n ?? 0),
    lastIngestionAt: last,
  };
}

export async function getJobById(id: string): Promise<ApiJobDetail | null> {
  const [row] = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      companyId: companies.id,
      companyName: companies.name,
      locationRaw: jobs.locationRaw,
      descriptionText: jobs.descriptionText,
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
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(eq(jobs.id, id))
    .limit(1);

  if (!row) return null;

  const base = mapRow({
    ...row,
    indiaEligibility: row.indiaEligibility,
    eligibilityEvidence: row.eligibilityEvidence,
    classifier: row.classifier,
  });

  const relatedRows = await db
    .select({
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
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(
        eq(jobs.companyId, row.companyId),
        isNull(jobs.closedAt),
        ne(jobs.id, id),
        or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
      ),
    )
    .orderBy(desc(sql`coalesce(${jobs.postedAt}, ${jobs.firstSeenAt})`))
    .limit(5);

  return {
    ...base,
    description: row.descriptionText ?? "",
    related: relatedRows.map(mapRow),
  };
}

export const ReportBodySchema = z.object({
  suggestedLabel: LabelSchema.optional(),
  note: z.string().trim().max(2000).optional(),
});

export function hashIp(ip: string): string {
  return createHash("sha256").update(ip, "utf8").digest("hex");
}

export async function createLabelReport(input: {
  jobId: string;
  userId?: string | null;
  suggestedLabel?: string;
  note?: string;
  ipHash: string;
}) {
  const [job] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, input.jobId))
    .limit(1);
  if (!job) return { ok: false as const, error: "not_found" as const };

  const [row] = await db
    .insert(labelReports)
    .values({
      jobId: input.jobId,
      userId: input.userId ?? null,
      suggestedLabel: input.suggestedLabel ?? null,
      note: input.note ?? null,
      ipHash: input.ipHash,
    })
    .returning({ id: labelReports.id });

  return { ok: true as const, id: row!.id };
}
