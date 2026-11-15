/** npm run eval:baseline */
import { pool } from "../db/client.js";
import {
  loadGold,
  runBaselineOnGold,
  saveEvalReport,
} from "../learn/eval-runner.js";
import { goldLabelDistribution } from "../learn/gold.js";

async function main() {
  const gold = loadGold();
  console.log(`Gold n=${gold.length}`, goldLabelDistribution(gold));
  const report = runBaselineOnGold(gold);
  const path = saveEvalReport(report);
  console.log(
    JSON.stringify(
      {
        path,
        accuracy: report.accuracy,
        unclear_rate: report.unclear_rate,
        evidence_validity_rate: report.evidence_validity_rate,
        bad_evidence_rate: report.bad_evidence_rate,
        per_label: report.per_label,
      },
      null,
      2,
    ),
  );
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
