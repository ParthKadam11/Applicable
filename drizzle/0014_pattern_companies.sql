ALTER TABLE "learned_patterns"
  ADD COLUMN IF NOT EXISTS "company_ids" text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE "learned_patterns"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'candidate';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learned_patterns_status_idx" ON "learned_patterns" ("status");
