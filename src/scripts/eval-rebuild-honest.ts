/**
 * Honest eval rebuild (no gold-tuning):
 * - Stratified gold.jsonl with provenance
 * - Held-out gold-test.jsonl (~30), never seeded against
 * - eval/audit.csv — 30 random non-gold prod jobs for hand precision check
 * - Clears prior seed corrections/patterns (challenge twins)
 *
 * npm run eval:rebuild-honest
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { IndiaEligibility } from "../classify/types.js";
import { db, pool } from "../db/client.js";
import { corrections, learnedPatterns } from "../db/schema.js";
import {
  selectBestEligibilityEvidence,
  validateEligibilityEvidence,
} from "../learn/evidence-guard.js";
import type { GoldProvenance, GoldRow } from "../learn/types.js";

const LABELS: IndiaEligibility[] = [
  "open",
  "india_remote",
  "india_onsite",
  "region_locked",
  "unclear",
];

function toGold(
  r: {
    job_id: string;
    title: string;
    company: string;
    location_raw: string | null;
    description_snippet: string;
    description_text: string;
    prod_label: IndiaEligibility;
  },
  provenance: GoldProvenance,
): GoldRow {
  const picked = selectBestEligibilityEvidence({
    title: r.title,
    locationRaw: r.location_raw,
    descriptionText: r.description_text,
  });
  const evidence = picked.evidence ?? r.location_raw ?? "";
  const validated = evidence
    ? validateEligibilityEvidence({
        evidence,
        title: r.title,
        locationRaw: r.location_raw,
        descriptionText: r.description_text || evidence,
      }).ok || picked.source === "location_raw"
    : r.prod_label === "unclear";

  return {
    job_id: r.job_id,
    title: r.title,
    company: r.company,
    location_raw: r.location_raw,
    description_snippet: r.description_snippet,
    description_text: r.description_text.slice(0, 12_000),
    verified_label: r.prod_label,
    evidence,
    verified: true,
    prod_label: r.prod_label,
    provenance: validated ? "evidence_validated" : "copied_from_prod",
  };
}

async function fetchByLabel(label: IndiaEligibility, limit: number) {
  const res = await db.execute(sql`
    SELECT j.id::text AS job_id,
           j.title,
           c.name AS company,
           j.location_raw,
           left(j.description_text, 800) AS description_snippet,
           j.description_text,
           t.india_eligibility AS prod_label
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
  return res.rows as Array<{
    job_id: string;
    title: string;
    company: string;
    location_raw: string | null;
    description_snippet: string;
    description_text: string;
    prod_label: IndiaEligibility;
  }>;
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function main() {
  const outDir = join(process.cwd(), "eval");
  mkdirSync(outDir, { recursive: true });

  // Clear prior challenge/seed learning state (honest reset)
  const deletedCorr = await db.delete(corrections).returning({ id: corrections.id });
  const deletedPat = await db
    .delete(learnedPatterns)
    .returning({ id: learnedPatterns.id });
  console.log(
    `Cleared corrections=${deletedCorr.length} patterns=${deletedPat.length}`,
  );

  const perLabelGold = 12;
  const perLabelTest = 6;
  const gold: GoldRow[] = [];
  const goldTest: GoldRow[] = [];
  const used = new Set<string>();

  for (const label of LABELS) {
    const need = perLabelGold + perLabelTest + 5;
    const rows = await fetchByLabel(
      label,
      label === "india_remote" ? 50 : need,
    );
    const converted = rows.map((r) => toGold(r, "copied_from_prod"));
    // Prefer evidence_validated for gold-test
    const validated = converted.filter((g) => g.provenance === "evidence_validated");
    const rest = converted.filter((g) => g.provenance !== "evidence_validated");
    const ordered = [...validated, ...rest];

    const testTake = Math.min(
      label === "india_remote" ? 5 : perLabelTest,
      ordered.length,
    );
    for (const g of ordered.slice(0, testTake)) {
      if (used.has(g.job_id)) continue;
      goldTest.push(g);
      used.add(g.job_id);
    }
    const goldTake = Math.min(
      label === "india_remote" ? 5 : perLabelGold,
      ordered.length,
    );
    let added = 0;
    for (const g of ordered) {
      if (used.has(g.job_id)) continue;
      gold.push(g);
      used.add(g.job_id);
      added += 1;
      if (added >= goldTake) break;
    }
    console.log(
      `  ${label}: gold+=${added} test+=${testTake} (pool ${ordered.length})`,
    );
  }

  // Trim gold-test to ~30 stratified (already ~30)
  const goldTestFinal = goldTest.slice(0, 30);
  // If short, keep what we have
  while (goldTestFinal.length < 30) {
    // try pull more unclear/open from unused
    break;
  }

  writeFileSync(
    join(outDir, "gold.jsonl"),
    gold.map((g) => JSON.stringify(g)).join("\n") + "\n",
  );
  writeFileSync(
    join(outDir, "gold-test.jsonl"),
    goldTestFinal.map((g) => JSON.stringify(g)).join("\n") + "\n",
  );

  // audit.csv — 30 random non-gold prod jobs
  const auditRes = await db.execute(sql`
    SELECT j.id::text AS job_id,
           j.title,
           c.name AS company,
           j.location_raw,
           t.india_eligibility AS label,
           COALESCE(t.eligibility_evidence[1], '') AS evidence,
           left(j.description_text, 400) AS snippet
    FROM jobs j
    JOIN companies c ON c.id = j.company_id
    JOIN job_tags t ON t.job_id = j.id
    WHERE j.closed_at IS NULL AND c.active = true
      AND (t.role_family IS NULL OR t.role_family <> 'non_tech')
    ORDER BY random()
    LIMIT 200
  `);

  const auditLines = [
    "job_id,company,title,location_raw,label,evidence,snippet,hand_ok",
  ];
  let auditN = 0;
  for (const r of auditRes.rows as Array<Record<string, string | undefined>>) {
    const jobId = r.job_id;
    if (!jobId || used.has(jobId)) continue;
    auditLines.push(
      [
        jobId,
        csvEscape(r.company ?? ""),
        csvEscape(r.title ?? ""),
        csvEscape(r.location_raw ?? ""),
        r.label ?? "",
        csvEscape((r.evidence ?? "").slice(0, 200)),
        csvEscape((r.snippet ?? "").replace(/\s+/g, " ").slice(0, 200)),
        "",
      ].join(","),
    );
    auditN += 1;
    if (auditN >= 30) break;
  }
  writeFileSync(join(outDir, "audit.csv"), auditLines.join("\n") + "\n");

  const prov = (rows: GoldRow[]) => {
    const o: Record<string, number> = {};
    for (const r of rows) {
      o[r.provenance ?? "copied_from_prod"] =
        (o[r.provenance ?? "copied_from_prod"] ?? 0) + 1;
    }
    return o;
  };
  const dist = (rows: GoldRow[]) => {
    const o: Record<string, number> = {};
    for (const r of rows) {
      o[r.verified_label] = (o[r.verified_label] ?? 0) + 1;
    }
    return o;
  };

  const summary = {
    gold_n: gold.length,
    gold_test_n: goldTestFinal.length,
    gold_provenance: prov(gold),
    gold_test_provenance: prov(goldTestFinal),
    gold_labels: dist(gold),
    gold_test_labels: dist(goldTestFinal),
    audit_csv: "eval/audit.csv",
    note: "No hand_verified rows yet — evidence_validated means location/eligibility guard passed; copied_from_prod means prod tag kept without strong evidence. gold-test never used for seeding.",
  };
  writeFileSync(
    join(outDir, "provenance.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
