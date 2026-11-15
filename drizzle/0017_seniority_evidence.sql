ALTER TABLE job_tags ADD COLUMN IF NOT EXISTS seniority_evidence text;
ALTER TABLE job_tags ADD COLUMN IF NOT EXISTS years_experience_min integer;
ALTER TABLE job_tags ADD COLUMN IF NOT EXISTS years_experience_max integer;
CREATE INDEX IF NOT EXISTS job_tags_seniority_idx ON job_tags (seniority);
UPDATE job_tags SET seniority = 'entry' WHERE seniority = 'junior';
