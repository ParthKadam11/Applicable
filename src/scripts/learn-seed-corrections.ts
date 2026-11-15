/**
 * Seed corrections from rules↔prod disagreements on NON-gold jobs.
 * Also runs a 5% LLM cross-check sample when --llm is passed.
 * npm run learn:seed [-- --limit=50] [-- --llm]
 */
import { sql } from "drizzle-orm";
import { classifyIndiaEligibility } from "../classify/eligibility.js";
import type { IndiaEligibility } from "../classify/types.js";
import { db, pool } from "../db/client.js";
import { protectedGoldJobIds } from "../learn/gold.js";
import {
  acceptLlmCrosscheckCorrection,
  validateEligibilityEvidence,
} from "../learn/evidence-guard.js";
import { recordCorrection } from "../learn/corrections.js";

function argNum(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) || fallback : fallback;
}

async function main() {
  const limit = argNum("limit", 60);
  const useLlm = process.argv.includes("--llm");
  const gold = protectedGoldJobIds();

  const res = await db.execute(sql`
    SELECT j.id::text AS job_id,
           j.title,
           j.location_raw,
           j.description_text,
           t.india_eligibility AS prod_label,
           COALESCE(t.eligibility_evidence[1], '') AS evidence
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    JOIN job_tags t ON t.job_id = j.id
    WHERE j.closed_at IS NULL
      AND c.active = true
      AND (t.role_family IS NULL OR t.role_family <> 'non_tech')
      AND t.india_eligibility IS NOT NULL
    ORDER BY j.posted_at DESC NULLS LAST
    LIMIT 800
  `);

  const rows = res.rows as Array<{
    job_id: string;
    title: string;
    location_raw: string | null;
    description_text: string;
    prod_label: IndiaEligibility;
    evidence: string;
  }>;

  let seeded = 0;
  let skipped = 0;

  for (const r of rows) {
    if (seeded >= limit) break;
    if (gold.has(r.job_id)) {
      skipped += 1;
      continue;
    }
    const rules = classifyIndiaEligibility({
      title: r.title,
      locationRaw: r.location_raw,
      descriptionText: r.description_text,
    });
    if (rules.india_eligibility === r.prod_label) continue;

    let evidence = (r.evidence || "").trim();
    if (!evidence) evidence = rules.eligibility_evidence[0] ?? "";
    if (!evidence && r.location_raw) evidence = r.location_raw;
    if (!evidence) continue;

    const check = validateEligibilityEvidence({
      evidence,
      title: r.title,
      locationRaw: r.location_raw,
      descriptionText: r.description_text,
    });
    if (!check.ok) continue;

    // Prefer correcting TO prod label when prod evidence is valid (proxy human review)
    try {
      await recordCorrection(db, {
        jobId: r.job_id,
        newLabel: r.prod_label,
        evidence,
        source: "seed",
        skipGraph: false,
      });
      seeded += 1;
      console.log(
        `seed ${r.job_id.slice(0, 8)} ${rules.india_eligibility} → ${r.prod_label}`,
      );
    } catch (err) {
      console.warn(
        `skip ${r.job_id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Optional 5% LLM cross-check on rule-labeled sample
  if (useLlm) {
    const { createLlmProvider } = await import("../classify/llm/index.js");
    const provider = createLlmProvider();
    if (!provider) {
      console.warn("LLM not configured; skipping cross-check");
    } else {
      const sample = rows
        .filter((r) => !gold.has(r.job_id))
        .filter((_, i) => i % 20 === 0)
        .slice(0, 15);
      for (const r of sample) {
        if (seeded >= limit + 10) break;
        try {
          const rules = classifyIndiaEligibility({
            title: r.title,
            locationRaw: r.location_raw,
            descriptionText: r.description_text,
          });
          if (rules.india_eligibility === "unclear") continue;
          const raw = (await Promise.race([
            provider.classify({
              title: r.title,
              descriptionText: r.description_text.slice(0, 5000),
              locationRaw: r.location_raw,
              rulesHint: { india_eligibility: rules.india_eligibility },
            }),
            new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 12_000),
            ),
          ])) as {
            india_eligibility?: IndiaEligibility;
            eligibility_evidence?: string[];
          } | null;
          if (!raw?.india_eligibility) continue;
          if (raw.india_eligibility === rules.india_eligibility) continue;
          const evidence =
            raw.eligibility_evidence?.[0] ||
            r.evidence ||
            rules.eligibility_evidence[0];
          if (!evidence) continue;
          const confidence =
            typeof (raw as { confidence?: number }).confidence === "number"
              ? (raw as { confidence: number }).confidence
              : null;
          const llmOk = acceptLlmCrosscheckCorrection({
            evidence,
            title: r.title,
            locationRaw: r.location_raw,
            descriptionText: r.description_text,
            confidence,
            newLabel: raw.india_eligibility,
          });
          if (!llmOk.ok) {
            console.log(
              `llm drop ${r.job_id.slice(0, 8)} ${rules.india_eligibility} → ${raw.india_eligibility} (${llmOk.reason})`,
            );
            continue;
          }
          await recordCorrection(db, {
            jobId: r.job_id,
            newLabel: raw.india_eligibility,
            evidence,
            source: "llm_crosscheck",
            confidence,
          });
          seeded += 1;
          console.log(
            `llm ${r.job_id.slice(0, 8)} ${rules.india_eligibility} → ${raw.india_eligibility} conf=${confidence}`,
          );
        } catch (err) {
          console.warn("llm cross-check skip:", err instanceof Error ? err.message : err);
        }
      }
    }
  }

  console.log(JSON.stringify({ seeded, skipped_gold: skipped, limit }, null, 2));
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
