/** npm run eval:compare */
import { pool } from "../db/client.js";
import { loadLatestReport } from "../learn/eval-runner.js";
import { formatCompareTable } from "../learn/metrics.js";

async function main() {
  const baseline = loadLatestReport("baseline");
  const learned = loadLatestReport("learned");
  if (!baseline || !learned) {
    console.error(
      "Missing baseline and/or learned results. Run eval:baseline and eval:learned first.",
    );
    process.exit(1);
  }
  console.log(formatCompareTable(baseline, learned));
  console.log(
    `\nbaseline@${baseline.timestamp}  learned@${learned.timestamp}  n=${baseline.n}`,
  );
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
