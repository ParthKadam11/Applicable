ALTER TABLE "hydra_sync_runs" ADD COLUMN IF NOT EXISTS "nodes_added" integer DEFAULT 0 NOT NULL;
ALTER TABLE "hydra_sync_runs" ADD COLUMN IF NOT EXISTS "edges_added" integer DEFAULT 0 NOT NULL;
ALTER TABLE "hydra_sync_runs" ADD COLUMN IF NOT EXISTS "removed" integer DEFAULT 0 NOT NULL;
ALTER TABLE "hydra_sync_runs" ADD COLUMN IF NOT EXISTS "relabels" integer DEFAULT 0 NOT NULL;
ALTER TABLE "hydra_sync_runs" ADD COLUMN IF NOT EXISTS "duration_ms" integer DEFAULT 0 NOT NULL;
