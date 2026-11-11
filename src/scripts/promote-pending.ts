import { getEligibilityStats } from "../classify/stats.js";
import { db, pool } from "../db/client.js";
import { verifyAndPromote } from "../discover/promote.js";

async function main() {
  const limit = Number(process.argv[2] ?? 600);
  const before = await getEligibilityStats(db);
  console.log(`tech_open before=${before.jobsScanned} promote_limit=${limit}`);
  const s = await verifyAndPromote(db, {
    limit,
    concurrency: 5,
    ingest: true,
  });
  console.log(JSON.stringify(s, null, 2));
  const after = await getEligibilityStats(db);
  console.log(
    `tech_open after=${after.jobsScanned} delta=${after.jobsScanned - before.jobsScanned}`,
  );
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
