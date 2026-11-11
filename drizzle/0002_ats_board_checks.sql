CREATE TABLE IF NOT EXISTS "ats_board_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ats" "ats" NOT NULL,
	"slug" text NOT NULL,
	"status" text NOT NULL,
	"job_count" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ats_board_checks_ats_slug_uidx" ON "ats_board_checks" USING btree ("ats","slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ats_board_checks_checked_at_idx" ON "ats_board_checks" USING btree ("checked_at");
