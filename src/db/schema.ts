import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const atsEnum = pgEnum("ats", ["ashby", "greenhouse", "lever"]);

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
    /**
     * Public URL slug for /dashboard/companies/[slug].
     * DB trigger fills from ats_slug/name when omitted (promote/seed).
     */
    slug: text("slug"),
    active: boolean("active").notNull().default(true),
    foundedYear: integer("founded_year"),
    teamSize: integer("team_size"),
    oneLiner: text("one_liner"),
    hqCity: text("hq_city"),
    hqCountry: text("hq_country"),
    ycBatch: text("yc_batch"),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("companies_ats_slug_uidx").on(table.ats, table.atsSlug),
    uniqueIndex("companies_slug_uidx").on(table.slug),
    index("companies_active_idx").on(table.active),
    index("companies_created_at_idx").on(table.createdAt),
    index("companies_name_idx").on(table.name),
    index("companies_enriched_at_idx").on(table.enrichedAt),
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
    /** Last successful HydraDB push for this job (null = never synced). */
    hydraSyncedAt: timestamp("hydra_synced_at", { withTimezone: true }),
    /** Hash of content_hash + label last pushed to HydraDB. */
    hydraContentHash: text("hydra_content_hash"),
  },
  (table) => [
    uniqueIndex("jobs_company_external_uidx").on(
      table.companyId,
      table.externalId,
    ),
    index("jobs_closed_at_idx").on(table.closedAt),
    index("jobs_posted_at_idx").on(table.postedAt),
    index("jobs_first_seen_at_idx").on(table.firstSeenAt),
    index("jobs_last_seen_at_idx").on(table.lastSeenAt),
    index("jobs_company_id_idx").on(table.companyId),
    index("jobs_content_hash_idx").on(table.contentHash),
    index("jobs_hydra_synced_at_idx").on(table.hydraSyncedAt),
    index("jobs_hydra_content_hash_idx").on(table.hydraContentHash),
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
    index("company_candidates_promoted_company_id_idx").on(
      table.promotedCompanyId,
    ),
  ],
);

/** India eligibility + role tags written by rules/LLM classification. */
export const jobTags = pgTable(
  "job_tags",
  {
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
    compensationMin: bigint("compensation_min", { mode: "number" }),
    compensationMax: bigint("compensation_max", { mode: "number" }),
    compensationCurrency: text("compensation_currency"),
    compensationPeriod: text("compensation_period"),
    seniority: text("seniority"),
    roleFamily: text("role_family"),
    classifier: text("classifier"),
    model: text("model"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    contentHash: text("content_hash"),
  },
  (table) => [
    index("job_tags_india_eligibility_idx").on(table.indiaEligibility),
    index("job_tags_role_family_idx").on(table.roleFamily),
    index("job_tags_content_hash_idx").on(table.contentHash),
  ],
);

/**
 * Cache of ATS board probes (Common Crawl discovery, etc.).
 * Re-runs skip slugs checked within the last 7 days.
 */
export const atsBoardChecks = pgTable(
  "ats_board_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ats: atsEnum("ats").notNull(),
    slug: text("slug").notNull(),
    /** valid | not_found | empty | error */
    status: text("status").notNull(),
    jobCount: integer("job_count"),
    checkedAt: timestamp("checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    error: text("error"),
  },
  (table) => [
    uniqueIndex("ats_board_checks_ats_slug_uidx").on(table.ats, table.slug),
    index("ats_board_checks_checked_at_idx").on(table.checkedAt),
  ],
);

/** One row per calendar day (Asia/Kolkata) - landing page + MCP history. */
export const dailyStats = pgTable("daily_stats", {
  date: date("date").primaryKey(),
  companiesActive: integer("companies_active").notNull(),
  techOpenJobs: integer("tech_open_jobs").notNull(),
  eligibilityOpen: integer("eligibility_open").notNull().default(0),
  eligibilityIndiaRemote: integer("eligibility_india_remote")
    .notNull()
    .default(0),
  eligibilityIndiaOnsite: integer("eligibility_india_onsite")
    .notNull()
    .default(0),
  eligibilityRegionLocked: integer("eligibility_region_locked")
    .notNull()
    .default(0),
  eligibilityUnclear: integer("eligibility_unclear").notNull().default(0),
  newJobs24h: integer("new_jobs_24h").notNull().default(0),
  closedJobs24h: integer("closed_jobs_24h").notNull().default(0),
  /** True for one-shot backfill rows - charts should skip these. */
  isBackfill: boolean("is_backfill").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Google-auth users (Auth.js upserts by google_sub). */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    googleSub: text("google_sub").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    /** Jobs / AI Search defaults. Shape validated in web preferences Zod. */
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_google_sub_uidx").on(table.googleSub)],
);

export const savedJobs = pgTable(
  "saved_jobs",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** India-eligibility label snapshot when the user saved the job. */
    labelAtSave: text("label_at_save"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("saved_jobs_user_job_uidx").on(table.userId, table.jobId),
    index("saved_jobs_user_created_idx").on(table.userId, table.createdAt),
    index("saved_jobs_user_applied_idx").on(table.userId, table.appliedAt),
  ],
);

/** Personal MCP bearer tokens. Store sha256 only; never log the raw token. */
export const mcpTokens = pgTable(
  "mcp_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("mcp_tokens_token_hash_uidx").on(table.tokenHash),
    index("mcp_tokens_user_idx").on(table.userId),
  ],
);

/** One row per graph sync run (CLI or pg-boss). Failures never throw to ingest. */
export const hydraSyncRuns = pgTable("hydra_sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  /** Legacy counters (still written; prefer nodes_added / edges_added). */
  pushed: integer("pushed").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  deleted: integer("deleted").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  error: text("error"),
  nodesAdded: integer("nodes_added").notNull().default(0),
  edgesAdded: integer("edges_added").notNull().default(0),
  removed: integer("removed").notNull().default(0),
  relabels: integer("relabels").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
});

/** Crowdsourced corrections for India-eligibility labels. */
export const labelReports = pgTable(
  "label_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    suggestedLabel: text("suggested_label"),
    note: text("note"),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("label_reports_job_id_idx").on(table.jobId),
    index("label_reports_created_at_idx").on(table.createdAt),
  ],
);

/**
 * Verified eligibility corrections used by the continual-learning loop.
 * Gold-eval job_ids must never appear here (enforced in application code).
 */
export const corrections = pgTable(
  "corrections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    oldLabel: text("old_label"),
    newLabel: text("new_label").notNull(),
    evidence: text("evidence").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("corrections_job_id_idx").on(table.jobId),
    index("corrections_created_at_idx").on(table.createdAt),
    index("corrections_source_idx").on(table.source),
  ],
);

/** Phrase → label patterns extracted/aggregated from corrections. */
export const learnedPatterns = pgTable(
  "learned_patterns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phrase: text("phrase").notNull(),
    label: text("label").notNull(),
    weight: real("weight").notNull().default(1),
    hitCount: integer("hit_count").notNull().default(1),
    /** Distinct company ids that contributed this phrase (≥2 → status active). */
    companyIds: text("company_ids").array().notNull().default([]),
    /** candidate until ≥2 independent companies; then active. */
    status: text("status").notNull().default("candidate"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("learned_patterns_phrase_uidx").on(table.phrase),
    index("learned_patterns_label_idx").on(table.label),
    index("learned_patterns_status_idx").on(table.status),
  ],
);

/** People (founders / employees) linked via company_people. */
export const people = pgTable(
  "people",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    linkedin: text("linkedin"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("people_name_norm_uidx").on(table.nameNormalized)],
);

export const investors = pgTable(
  "investors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("investors_name_norm_uidx").on(table.nameNormalized)],
);

export const investorAliases = pgTable("investor_aliases", {
  aliasNormalized: text("alias_normalized").primaryKey(),
  investorId: uuid("investor_id")
    .notNull()
    .references(() => investors.id, { onDelete: "cascade" }),
});

export const companyFacts = pgTable(
  "company_facts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    factType: text("fact_type").notNull(),
    value: text("value").notNull(),
    sourceUrl: text("source_url").notNull(),
    quote: text("quote").notNull(),
    sourceKind: text("source_kind").notNull(),
    confidence: real("confidence").notNull().default(1),
    extractedAt: timestamp("extracted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("company_facts_company_idx").on(table.companyId),
    index("company_facts_type_idx").on(table.factType),
    uniqueIndex("company_facts_dedupe_uidx").on(
      table.companyId,
      table.factType,
      table.value,
      table.sourceUrl,
    ),
  ],
);

export const companyPeople = pgTable(
  "company_people",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    title: text("title"),
    sourceUrl: text("source_url").notNull(),
    quote: text("quote").notNull(),
    extractedAt: timestamp("extracted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("company_people_uidx").on(
      table.companyId,
      table.personId,
      table.role,
    ),
  ],
);

export const companyInvestors = pgTable(
  "company_investors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id, { onDelete: "cascade" }),
    round: text("round"),
    sourceUrl: text("source_url").notNull(),
    quote: text("quote").notNull(),
    extractedAt: timestamp("extracted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("company_investors_uidx").on(table.companyId, table.investorId),
  ],
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type FetchRun = typeof fetchRuns.$inferSelect;
export type CompanyCandidate = typeof companyCandidates.$inferSelect;
export type NewCompanyCandidate = typeof companyCandidates.$inferInsert;
export type AtsBoardCheck = typeof atsBoardChecks.$inferSelect;
export type DailyStats = typeof dailyStats.$inferSelect;
export type User = typeof users.$inferSelect;
export type SavedJob = typeof savedJobs.$inferSelect;
export type McpToken = typeof mcpTokens.$inferSelect;
export type HydraSyncRun = typeof hydraSyncRuns.$inferSelect;
export type CompanyFact = typeof companyFacts.$inferSelect;
export type Person = typeof people.$inferSelect;
export type Investor = typeof investors.$inferSelect;
