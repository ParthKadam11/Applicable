CREATE TYPE "public"."ats" AS ENUM('ashby', 'greenhouse', 'lever', 'workable', 'recruitee', 'personio');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"website" text NOT NULL,
	"ats" "ats" NOT NULL,
	"ats_slug" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_research" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"funding" jsonb,
	"headcount_estimate" text,
	"headcount_source_url" text,
	"india_presence" text,
	"india_presence_source_url" text,
	"hq_country" text,
	"hq_country_source_url" text,
	"recent_news" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"interview_reports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"researched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fetch_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean DEFAULT false NOT NULL,
	"job_count" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "job_tags" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"india_eligibility" text,
	"eligibility_evidence" text[],
	"remote_scope" text,
	"interview_style" text[],
	"interview_style_evidence" jsonb,
	"contractor_or_eor" boolean,
	"contractor_or_eor_evidence" text,
	"compensation_min" integer,
	"compensation_max" integer,
	"compensation_currency" text,
	"compensation_period" text,
	"seniority" text,
	"role_family" text,
	"classifier" text,
	"model" text,
	"classified_at" timestamp with time zone,
	"content_hash" text
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"department" text,
	"location_raw" text,
	"is_remote_flag" boolean,
	"employment_type" text,
	"description_text" text DEFAULT '' NOT NULL,
	"apply_url" text NOT NULL,
	"compensation_raw" jsonb,
	"posted_at" timestamp with time zone,
	"source_ats" "ats" NOT NULL,
	"content_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_research" ADD CONSTRAINT "company_research_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fetch_runs" ADD CONSTRAINT "fetch_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_tags" ADD CONSTRAINT "job_tags_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_ats_slug_uidx" ON "companies" USING btree ("ats","ats_slug");--> statement-breakpoint
CREATE INDEX "companies_active_idx" ON "companies" USING btree ("active");--> statement-breakpoint
CREATE INDEX "fetch_runs_company_started_idx" ON "fetch_runs" USING btree ("company_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_company_external_uidx" ON "jobs" USING btree ("company_id","external_id");--> statement-breakpoint
CREATE INDEX "jobs_closed_at_idx" ON "jobs" USING btree ("closed_at");--> statement-breakpoint
CREATE INDEX "jobs_posted_at_idx" ON "jobs" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "jobs_content_hash_idx" ON "jobs" USING btree ("content_hash");