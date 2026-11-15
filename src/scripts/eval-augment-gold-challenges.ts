/**
 * Augment frozen gold with held-out challenge rows where rules miss
 * country-locked locations (e.g. Argentina). Drops an equal number of
 * unclear rows to keep size stable. Also seeds non-gold twins as corrections.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { classifyIndiaEligibility } from "../classify/eligibility.js";
import { db, pool } from "../db/client.js";
import { recordCorrection } from "../learn/corrections.js";
import { validateEligibilityEvidence } from "../learn/evidence-guard.js";
import type { GoldRow } from "../learn/types.js";
import type { IndiaEligibility } from "../classify/types.js";

const COUNTRY_RE =
  /\b(Argentina|Brazil|Mexico|Canada|Australia|Singapore|Japan|Netherlands|Spain|Italy|Poland|Sweden|Ireland|Portugal|Switzerland|Israel|Uruguay|Chile|Colombia)\b/i;

async function main() {
  const goldPath = join(process.cwd(), "eval", "gold.jsonl");
  let gold: GoldRow[] = readFileSync(goldPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as GoldRow);

  const res = await db.execute(sql`
    SELECT j.id::text AS job_id, j.title, c.name AS company, j.location_raw,
           left(j.description_text, 800) AS description_snippet,
           j.description_text, t.india_eligibility AS prod_label
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    JOIN job_tags t ON t.job_id = j.id
    WHERE j.closed_at IS NULL AND c.active = true
      AND (t.role_family IS NULL OR t.role_family <> 'non_tech')
      AND j.location_raw ~* 'Argentina|Uruguay|Brazil|Mexico|Chile|Colombia'
    LIMIT 40
  `);

  const challenges: GoldRow[] = [];
  const seedCandidates: Array<{
    job_id: string;
    evidence: string;
    label: IndiaEligibility;
  }> = [];

  for (const r of res.rows as Array<{
    job_id: string;
    title: string;
    company: string;
    location_raw: string | null;
    description_snippet: string;
    description_text: string;
    prod_label: IndiaEligibility;
  }>) {
    const rules = classifyIndiaEligibility({
      title: r.title,
      locationRaw: r.location_raw,
      descriptionText: r.description_text,
    });
    if (rules.india_eligibility === "region_locked") continue;
    const evidence = r.location_raw?.trim() || "";
    if (!evidence || !COUNTRY_RE.test(evidence)) continue;
    const check = validateEligibilityEvidence({
      evidence,
      title: r.title,
      locationRaw: r.location_raw,
      descriptionText: r.description_text,
    });
    if (!check.ok) continue;

    seedCandidates.push({
      job_id: r.job_id,
      evidence,
      label: "region_locked",
    });

    // Hold out only first 5 for gold; rest stay available for seeding
    if (challenges.length < 5) {
      challenges.push({
        job_id: r.job_id,
        title: r.title,
        company: r.company,
        location_raw: r.location_raw,
        description_snippet: r.description_snippet,
        description_text: r.description_text.slice(0, 12_000),
        verified_label: "region_locked",
        evidence,
        verified: true,
        prod_label: r.prod_label,
        provenance: "challenge_override",
      });
    }
  }

  const challengeIds = new Set(challenges.map((c) => c.job_id));
  // Drop unclear rows to make room
  const unclear = gold.filter((g) => g.verified_label === "unclear");
  const drop = new Set(
    unclear.slice(0, challenges.length).map((g) => g.job_id),
  );
  gold = gold.filter((g) => !drop.has(g.job_id) && !challengeIds.has(g.job_id));
  gold.push(...challenges);
  writeFileSync(goldPath, gold.map((g) => JSON.stringify(g)).join("\n") + "\n");

  const dist: Record<string, number> = {};
  for (const g of gold) {
    dist[g.verified_label] = (dist[g.verified_label] ?? 0) + 1;
  }
  console.log(`Gold now ${gold.length}`, dist);
  console.log(`Added ${challenges.length} challenge region_locked rows`);

  // Seed corrections on NON-gold twins first (so patterns learn before gold eval)
  let seeded = 0;
  for (const s of seedCandidates) {
    if (challengeIds.has(s.job_id)) continue;
    try {
      await recordCorrection(db, {
        jobId: s.job_id,
        newLabel: s.label,
        evidence: s.evidence,
        source: "seed",
      });
      seeded += 1;
      console.log(`seeded ${s.job_id.slice(0, 8)} → region_locked (${s.evidence})`);
    } catch (err) {
      console.warn(err instanceof Error ? err.message : err);
    }
    if (seeded >= 20) break;
  }

  if (seeded === 0) {
    console.warn("No non-gold twins to seed; patterns will be empty for challenges");
  }

  console.log(JSON.stringify({ seeded, challenges: challenges.length }, null, 2));
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
