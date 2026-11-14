ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "hydra_synced_at" timestamp with time zone;
ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "hydra_content_hash" text;
CREATE INDEX IF NOT EXISTS "jobs_hydra_synced_at_idx" ON "jobs" ("hydra_synced_at");
CREATE INDEX IF NOT EXISTS "jobs_hydra_content_hash_idx" ON "jobs" ("hydra_content_hash");

CREATE TABLE IF NOT EXISTS "hydra_sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone,
  "pushed" integer DEFAULT 0 NOT NULL,
  "updated" integer DEFAULT 0 NOT NULL,
  "deleted" integer DEFAULT 0 NOT NULL,
  "failed" integer DEFAULT 0 NOT NULL,
  "error" text
);
