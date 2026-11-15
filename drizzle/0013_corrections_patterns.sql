CREATE TABLE IF NOT EXISTS "corrections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "jobs"("id") ON DELETE CASCADE,
  "old_label" text,
  "new_label" text NOT NULL,
  "evidence" text NOT NULL,
  "source" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "corrections_job_id_idx" ON "corrections" ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "corrections_created_at_idx" ON "corrections" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "corrections_source_idx" ON "corrections" ("source");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learned_patterns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "phrase" text NOT NULL,
  "label" text NOT NULL,
  "weight" real DEFAULT 1 NOT NULL,
  "hit_count" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "learned_patterns_phrase_uidx" ON "learned_patterns" ("phrase");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learned_patterns_label_idx" ON "learned_patterns" ("label");
