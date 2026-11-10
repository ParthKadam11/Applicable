import {
  formatEligibilityStats,
  getEligibilityStats,
} from "../classify/stats.js";
import { db, pool } from "../db/client.js";

async function main() {
  const stats = await getEligibilityStats(db);
  console.log(formatEligibilityStats(stats));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
