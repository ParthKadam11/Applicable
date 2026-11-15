ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "founded_year" integer,
  ADD COLUMN IF NOT EXISTS "team_size" integer,
  ADD COLUMN IF NOT EXISTS "one_liner" text,
  ADD COLUMN IF NOT EXISTS "hq_city" text,
  ADD COLUMN IF NOT EXISTS "hq_country" text,
  ADD COLUMN IF NOT EXISTS "yc_batch" text,
  ADD COLUMN IF NOT EXISTS "enriched_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "people" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "name_normalized" text NOT NULL,
  "linkedin" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "people_name_norm_uidx" ON "people" ("name_normalized");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "name_normalized" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "investors_name_norm_uidx" ON "investors" ("name_normalized");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "investor_aliases" (
  "alias_normalized" text PRIMARY KEY NOT NULL,
  "investor_id" uuid NOT NULL REFERENCES "investors"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_facts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "fact_type" text NOT NULL,
  "value" text NOT NULL,
  "source_url" text NOT NULL,
  "quote" text NOT NULL,
  "source_kind" text NOT NULL,
  "confidence" real DEFAULT 1 NOT NULL,
  "extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_facts_company_idx" ON "company_facts" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_facts_type_idx" ON "company_facts" ("fact_type");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_facts_dedupe_uidx"
  ON "company_facts" ("company_id", "fact_type", "value", "source_url");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_people" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "title" text,
  "source_url" text NOT NULL,
  "quote" text NOT NULL,
  "extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_people_uidx"
  ON "company_people" ("company_id", "person_id", "role");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_investors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "investor_id" uuid NOT NULL REFERENCES "investors"("id") ON DELETE CASCADE,
  "round" text,
  "source_url" text NOT NULL,
  "quote" text NOT NULL,
  "extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_investors_uidx"
  ON "company_investors" ("company_id", "investor_id");
