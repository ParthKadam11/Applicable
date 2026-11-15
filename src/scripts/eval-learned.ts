/** npm run eval:learned */
import { db, pool } from "../db/client.js";
import {
  loadGold,
  runLearnedOnGold,
  saveEvalReport,
} from "../learn/eval-runner.js";

async function main() {
  const useLlm = process.argv.includes("--llm");
  const gold = loadGold();
  const report = await runLearnedOnGold(db, gold, { useLlm });
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
        sources: report.predictions.reduce(
          (acc, p) => {
            acc[p.source] = (acc[p.source] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
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
