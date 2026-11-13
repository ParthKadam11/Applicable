-- Indexes for dashboard /api/jobs filters + pagination
CREATE INDEX IF NOT EXISTS "job_tags_india_eligibility_idx" ON "job_tags" ("india_eligibility");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_first_seen_at_idx" ON "jobs" ("first_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_company_id_idx" ON "jobs" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_last_seen_at_idx" ON "jobs" ("last_seen_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_tags_role_family_idx" ON "job_tags" ("role_family");--> statement-breakpoint

-- Public "report wrong label" submissions
CREATE TABLE IF NOT EXISTS "label_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid,
	"suggested_label" text,
	"note" text,
	"ip_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "label_reports" ADD CONSTRAINT "label_reports_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "label_reports" ADD CONSTRAINT "label_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "label_reports_job_id_idx" ON "label_reports" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "label_reports_created_at_idx" ON "label_reports" ("created_at");
