import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/auth", () => ({
  auth: async () => null,
}));

import {
  decodeCompaniesCursor,
  encodeCompaniesCursor,
  getCompanyBySlug,
  listCompanies,
  parseCompaniesListSearchParams,
  submitCompanyUrl,
} from "../../web/src/lib/companies-api.ts";
import { listJobs, parseJobsListSearchParams } from "../../web/src/lib/jobs-api.ts";
import { SlidingWindowLimiter } from "../../web/src/lib/rate-limit.ts";
import { GET as getCompanies } from "../../web/src/app/api/companies/route.ts";
import { GET as getCompany } from "../../web/src/app/api/companies/[slug]/route.ts";
import { POST as submitCompany } from "../../web/src/app/api/companies/submit/route.ts";
import { db, pool } from "../../src/db/client.js";
import {
  companies,
  companyCandidates,
  jobTags,
  jobs,
} from "../../src/db/schema.js";

let dbUp = false;
const stamp = Date.now();
const slugA = `co-api-a-${stamp}`;
const slugB = `co-api-b-${stamp}`;
const slugBlocked = `co-api-blocked-${stamp}`;
let companyA = "";
let companyB = "";
let companyBlocked = "";
let jobOpenA = "";
let jobClosedA = "";
let candidateIds: string[] = [];

beforeAll(async () => {
  try {
    await pool.query("select 1");
    await pool.query(`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug text;
      UPDATE companies SET slug = lower(trim(both '-' from regexp_replace(
        coalesce(nullif(trim(ats_slug), ''), nullif(trim(name), ''), id::text),
        '[^a-zA-Z0-9]+', '-', 'g'
      )))
      WHERE slug IS NULL OR trim(slug) = '';
      WITH dups AS (
        SELECT id, slug, row_number() OVER (PARTITION BY lower(slug) ORDER BY id) AS rn
        FROM companies WHERE slug IS NOT NULL
      )
      UPDATE companies c SET slug = c.slug || '-' || d.rn::text
      FROM dups d WHERE c.id = d.id AND d.rn > 1;
      CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_uidx ON companies (slug);
    `);
    dbUp = true;
  } catch {
    dbUp = false;
    return;
  }

  const [a] = await db
    .insert(companies)
    .values({
      name: `Co API A ${stamp}`,
      website: "https://example-a.com",
      ats: "greenhouse",
      atsSlug: `co-api-a-${stamp}`,
      slug: slugA,
      active: true,
    })
    .returning();
  companyA = a!.id;

  const [b] = await db
    .insert(companies)
    .values({
      name: `Co API B ${stamp}`,
      website: "https://example-b.com",
      ats: "ashby",
      atsSlug: `co-api-b-${stamp}`,
      slug: slugB,
      active: true,
    })
    .returning();
  companyB = b!.id;

  const [blocked] = await db
    .insert(companies)
    .values({
      name: `Co API Blocked ${stamp}`,
      website: "https://example-blocked.com",
      ats: "lever",
      atsSlug: `co-api-blocked-${stamp}`,
      slug: slugBlocked,
      active: false,
    })
    .returning();
  companyBlocked = blocked!.id;

  const mkJob = async (
    companyId: string,
    title: string,
    label: string,
    closed: boolean,
  ) => {
    const [job] = await db
      .insert(jobs)
      .values({
        companyId,
        externalId: `ext-${title}-${stamp}`,
        title,
        descriptionText: "engineer",
        applyUrl: `https://example.com/jobs/${title}`,
        sourceAts: "greenhouse",
        contentHash: `hash-${title}-${stamp}`,
        closedAt: closed ? new Date() : null,
      })
      .returning();
    await db.insert(jobTags).values({
      jobId: job!.id,
      indiaEligibility: label,
      eligibilityEvidence: ["ok"],
      classifier: "rule",
      roleFamily: "backend",
    });
    return job!.id;
  };

  jobOpenA = await mkJob(companyA, "OpenRole", "open", false);
  jobClosedA = await mkJob(companyA, "ClosedRole", "open", true);
  await mkJob(companyA, "IndiaRole", "india_remote", false);
  await mkJob(companyA, "OnsiteRole", "india_onsite", false);
  // B has no open/india_remote — only unclear
  await mkJob(companyB, "UnclearRole", "unclear", false);
});

afterAll(async () => {
  if (!dbUp) return;
  if (companyA) await db.delete(companies).where(eq(companies.id, companyA));
  if (companyB) await db.delete(companies).where(eq(companies.id, companyB));
  if (companyBlocked) {
    await db.delete(companies).where(eq(companies.id, companyBlocked));
  }
  for (const id of candidateIds) {
    await db.delete(companyCandidates).where(eq(companyCandidates.id, id));
  }
});

describe("parseCompaniesListSearchParams", () => {
  it("defaults has_open true and sort most_open", () => {
    const r = parseCompaniesListSearchParams(new URLSearchParams());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.has_open).toBe(true);
    expect(r.data.sort).toBe("most_open");
    expect(r.data.limit).toBe(30);
  });

  it("rejects invalid params", () => {
    expect(
      parseCompaniesListSearchParams(new URLSearchParams({ ats: "workday" }))
        .ok,
    ).toBe(false);
    expect(
      parseCompaniesListSearchParams(new URLSearchParams({ sort: "nope" })).ok,
    ).toBe(false);
    expect(
      parseCompaniesListSearchParams(new URLSearchParams({ limit: "999" })).ok,
    ).toBe(false);
    expect(
      parseCompaniesListSearchParams(
        new URLSearchParams({ has_open: "maybe" }),
      ).ok,
    ).toBe(false);
  });

  it("encodes and decodes cursors", () => {
    const raw = encodeCompaniesCursor({
      sort: "most_open",
      v: "12",
      id: "00000000-0000-4000-8000-000000000001",
    });
    const decoded = decodeCompaniesCursor(raw);
    expect(decoded.sort).toBe("most_open");
    expect(decoded.v).toBe("12");
    expect(() => decodeCompaniesCursor("!!!")).toThrow();
  });
});

describe("GET /api/companies validation", () => {
  it("returns 400 for invalid params", async () => {
    const res = await getCompanies(
      new Request("http://localhost/api/companies?sort=nope"),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("invalid_params");
  });
});

describe("listCompanies (db)", () => {
  it("filters, sorts, excludes closed from counts, excludes blocklisted", async ({
    skip,
  }) => {
    if (!dbUp) skip();

    const withOpen = await listCompanies({
      q: `Co API A ${stamp}`,
      has_open: true,
      sort: "most_open",
      limit: 10,
    });
    const hit = withOpen.items.find((c) => c.id === companyA);
    expect(hit).toBeTruthy();
    expect(hit!.counts.open).toBe(1);
    expect(hit!.counts.india_remote).toBe(1);
    expect(hit!.counts.india_onsite).toBe(1);
    // closed job excluded from activeJobs
    expect(hit!.activeJobs).toBe(3);
    expect(hit!.slug).toBe(slugA);

    const bOpen = await listCompanies({
      q: `Co API B ${stamp}`,
      has_open: true,
      sort: "name",
      limit: 10,
    });
    expect(bOpen.items.find((c) => c.id === companyB)).toBeUndefined();

    const bAll = await listCompanies({
      q: `Co API B ${stamp}`,
      has_open: false,
      sort: "name",
      limit: 10,
    });
    expect(bAll.items.find((c) => c.id === companyB)).toBeTruthy();

    const blocked = await listCompanies({
      q: `Co API Blocked ${stamp}`,
      has_open: false,
      sort: "name",
      limit: 10,
    });
    expect(blocked.items.find((c) => c.id === companyBlocked)).toBeUndefined();

    const byAts = await listCompanies({
      q: `Co API`,
      ats: "ashby",
      has_open: false,
      sort: "name",
      limit: 50,
    });
    expect(byAts.items.every((c) => c.ats === "ashby")).toBe(true);
    expect(byAts.items.find((c) => c.id === companyB)).toBeTruthy();
  });

  it("paginates without duplicates", async ({ skip }) => {
    if (!dbUp) skip();
    const first = await listCompanies({
      has_open: false,
      sort: "name",
      limit: 2,
    });
    if (!first.nextCursor) {
      expect(first.items.length).toBeLessThanOrEqual(2);
      return;
    }
    const second = await listCompanies({
      has_open: false,
      sort: "name",
      limit: 2,
      cursor: first.nextCursor,
    });
    const ids = new Set([
      ...first.items.map((c) => c.id),
      ...second.items.map((c) => c.id),
    ]);
    expect(ids.size).toBe(first.items.length + second.items.length);
  });

  it("detail 404 for blocklisted; detail ok for active", async ({ skip }) => {
    if (!dbUp) skip();
    expect(await getCompanyBySlug(slugBlocked)).toBeNull();
    const detail = await getCompanyBySlug(slugA);
    expect(detail?.id).toBe(companyA);
    expect(detail?.counts.open).toBe(1);
    expect(Array.isArray(detail?.newestJobs)).toBe(true);
    expect(detail!.newestJobs.length).toBeGreaterThanOrEqual(1);
    expect(
      detail!.newestJobs.every(
        (j) => j.label === "open" || j.label === "india_remote",
      ),
    ).toBe(true);
  });
});

describe("GET /api/companies/:slug", () => {
  it("404 for blocklisted slug when db up", async ({ skip }) => {
    if (!dbUp) skip();
    const res = await getCompany(
      new Request(`http://localhost/api/companies/${slugBlocked}`),
      { params: Promise.resolve({ slug: slugBlocked }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("/api/jobs?company=slug", () => {
  it("parses company param and scopes jobs", async ({ skip }) => {
    const bad = parseJobsListSearchParams(
      new URLSearchParams({ company: "Bad Slug!" }),
    );
    expect(bad.ok).toBe(false);

    if (!dbUp) skip();
    const page = await listJobs({
      labels: ["open", "india_remote", "india_onsite", "unclear"],
      company: slugA,
      posted: "all",
      sort: "newest",
      limit: 50,
    });
    expect(page.items.every((j) => j.company.id === companyA)).toBe(true);
    expect(page.items.some((j) => j.id === jobOpenA)).toBe(true);
    expect(page.items.some((j) => j.id === jobClosedA)).toBe(false);

    const other = await listJobs({
      labels: ["open", "india_remote", "unclear"],
      company: slugB,
      posted: "all",
      sort: "newest",
      limit: 50,
    });
    expect(other.items.every((j) => j.company.id === companyB)).toBe(true);
  });
});

describe("submit company", () => {
  it("422 when no ATS in URL", async ({ skip }) => {
    if (!dbUp) skip();
    const r = await submitCompanyUrl("https://example.com/careers");
    expect(r.status).toBe(422);
  });

  it("202 queues new ATS board; 409 when tracked", async ({ skip }) => {
    if (!dbUp) skip();
    const freshSlug = `co-submit-fresh-${stamp}`;
    const url = `https://boards.greenhouse.io/${freshSlug}`;
    const queued = await submitCompanyUrl(url);
    expect(queued.status).toBe(202);
    if (queued.status === 202) candidateIds.push(queued.candidateId);

    const again = await submitCompanyUrl(url);
    expect(again.status).toBe(409);

    const existing = await submitCompanyUrl(
      `https://boards.greenhouse.io/co-api-a-${stamp}`,
    );
    expect(existing.status).toBe(409);
  });

  it("POST /api/companies/submit status codes + rate limit", async ({
    skip,
  }) => {
    if (!dbUp) skip();
    const r422 = await submitCompany(
      new Request("http://localhost/api/companies/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": `submit-test-${stamp}`,
        },
        body: JSON.stringify({ url: "https://example.com/jobs" }),
      }),
    );
    expect(r422.status).toBe(422);

    const limiter = new SlidingWindowLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(limiter.allow("submit-ip")).toBe(true);
    }
    expect(limiter.allow("submit-ip")).toBe(false);
  });
});
