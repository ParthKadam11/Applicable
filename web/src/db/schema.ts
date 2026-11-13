/**
 * User-facing tables mirrored from root src/db/schema.ts.
 * Migrations live in the root drizzle/ folder.
 */
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
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

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    googleSub: text("google_sub").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
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

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    website: text("website"),
    ats: atsEnum("ats"),
    atsSlug: text("ats_slug"),
    /** Filled by migration backfill + companies_ensure_slug trigger. */
    slug: text("slug"),
    active: boolean("active").default(true),
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
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id").notNull(),
    title: text("title").notNull(),
    locationRaw: text("location_raw"),
    descriptionText: text("description_text").notNull().default(""),
    applyUrl: text("apply_url").notNull(),
    compensationRaw: jsonb("compensation_raw").$type<unknown>(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    sourceAts: atsEnum("source_ats"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("jobs_closed_at_idx").on(table.closedAt),
    index("jobs_posted_at_idx").on(table.postedAt),
    index("jobs_first_seen_at_idx").on(table.firstSeenAt),
    index("jobs_last_seen_at_idx").on(table.lastSeenAt),
    index("jobs_company_id_idx").on(table.companyId),
  ],
);

export const jobTags = pgTable(
  "job_tags",
  {
    jobId: uuid("job_id").primaryKey(),
    indiaEligibility: text("india_eligibility"),
    eligibilityEvidence: text("eligibility_evidence").array(),
    compensationMin: bigint("compensation_min", { mode: "number" }),
    compensationMax: bigint("compensation_max", { mode: "number" }),
    compensationCurrency: text("compensation_currency"),
    compensationPeriod: text("compensation_period"),
    roleFamily: text("role_family"),
    classifier: text("classifier"),
  },
  (table) => [
    index("job_tags_india_eligibility_idx").on(table.indiaEligibility),
    index("job_tags_role_family_idx").on(table.roleFamily),
  ],
);

export const fetchRuns = pgTable("fetch_runs", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id").notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok").notNull().default(false),
});

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
    labelAtSave: text("label_at_save"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("saved_jobs_user_job_uidx").on(table.userId, table.jobId),
    index("saved_jobs_user_created_idx").on(table.userId, table.createdAt),
    index("saved_jobs_user_applied_idx").on(table.userId, table.appliedAt),
  ],
);

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
