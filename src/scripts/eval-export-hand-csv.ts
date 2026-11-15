/**
 * Export gold-test for hand verification.
 * Columns: job_url, title, company, location_raw, predicted_label, evidence, hand_label
 * npm run eval:export-hand
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { inArray } from "drizzle-orm";
import { classifyIndiaEligibility } from "../classify/eligibility.js";
import { db, pool } from "../db/client.js";
import { jobs } from "../db/schema.js";
import { loadGoldTest } from "../learn/gold.js";
import { selectBestEligibilityEvidence } from "../learn/evidence-guard.js";

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

async function main() {
  const rows = loadGoldTest();
  const ids = rows.map((r) => r.job_id);
  const jobRows =
    ids.length === 0
      ? []
      : await db
          .select({ id: jobs.id, applyUrl: jobs.applyUrl })
          .from(jobs)
          .where(inArray(jobs.id, ids));
  const urlById = new Map(jobRows.map((j) => [j.id, j.applyUrl]));

  const outDir = join(process.cwd(), "eval");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "gold-test-hand.csv");

  const header = [
    "job_url",
    "title",
    "company",
    "location_raw",
    "predicted_label",
    "evidence",
    "hand_label",
  ];
  const lines = [header.join(",")];

  for (const row of rows) {
    const desc = row.description_text ?? row.description_snippet;
    const pred = classifyIndiaEligibility({
      title: row.title,
      locationRaw: row.location_raw,
      descriptionText: desc,
    });
    const picked = selectBestEligibilityEvidence({
      title: row.title,
      locationRaw: row.location_raw,
      descriptionText: desc,
      candidates: pred.eligibility_evidence,
    });
    lines.push(
      [
        csvEscape(urlById.get(row.job_id) ?? ""),
        csvEscape(row.title),
        csvEscape(row.company),
        csvEscape(row.location_raw ?? ""),
        csvEscape(pred.india_eligibility),
        csvEscape(picked.evidence ?? pred.eligibility_evidence[0] ?? ""),
        "", // hand_label — fill then run eval:promote-hand
      ].join(","),
    );
  }

  writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(
    JSON.stringify({ path: outPath, rows: rows.length }, null, 2),
  );
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
