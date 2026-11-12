/**
 * User-facing tables mirrored from root src/db/schema.ts.
 * Migrations live in the root drizzle/ folder.
 */
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    googleSub: text("google_sub").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_google_sub_uidx").on(table.googleSub)],
);

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey(),
  companyId: uuid("company_id").notNull(),
  title: text("title").notNull(),
  locationRaw: text("location_raw"),
  applyUrl: text("apply_url").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
});

export const jobTags = pgTable("job_tags", {
  jobId: uuid("job_id").primaryKey(),
  indiaEligibility: text("india_eligibility"),
  eligibilityEvidence: text("eligibility_evidence").array(),
});

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
  },
  (table) => [
    uniqueIndex("saved_jobs_user_job_uidx").on(table.userId, table.jobId),
    index("saved_jobs_user_created_idx").on(table.userId, table.createdAt),
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
