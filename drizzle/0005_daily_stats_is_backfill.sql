ALTER TABLE "daily_stats" ADD COLUMN IF NOT EXISTS "is_backfill" boolean DEFAULT false NOT NULL;
