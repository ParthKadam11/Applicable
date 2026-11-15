/** Baseline + learned on held-out gold-test. npm run eval:gold-test */
import { db, pool } from "../db/client.js";
import {
  runBaselineOnGold,
  runLearnedOnGold,
  saveEvalReport,
} from "../learn/eval-runner.js";
import {
  goldLabelDistribution,
  goldProvenanceBreakdown,
  loadGoldTest,
} from "../learn/gold.js";
import { formatCompareTable } from "../learn/metrics.js";

async function main() {
  const rows = loadGoldTest();
  console.log("gold-test", {
    n: rows.length,
    labels: goldLabelDistribution(rows),
    provenance: goldProvenanceBreakdown(rows),
  });

  const baselineRaw = runBaselineOnGold(rows, { repairEvidence: false });
  const baseline = runBaselineOnGold(rows, { repairEvidence: true });
  saveEvalReport(baseline, process.cwd(), "-test");

  const learned = await runLearnedOnGold(db, rows, {
    useLlm: false,
    repairEvidence: true,
  });
  saveEvalReport(learned, process.cwd(), "-test");

  console.log(
    JSON.stringify(
      {
        baseline_raw_bad_evidence_rate: baselineRaw.bad_evidence_rate,
        baseline: {
          accuracy: baseline.accuracy,
          unclear_rate: baseline.unclear_rate,
          bad_evidence_rate: baseline.bad_evidence_rate,
          evidence_validity_rate: baseline.evidence_validity_rate,
        },
        learned: {
          accuracy: learned.accuracy,
          unclear_rate: learned.unclear_rate,
          bad_evidence_rate: learned.bad_evidence_rate,
          evidence_validity_rate: learned.evidence_validity_rate,
          sources: learned.predictions.reduce(
            (a, p) => {
              a[p.source] = (a[p.source] ?? 0) + 1;
              return a;
            },
            {} as Record<string, number>,
          ),
        },
      },
      null,
      2,
    ),
  );
  console.log("\n" + formatCompareTable(baseline, learned));
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
