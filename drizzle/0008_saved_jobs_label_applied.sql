-- Persist label at save time + applied tracking for /dashboard/saved
ALTER TABLE "saved_jobs" ADD COLUMN IF NOT EXISTS "label_at_save" text;--> statement-breakpoint
ALTER TABLE "saved_jobs" ADD COLUMN IF NOT EXISTS "applied_at" timestamp with time zone;--> statement-breakpoint

-- Backfill from current job_tags label (null if job/tag missing)
UPDATE "saved_jobs" AS s
SET "label_at_save" = t."india_eligibility"
FROM "job_tags" AS t
WHERE t."job_id" = s."job_id"
  AND s."label_at_save" IS NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "saved_jobs_user_applied_idx" ON "saved_jobs" ("user_id", "applied_at");
