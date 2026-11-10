CREATE TYPE "public"."candidate_status" AS ENUM('pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "company_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"source" text NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "candidate_status" DEFAULT 'pending' NOT NULL,
	"ats" "ats",
	"ats_slug" text,
	"evidence_url" text,
	"job_count" integer,
	"reject_reason" text,
	"promoted_company_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_candidates" ADD CONSTRAINT "company_candidates_promoted_company_id_companies_id_fk" FOREIGN KEY ("promoted_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_candidates_source_name_uidx" ON "company_candidates" USING btree ("source","name");--> statement-breakpoint
CREATE INDEX "company_candidates_status_idx" ON "company_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "company_candidates_source_idx" ON "company_candidates" USING btree ("source");
