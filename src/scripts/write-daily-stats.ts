/**
 * Backfill / refresh today's daily_stats row.
 * Usage: npx tsx src/scripts/write-daily-stats.ts
 */
import { db, pool } from "../db/client.js";
import { writeDailyStats } from "../stats/daily.js";

async function main() {
  const row = await writeDailyStats(db);
  console.log(JSON.stringify(row, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
