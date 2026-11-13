-- Server-side user preferences for Jobs / AI Search defaults
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

-- last_used_at already exists on mcp_tokens (0006); ensure column present for older DBs
ALTER TABLE "mcp_tokens" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;
