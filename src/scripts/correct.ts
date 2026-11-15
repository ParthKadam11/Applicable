/**
 * Manual correction CLI.
 * npm run correct -- <job_id> <label> "<evidence>"
 */
import { IndiaEligibilitySchema } from "../classify/types.js";
import { db, pool } from "../db/client.js";
import { CorrectionError, recordCorrection } from "../learn/corrections.js";

async function main() {
  const [, , jobId, labelRaw, ...evidenceParts] = process.argv;
  const evidence = evidenceParts.join(" ").trim();
  if (!jobId || !labelRaw || !evidence) {
    console.error(
      'Usage: npm run correct -- <job_id> <label> "<evidence>"',
    );
    process.exit(2);
  }
  const label = IndiaEligibilitySchema.parse(labelRaw);
  try {
    const result = await recordCorrection(db, {
      jobId,
      newLabel: label,
      evidence,
      source: "manual",
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    if (err instanceof CorrectionError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
