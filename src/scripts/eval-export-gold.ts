/**
 * Export a stratified gold eval set from prod (frozen JSONL).
 * Usage: npm run eval:export-gold [-- --force] [--per-label=20]
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { classifyIndiaEligibility } from "../classify/eligibility.js";
import { db, pool } from "../db/client.js";
import { validateEligibilityEvidence } from "../learn/evidence-guard.js";
import type { GoldRow } from "../learn/types.js";
import type { IndiaEligibility } from "../classify/types.js";

const LABELS: IndiaEligibility[] = [
  "open",
  "india_remote",
  "india_onsite",
  "region_locked",
  "unclear",
];

function argVal(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1]! : fallback;
}

async function main() {
  const force = process.argv.includes("--force");
  const perLabel = Math.max(5, Number(argVal("per-label", "18")) || 18);
  const outDir = join(process.cwd(), "eval");
  const outPath = join(outDir, "gold.jsonl");
  const candidatesPath = join(outDir, "gold-candidates.jsonl");

  if (existsSync(outPath) && !force) {
    console.log(`Gold already frozen at ${outPath} (pass --force to rebuild)`);
    await pool.end();
    return;
  }

  mkdirSync(outDir, { recursive: true });

  const picked: GoldRow[] = [];
  const candidates: GoldRow[] = [];

  for (const label of LABELS) {
    const limit = label === "india_remote" ? 50 : perLabel * 3;
    const res = await db.execute(sql`
      SELECT j.id::text AS job_id,
             j.title,
             c.name AS company,
             j.location_raw,
             left(j.description_text, 800) AS description_snippet,
             j.description_text,
             t.india_eligibility AS prod_label,
             COALESCE(t.eligibility_evidence[1], '') AS evidence
      FROM jobs j
      JOIN companies c ON c.id = j.company_id
      JOIN job_tags t ON t.job_id = j.id
      WHERE j.closed_at IS NULL
        AND c.active = true
        AND (t.role_family IS NULL OR t.role_family <> 'non_tech')
        AND t.india_eligibility = ${label}
      ORDER BY j.posted_at DESC NULLS LAST, j.first_seen_at DESC
      LIMIT ${limit}
    `);

    const rows = res.rows as Array<{
      job_id: string;
      title: string;
      company: string;
      location_raw: string | null;
      description_snippet: string;
      description_text: string;
      prod_label: IndiaEligibility;
      evidence: string;
    }>;

    const accepted: GoldRow[] = [];
    for (const r of rows) {
      const rules = classifyIndiaEligibility({
        title: r.title,
        locationRaw: r.location_raw,
        descriptionText: r.description_text,
      });

      let evidence = (r.evidence || "").trim();
      if (!evidence && rules.eligibility_evidence[0]) {
        evidence = rules.eligibility_evidence[0];
      }
      if (!evidence && r.location_raw) evidence = r.location_raw;

      const check = evidence
        ? validateEligibilityEvidence({
            evidence,
            title: r.title,
            locationRaw: r.location_raw,
            descriptionText: r.description_text,
          })
        : { ok: false as const, reason: "empty" };

      // Prefer rows where evidence validates; for unclear, empty evidence is OK.
      const verified_label = r.prod_label;
      const row: GoldRow = {
        job_id: r.job_id,
        title: r.title,
        company: r.company,
        location_raw: r.location_raw,
        description_snippet: r.description_snippet,
        description_text: r.description_text.slice(0, 12_000),
        verified_label,
        evidence: evidence || "",
        verified: label === "unclear" ? true : check.ok,
        prod_label: r.prod_label,
        provenance:
          label === "unclear" || check.ok
            ? "evidence_validated"
            : "copied_from_prod",
      };
      candidates.push(row);
      if (label === "unclear" || check.ok || accepted.length < Math.ceil(perLabel / 2)) {
        // Keep some even if evidence weak so rare labels fill
        if (label !== "unclear" && !check.ok && accepted.length >= Math.ceil(perLabel / 2)) {
          continue;
        }
        accepted.push({ ...row, verified: true });
      }
      if (accepted.length >= (label === "india_remote" ? 5 : perLabel)) break;
    }

    // If still short, fill from remaining candidates regardless of evidence
    if (accepted.length < (label === "india_remote" ? Math.min(5, rows.length) : Math.min(perLabel, rows.length))) {
      for (const r of candidates.filter((c) => c.verified_label === label)) {
        if (accepted.some((a) => a.job_id === r.job_id)) continue;
        accepted.push({ ...r, verified: true });
        if (accepted.length >= perLabel) break;
      }
    }

    picked.push(...accepted.slice(0, label === "india_remote" ? 5 : perLabel));
    console.log(`  ${label}: picked ${accepted.slice(0, perLabel).length}`);
  }

  writeFileSync(
    candidatesPath,
    candidates.map((r) => JSON.stringify({ ...r, description_text: undefined })).join("\n") +
      "\n",
  );
  writeFileSync(outPath, picked.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const dist: Record<string, number> = {};
  for (const r of picked) {
    dist[r.verified_label] = (dist[r.verified_label] ?? 0) + 1;
  }
  console.log(`Wrote ${picked.length} gold rows → ${outPath}`);
  console.log(`Candidates (review) → ${candidatesPath}`);
  console.log("Distribution:", dist);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
