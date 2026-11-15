/**
 * Verify Hydra learning nodes vs Postgres + run one pattern e2e trace.
 * npm run learn:graph-verify
 */
import { and, eq, ne, sql } from "drizzle-orm";
import { classifyIndiaEligibility } from "../classify/eligibility.js";
import type { IndiaEligibility } from "../classify/types.js";
import { db, pool } from "../db/client.js";
import { companies, corrections, jobs, jobTags, learnedPatterns } from "../db/schema.js";
import { classifyV2 } from "../learn/classifier-v2.js";
import { recordCorrection } from "../learn/corrections.js";
import { protectedGoldJobIds } from "../learn/gold.js";
import {
  countLearningGraphNodes,
  lookupPatternInGraph,
} from "../learn/graph-learn.js";
import { loadPatterns, matchPatterns } from "../learn/patterns.js";

async function main() {
  const [{ corrN } = { corrN: 0 }] = await db
    .select({ corrN: sql<number>`count(*)::int` })
    .from(corrections);
  const [{ patN } = { patN: 0 }] = await db
    .select({ patN: sql<number>`count(*)::int` })
    .from(learnedPatterns);

  const hydra = await countLearningGraphNodes();
  console.log(
    JSON.stringify(
      {
        postgres: { corrections: Number(corrN), patterns: Number(patN) },
        hydra,
      },
      null,
      2,
    ),
  );

  // E2E trace: use an active multi-company pattern (Argentina) when possible.
  const gold = protectedGoldJobIds();
  const res = await db.execute(sql`
    SELECT j.id::text AS job_id, j.title, j.location_raw, j.description_text,
           j.company_id::text AS company_id, c.name AS company,
           t.india_eligibility AS prod
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    JOIN job_tags t ON t.job_id = j.id
    WHERE j.closed_at IS NULL AND c.active = true
      AND j.location_raw ~* 'Argentina'
      AND (t.role_family IS NULL OR t.role_family <> 'non_tech')
    LIMIT 20
  `);
  const rows = (res.rows as Array<{
    job_id: string;
    title: string;
    location_raw: string;
    description_text: string;
    company_id: string;
    company: string;
    prod: string;
  }>).filter((r) => !gold.has(r.job_id));

  if (rows.length < 2) {
    console.log(JSON.stringify({ trace: "skipped", reason: "need ≥2 Argentina non-gold jobs" }));
    await pool.end();
    return;
  }

  // Pick two different companies if possible
  const seed = rows[0]!;
  const target =
    rows.find((r) => r.company_id !== seed.company_id) ?? rows[1]!;

  const beforeRules = classifyIndiaEligibility({
    title: target.title,
    locationRaw: target.location_raw,
    descriptionText: target.description_text,
  });

  const corr = await recordCorrection(db, {
    jobId: seed.job_id,
    newLabel: "region_locked",
    evidence: seed.location_raw.trim(),
    source: "seed",
  });

  const phrase = corr.pattern?.phrase ?? seed.location_raw.trim();
  const graphPat = await lookupPatternInGraph(phrase);
  const patternSource: "hydra" | "postgres_fallback" = graphPat.found
    ? "hydra"
    : "postgres_fallback";
  console.log(`[learn:graph-verify] pattern_lookup_source=${patternSource}`);

  const patterns = await loadPatterns(db, { includeCandidates: true });
  const hit = matchPatterns(
    `${target.title}\nLocation: ${target.location_raw}\n${target.description_text}`,
    patterns.filter((p) => p.status === "active"),
  );
  const after = await classifyV2(
    {
      title: target.title,
      locationRaw: target.location_raw,
      descriptionText: target.description_text,
      jobId: target.job_id,
      companyId: target.company_id,
    },
    {
      db,
      patterns: patterns.filter((p) => p.status === "active"),
      useCompanyPrior: false,
      useLlm: false,
    },
  );

  console.log(
    JSON.stringify(
      {
        trace: {
          seed_job: seed.job_id,
          seed_company: seed.company,
          evidence: seed.location_raw,
          correction_id: corr.correction_id,
          pattern: corr.pattern,
          graph_push: corr.graph,
          graph_pattern_lookup: graphPat,
          pattern_lookup_source: patternSource,
          target_job: target.job_id,
          target_company: target.company,
          target_before_rules: beforeRules.india_eligibility,
          target_pattern_hit: hit,
          target_after_v2: {
            label: after.india_eligibility,
            source: after.source,
            evidence: after.eligibility_evidence,
          },
        },
      },
      null,
      2,
    ),
  );

  void and;
  void eq;
  void ne;
  void companies;
  void jobs;
  void jobTags;
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
