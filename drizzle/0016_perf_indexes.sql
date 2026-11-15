-- Hot-path indexes from performance audit.
CREATE INDEX IF NOT EXISTS job_tags_content_hash_idx ON job_tags (content_hash);
CREATE INDEX IF NOT EXISTS companies_enriched_at_idx ON companies (enriched_at);
