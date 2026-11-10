import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const atsEnum = pgEnum("ats", [
  "ashby",
  "greenhouse",
  "lever",
  "workable",
  "recruitee",
  "personio",
]);

export const candidateStatusEnum = pgEnum("candidate_status", [
  "pending",
  "verified",
  "rejected",
]);

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    website: text("website").notNull(),
    ats: atsEnum("ats").notNull(),
    atsSlug: text("ats_slug").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("companies_ats_slug_uidx").on(table.ats, table.atsSlug),
    index("companies_active_idx").on(table.active),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    department: text("department"),
    locationRaw: text("location_raw"),
    isRemoteFlag: boolean("is_remote_flag"),
    employmentType: text("employment_type"),
    descriptionText: text("description_text").notNull().default(""),
    applyUrl: text("apply_url").notNull(),
    compensationRaw: jsonb("compensation_raw").$type<unknown>(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    sourceAts: atsEnum("source_ats").notNull(),
    contentHash: text("content_hash").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("jobs_company_external_uidx").on(
      table.companyId,
      table.externalId,
    ),
    index("jobs_closed_at_idx").on(table.closedAt),
    index("jobs_posted_at_idx").on(table.postedAt),
    index("jobs_content_hash_idx").on(table.contentHash),
  ],
);

export const fetchRuns = pgTable(
  "fetch_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ok: boolean("ok").notNull().default(false),
    jobCount: integer("job_count"),
    error: text("error"),
  },
  (table) => [
    index("fetch_runs_company_started_idx").on(table.companyId, table.startedAt),
  ],
);

/** Discovered companies awaiting ATS verify / promote. */
export const companyCandidates = pgTable(
  "company_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    domain: text("domain"),
    source: text("source").notNull(),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: candidateStatusEnum("status").notNull().default("pending"),
    ats: atsEnum("ats"),
    atsSlug: text("ats_slug"),
    evidenceUrl: text("evidence_url"),
    jobCount: integer("job_count"),
    rejectReason: text("reject_reason"),
    promotedCompanyId: uuid("promoted_company_id").references(
      () => companies.id,
      { onDelete: "set null" },
    ),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("company_candidates_source_name_uidx").on(
      table.source,
      table.name,
    ),
    index("company_candidates_status_idx").on(table.status),
    index("company_candidates_source_idx").on(table.source),
  ],
);

/** Reserved for phase 2 — classification. */
export const jobTags = pgTable("job_tags", {
  jobId: uuid("job_id")
    .primaryKey()
    .references(() => jobs.id, { onDelete: "cascade" }),
  indiaEligibility: text("india_eligibility"),
  eligibilityEvidence: text("eligibility_evidence").array(),
  remoteScope: text("remote_scope"),
  interviewStyle: text("interview_style").array(),
  interviewStyleEvidence: jsonb("interview_style_evidence").$type<
    Record<string, string[]>
  >(),
  contractorOrEor: boolean("contractor_or_eor"),
  contractorOrEorEvidence: text("contractor_or_eor_evidence"),
  compensationMin: integer("compensation_min"),
  compensationMax: integer("compensation_max"),
  compensationCurrency: text("compensation_currency"),
  compensationPeriod: text("compensation_period"),
  seniority: text("seniority"),
  roleFamily: text("role_family"),
  classifier: text("classifier"),
  model: text("model"),
  classifiedAt: timestamp("classified_at", { withTimezone: true }),
  contentHash: text("content_hash"),
});

/** Reserved for phase 2 — company research. */
export const companyResearch = pgTable("company_research", {
  companyId: uuid("company_id")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),
  funding: jsonb("funding").$type<{
    amount?: string;
    round?: string;
    date?: string;
    source_url?: string;
  } | null>(),
  headcountEstimate: text("headcount_estimate"),
  headcountSourceUrl: text("headcount_source_url"),
  indiaPresence: text("india_presence"),
  indiaPresenceSourceUrl: text("india_presence_source_url"),
  hqCountry: text("hq_country"),
  hqCountrySourceUrl: text("hq_country_source_url"),
  recentNews: jsonb("recent_news")
    .$type<Array<{ title: string; url: string; date?: string }>>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  interviewReports: jsonb("interview_reports")
    .$type<Array<{ summary: string; url: string }>>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  researchedAt: timestamp("researched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type FetchRun = typeof fetchRuns.$inferSelect;
export type CompanyCandidate = typeof companyCandidates.$inferSelect;
export type NewCompanyCandidate = typeof companyCandidates.$inferInsert;
