import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db/client";
import {
  companies,
  companyCandidates,
  jobTags,
  jobs,
} from "@/db/schema";
import {
  domainFromUrl,
  evidenceUrlFor,
  extractAtsUrls,
  humanizeSlug,
  type Ats,
} from "@/lib/ats-urls";
import {
  decodeCompaniesCursor,
  encodeCompaniesCursor,
  type CompaniesCursorPayload,
  type CompaniesListQuery,
} from "@/lib/companies-filters";

export {
  CompaniesListQuerySchema,
  CompaniesSortSchema,
  decodeCompaniesCursor,
  encodeCompaniesCursor,
  parseCompaniesListSearchParams,
  SubmitCompanyBodySchema,
  type CompaniesListQuery,
} from "@/lib/companies-filters";

export type LabelCounts = {
  open: number;
  india_remote: number;
  india_onsite: number;
  region_locked: number;
  unclear: number;
};

export type ApiCompany = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  website: string | null;
  ats: Ats | null;
  atsBoardUrl: string | null;
  activeJobs: number;
  counts: LabelCounts;
  lastIngestedAt: string | null;
  addedAt: string;
};

export type ApiCompanyDetail = ApiCompany & {
  source: string | null;
  newestJobs: Array<{
    id: string;
    title: string;
    label: string | null;
    applyUrl: string;
    postedAt: string | null;
    firstSeenAt: string;
  }>;
};

const emptyCounts = (): LabelCounts => ({
  open: 0,
  india_remote: 0,
  india_onsite: 0,
  region_locked: 0,
  unclear: 0,
});

/**
 * Active tech job predicate (same non_tech exclusion as /api/jobs).
 * Uses distinct job ids so left joins never inflate counts.
 */
const activeTechJob = sql`${jobs.closedAt} is null and (${jobTags.roleFamily} is null or ${jobTags.roleFamily} is distinct from 'non_tech')`;

type AggRow = {
  id: string;
  slug: string;
  name: string;
  website: string | null;
  ats: Ats | null;
  atsSlug: string | null;
  createdAt: Date;
  activeJobs: number;
  openCount: number;
  indiaRemoteCount: number;
  indiaOnsiteCount: number;
  regionLockedCount: number;
  unclearCount: number;
  lastIngestedAt: Date | null;
  openEligible: number;
};

function mapCompany(row: AggRow): ApiCompany {
  const ats = row.ats;
  const atsSlug = row.atsSlug;
  return {
    id: row.id,
    slug: row.slug!,
    name: row.name,
    logoUrl: null,
    website: row.website,
    ats,
    atsBoardUrl: ats && atsSlug ? evidenceUrlFor(ats, atsSlug) : null,
    activeJobs: Number(row.activeJobs),
    counts: {
      open: Number(row.openCount),
      india_remote: Number(row.indiaRemoteCount),
      india_onsite: Number(row.indiaOnsiteCount),
      region_locked: Number(row.regionLockedCount),
      unclear: Number(row.unclearCount),
    },
    lastIngestedAt: row.lastIngestedAt
      ? new Date(row.lastIngestedAt).toISOString()
      : null,
    addedAt: row.createdAt.toISOString(),
  };
}

function openEligibleExpr() {
  return sql<number>`count(distinct ${jobs.id}) filter (
    where ${activeTechJob}
    and ${jobTags.indiaEligibility} in ('open', 'india_remote')
  )`;
}

function selectAgg() {
  return {
    id: companies.id,
    slug: companies.slug,
    name: companies.name,
    website: companies.website,
    ats: companies.ats,
    atsSlug: companies.atsSlug,
    createdAt: companies.createdAt,
    activeJobs: sql<number>`count(distinct ${jobs.id}) filter (where ${activeTechJob})`,
    openCount: sql<number>`count(distinct ${jobs.id}) filter (where ${activeTechJob} and ${jobTags.indiaEligibility} = 'open')`,
    indiaRemoteCount: sql<number>`count(distinct ${jobs.id}) filter (where ${activeTechJob} and ${jobTags.indiaEligibility} = 'india_remote')`,
    indiaOnsiteCount: sql<number>`count(distinct ${jobs.id}) filter (where ${activeTechJob} and ${jobTags.indiaEligibility} = 'india_onsite')`,
    regionLockedCount: sql<number>`count(distinct ${jobs.id}) filter (where ${activeTechJob} and ${jobTags.indiaEligibility} = 'region_locked')`,
    unclearCount: sql<number>`count(distinct ${jobs.id}) filter (where ${activeTechJob} and ${jobTags.indiaEligibility} = 'unclear')`,
    lastIngestedAt: sql<Date | null>`(
      select max(fr.finished_at) from fetch_runs fr
      where fr.company_id = ${companies.id} and fr.ok = true
    )`,
    openEligible: openEligibleExpr(),
  };
}

function groupByCompany() {
  return [
    companies.id,
    companies.slug,
    companies.name,
    companies.website,
    companies.ats,
    companies.atsSlug,
    companies.createdAt,
  ];
}

function fromCompaniesAgg() {
  return db
    .select(selectAgg())
    .from(companies)
    .leftJoin(jobs, eq(jobs.companyId, companies.id))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id));
}

function baseWhere(q: CompaniesListQuery): SQL[] {
  const conditions: SQL[] = [
    eq(companies.active, true),
    sql`${companies.slug} is not null`,
  ];
  if (q.q) conditions.push(ilike(companies.name, `%${q.q}%`));
  if (q.ats) conditions.push(eq(companies.ats, q.ats));
  return conditions;
}

function havingHasOpen(hasOpen: boolean): SQL | undefined {
  if (!hasOpen) return undefined;
  return sql`${openEligibleExpr()} >= 1`;
}

function cursorCondition(
  sort: CompaniesListQuery["sort"],
  cursor: CompaniesCursorPayload,
): SQL | null {
  if (sort !== cursor.sort) return null;

  if (sort === "name") {
    const name = cursor.v ?? "";
    return or(
      gt(companies.name, name),
      and(eq(companies.name, name), gt(companies.id, cursor.id)),
    )!;
  }

  if (sort === "recently_added") {
    const v = cursor.v ? new Date(cursor.v) : null;
    if (!v || Number.isNaN(v.getTime())) return eq(companies.id, cursor.id);
    return or(
      lt(companies.createdAt, v),
      and(eq(companies.createdAt, v), lt(companies.id, cursor.id)),
    )!;
  }

  // most_open / most_jobs — numeric sort keys applied in HAVING/WHERE via subquery filter
  // Cursor uses id + precomputed value compared in outer filter after aggregation.
  return null;
}

export async function listCompanies(q: CompaniesListQuery): Promise<{
  items: ApiCompany[];
  nextCursor: string | null;
  total: number;
}> {
  const conditions = baseWhere(q);
  let cursor: CompaniesCursorPayload | null = null;
  if (q.cursor) {
    cursor = decodeCompaniesCursor(q.cursor);
    const cc = cursorCondition(q.sort, cursor);
    if (cc) conditions.push(cc);
  }

  const havingParts: SQL[] = [];
  const ho = havingHasOpen(q.has_open);
  if (ho) havingParts.push(ho);

  // Keyset for aggregated sorts: filter after having via comparison on aggregates
  if (
    cursor &&
    (q.sort === "most_open" || q.sort === "most_jobs") &&
    cursor.sort === q.sort
  ) {
    const n = Number(cursor.v);
    if (Number.isFinite(n)) {
      const sortExpr =
        q.sort === "most_open"
          ? openEligibleExpr()
          : sql`count(distinct ${jobs.id}) filter (where ${activeTechJob})`;
      havingParts.push(
        sql`(${sortExpr} < ${n} or (${sortExpr} = ${n} and ${companies.id} < ${cursor.id}))`,
      );
    }
  }

  const orderBy =
    q.sort === "name"
      ? [asc(companies.name), asc(companies.id)]
      : q.sort === "recently_added"
        ? [desc(companies.createdAt), desc(companies.id)]
        : q.sort === "most_jobs"
          ? [
              desc(
                sql`count(distinct ${jobs.id}) filter (where ${activeTechJob})`,
              ),
              desc(companies.id),
            ]
          : [desc(openEligibleExpr()), desc(companies.id)];

  const where = and(...conditions);
  const havingSql =
    havingParts.length > 0 ? and(...havingParts) : undefined;

  // total: same filters, no cursor, no limit
  const totalRows = await fromCompaniesAgg()
    .where(and(...baseWhere(q)))
    .groupBy(...groupByCompany())
    .having(ho ? ho : sql`true`);

  const rows = await fromCompaniesAgg()
    .where(where)
    .groupBy(...groupByCompany())
    .having(havingSql ?? sql`true`)
    .orderBy(...orderBy)
    .limit(q.limit + 1);

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const items = page.map((r) => mapCompany(r as AggRow));

  let nextCursor: string | null = null;
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1]! as AggRow;
    const v =
      q.sort === "name"
        ? last.name
        : q.sort === "recently_added"
          ? last.createdAt.toISOString()
          : q.sort === "most_jobs"
            ? String(Number(last.activeJobs))
            : String(Number(last.openEligible));
    nextCursor = encodeCompaniesCursor({
      sort: q.sort,
      v,
      id: last.id,
    });
  }

  return {
    items,
    nextCursor,
    total: totalRows.length,
  };
}

export async function getCompanyBySlug(
  slug: string,
): Promise<ApiCompanyDetail | null> {
  const [row] = await fromCompaniesAgg()
    .where(and(eq(companies.active, true), eq(companies.slug, slug)))
    .groupBy(...groupByCompany())
    .limit(1);

  if (!row) {
    // Distinguish inactive/blocklisted vs missing for 404 either way
    return null;
  }

  const base = mapCompany(row as AggRow);

  const [sourceRow] = await db
    .select({ source: companyCandidates.source })
    .from(companyCandidates)
    .where(eq(companyCandidates.promotedCompanyId, base.id))
    .orderBy(desc(companyCandidates.discoveredAt))
    .limit(1);

  const newestRows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      label: jobTags.indiaEligibility,
      applyUrl: jobs.applyUrl,
      postedAt: jobs.postedAt,
      firstSeenAt: jobs.firstSeenAt,
    })
    .from(jobs)
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(
        eq(jobs.companyId, base.id),
        sql`${jobs.closedAt} is null`,
        or(
          sql`${jobTags.roleFamily} is null`,
          ne(jobTags.roleFamily, "non_tech"),
        ),
        sql`${jobTags.indiaEligibility} in ('open', 'india_remote')`,
      ),
    )
    .orderBy(desc(sql`coalesce(${jobs.postedAt}, ${jobs.firstSeenAt})`))
    .limit(5);

  return {
    ...base,
    source: sourceRow?.source ?? null,
    newestJobs: newestRows.map((j) => ({
      id: j.id,
      title: j.title,
      label: j.label,
      applyUrl: j.applyUrl,
      postedAt: j.postedAt?.toISOString() ?? null,
      firstSeenAt: j.firstSeenAt.toISOString(),
    })),
  };
}

export type SubmitCompanyResult =
  | { status: 202; candidateId: string }
  | { status: 409; reason: "already_tracked" }
  | { status: 422; reason: "no_ats_found" }
  | { status: 400; reason: "invalid_url"; message: string };

export async function submitCompanyUrl(
  rawUrl: string,
): Promise<SubmitCompanyResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      status: 400,
      reason: "invalid_url",
      message: "url must be a valid http(s) URL",
    };
  }
  if (!/^https?:$/i.test(url.protocol)) {
    return {
      status: 400,
      reason: "invalid_url",
      message: "url must use http or https",
    };
  }

  const hit = extractAtsUrls(url.toString())[0];
  if (!hit) {
    return { status: 422, reason: "no_ats_found" };
  }

  const atsSlug = hit.atsSlug.toLowerCase();

  const [existingCompany] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.ats, hit.ats), eq(companies.atsSlug, atsSlug)))
    .limit(1);

  if (existingCompany) {
    return { status: 409, reason: "already_tracked" };
  }

  // Also match original casing on ats_slug
  const [existingCompany2] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        eq(companies.ats, hit.ats),
        sql`lower(${companies.atsSlug}) = ${atsSlug}`,
      ),
    )
    .limit(1);
  if (existingCompany2) {
    return { status: 409, reason: "already_tracked" };
  }

  const [existingCand] = await db
    .select({ id: companyCandidates.id })
    .from(companyCandidates)
    .where(
      and(
        eq(companyCandidates.ats, hit.ats),
        sql`lower(${companyCandidates.atsSlug}) = ${atsSlug}`,
      ),
    )
    .limit(1);
  if (existingCand) {
    return { status: 409, reason: "already_tracked" };
  }

  const name = humanizeSlug(hit.atsSlug).slice(0, 200) || hit.atsSlug;
  const domain = domainFromUrl(url.toString());
  const source = "web_submit";

  // Dedupe by source+name like MCP submit_company
  const [byName] = await db
    .select({ id: companyCandidates.id })
    .from(companyCandidates)
    .where(
      and(
        eq(companyCandidates.source, source),
        sql`lower(${companyCandidates.name}) = ${name.toLowerCase()}`,
      ),
    )
    .limit(1);
  if (byName) {
    return { status: 409, reason: "already_tracked" };
  }

  const [inserted] = await db
    .insert(companyCandidates)
    .values({
      name,
      domain,
      source,
      status: "pending",
      ats: hit.ats,
      atsSlug: hit.atsSlug,
      evidenceUrl: hit.url,
      updatedAt: new Date(),
    })
    .returning({ id: companyCandidates.id });

  return { status: 202, candidateId: inserted!.id };
}

/** Empty counts helper for tests / UI. */
export function emptyLabelCounts(): LabelCounts {
  return emptyCounts();
}
