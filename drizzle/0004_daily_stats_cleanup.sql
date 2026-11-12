-- Drop unused company research table
DROP TABLE IF EXISTS "company_research";
--> statement-breakpoint

-- Daily corpus snapshot for landing / MCP history
CREATE TABLE "daily_stats" (
	"date" date PRIMARY KEY NOT NULL,
	"companies_active" integer NOT NULL,
	"tech_open_jobs" integer NOT NULL,
	"eligibility_open" integer NOT NULL DEFAULT 0,
	"eligibility_india_remote" integer NOT NULL DEFAULT 0,
	"eligibility_india_onsite" integer NOT NULL DEFAULT 0,
	"eligibility_region_locked" integer NOT NULL DEFAULT 0,
	"eligibility_unclear" integer NOT NULL DEFAULT 0,
	"new_jobs_24h" integer NOT NULL DEFAULT 0,
	"closed_jobs_24h" integer NOT NULL DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Narrow ats enum to implemented adapters only (ashby, greenhouse, lever)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ats' AND e.enumlabel IN ('workable', 'recruitee', 'personio')
  ) THEN
    CREATE TYPE "public"."ats_new" AS ENUM('ashby', 'greenhouse', 'lever');

    ALTER TABLE "companies" ALTER COLUMN "ats" TYPE "public"."ats_new" USING ("ats"::text::"public"."ats_new");
    ALTER TABLE "jobs" ALTER COLUMN "source_ats" TYPE "public"."ats_new" USING ("source_ats"::text::"public"."ats_new");
    ALTER TABLE "company_candidates" ALTER COLUMN "ats" TYPE "public"."ats_new" USING (
      CASE WHEN "ats" IS NULL THEN NULL ELSE "ats"::text::"public"."ats_new" END
    );
    ALTER TABLE "ats_board_checks" ALTER COLUMN "ats" TYPE "public"."ats_new" USING ("ats"::text::"public"."ats_new");

    DROP TYPE "public"."ats";
    ALTER TYPE "public"."ats_new" RENAME TO "ats";
  END IF;
END $$;
