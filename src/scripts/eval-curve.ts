/**
 * Replay corrections in batches and eval after each.
 * npm run eval:curve
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { jobs, learnedPatterns } from "../db/schema.js";
import {
  runBaselineOnGold,
  runLearnedOnGold,
  saveEvalReport,
} from "../learn/eval-runner.js";
import { listCorrectionsChronological } from "../learn/corrections.js";
import { loadGoldTest } from "../learn/gold.js";
import { upsertPatternFromEvidence } from "../learn/patterns.js";
import type { IndiaEligibility } from "../classify/types.js";

const BATCHES = [0, 10, 25, 50, Number.POSITIVE_INFINITY];

async function resetPatterns() {
  await db.delete(learnedPatterns);
}

async function applyFirstN(n: number) {
  await resetPatterns();
  const all = await listCorrectionsChronological(db, { excludeGold: true });
  const slice = Number.isFinite(n) ? all.slice(0, n) : all;
  for (const c of slice) {
    const [job] = await db
      .select({ companyId: jobs.companyId })
      .from(jobs)
      .where(eq(jobs.id, c.jobId))
      .limit(1);
    await upsertPatternFromEvidence(
      db,
      c.evidence,
      c.newLabel as IndiaEligibility,
      1,
      job?.companyId ?? null,
    );
  }
  return { applied: slice.length, total: all.length };
}

async function main() {
  // Curve is measured on held-out gold-test only (never seeded against).
  const gold = loadGoldTest();
  const baseline = runBaselineOnGold(gold);
  saveEvalReport(baseline, process.cwd(), "-test");

  const rows: Array<{
    n_corrections: number;
    accuracy: number;
    unclear_rate: number;
    bad_evidence_rate: number;
  }> = [];

  for (const n of BATCHES) {
    const { applied, total } = await applyFirstN(n);
    const label = Number.isFinite(n) ? n : total;
    const report =
      applied === 0
        ? baseline
        : await runLearnedOnGold(db, gold, { useLlm: false });
    if (applied > 0) saveEvalReport(report, process.cwd(), "-test");
    rows.push({
      n_corrections: Number.isFinite(n) ? applied : total,
      accuracy: report.accuracy,
      unclear_rate: report.unclear_rate,
      bad_evidence_rate: report.bad_evidence_rate,
    });
    console.log(
      `batch corrections=${label} applied=${applied} accuracy=${(report.accuracy * 100).toFixed(1)}%`,
    );
  }

  // Restore all patterns from full correction set
  await applyFirstN(Number.POSITIVE_INFINITY);

  const dir = join(process.cwd(), "eval", "results");
  mkdirSync(dir, { recursive: true });
  const csvPath = join(dir, "learning-curve.csv");
  const csv = [
    "n_corrections,accuracy,unclear_rate,bad_evidence_rate",
    ...rows.map(
      (r) =>
        `${r.n_corrections},${r.accuracy.toFixed(4)},${r.unclear_rate.toFixed(4)},${r.bad_evidence_rate.toFixed(4)}`,
    ),
  ].join("\n");
  writeFileSync(csvPath, csv + "\n");
  writeFileSync(
    join(dir, "learning-curve.json"),
    JSON.stringify({ points: rows, chart: rows.map((r) => [r.n_corrections, r.accuracy]) }, null, 2),
  );
  console.log(`Wrote ${csvPath}`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
