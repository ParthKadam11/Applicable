import { runDiscovery } from "../discover/run.js";
import { db, pool } from "../db/client.js";

async function main() {
  const result = await runDiscovery(db, {
    sources: ["yc_india", "india_startups"],
    promoteLimit: 80,
    concurrency: 4,
    ingest: true,
  });
  console.log(JSON.stringify(result, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
