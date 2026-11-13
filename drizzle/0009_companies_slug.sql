-- Public URL slug for /dashboard/companies/[slug] + list/detail APIs
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "slug" text;--> statement-breakpoint

-- Backfill from ats_slug (preferred) or name; normalize to kebab-case
WITH base AS (
  SELECT
    id,
    lower(
      trim(
        both '-'
        from regexp_replace(
          coalesce(nullif(trim(ats_slug), ''), nullif(trim(name), ''), id::text),
          '[^a-zA-Z0-9]+',
          '-',
          'g'
        )
      )
    ) AS base_slug
  FROM companies
  WHERE slug IS NULL OR trim(slug) = ''
),
ranked AS (
  SELECT
    id,
    CASE
      WHEN base_slug = '' THEN id::text
      ELSE base_slug
    END AS base_slug,
    row_number() OVER (
      PARTITION BY
        CASE
          WHEN base_slug = '' THEN id::text
          ELSE base_slug
        END
      ORDER BY id
    ) AS rn
  FROM base
)
UPDATE companies AS c
SET slug = CASE
  WHEN r.rn = 1 THEN r.base_slug
  ELSE r.base_slug || '-' || r.rn::text
END
FROM ranked AS r
WHERE c.id = r.id;--> statement-breakpoint

-- Resolve any remaining collisions (including pre-existing slug values)
WITH dups AS (
  SELECT
    id,
    slug,
    row_number() OVER (PARTITION BY lower(slug) ORDER BY id) AS rn
  FROM companies
  WHERE slug IS NOT NULL
)
UPDATE companies AS c
SET slug = c.slug || '-' || d.rn::text
FROM dups AS d
WHERE c.id = d.id AND d.rn > 1;--> statement-breakpoint

ALTER TABLE "companies" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "companies_slug_uidx" ON "companies" ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_created_at_idx" ON "companies" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_name_idx" ON "companies" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_candidates_promoted_company_id_idx"
  ON "company_candidates" ("promoted_company_id");--> statement-breakpoint

-- Keep promote/seed working without setting slug in app code
CREATE OR REPLACE FUNCTION companies_ensure_slug() RETURNS trigger AS $$
DECLARE
  base text;
  candidate text;
  n int := 0;
BEGIN
  IF NEW.slug IS NOT NULL AND trim(NEW.slug) <> '' THEN
    RETURN NEW;
  END IF;
  base := lower(trim(both '-' from regexp_replace(
    coalesce(nullif(trim(NEW.ats_slug), ''), nullif(trim(NEW.name), ''), NEW.id::text),
    '[^a-zA-Z0-9]+', '-', 'g'
  )));
  IF base = '' THEN
    base := replace(NEW.id::text, '-', '');
  END IF;
  candidate := base;
  WHILE EXISTS (
    SELECT 1 FROM companies c WHERE c.slug = candidate AND c.id IS DISTINCT FROM NEW.id
  ) LOOP
    n := n + 1;
    candidate := base || '-' || n::text;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS companies_ensure_slug_trg ON companies;--> statement-breakpoint
CREATE TRIGGER companies_ensure_slug_trg
  BEFORE INSERT OR UPDATE OF ats_slug, name, slug
  ON companies
  FOR EACH ROW
  EXECUTE FUNCTION companies_ensure_slug();
