import { verifyAndPromote } from "../discover/promote.js";
import { db, pool } from "../db/client.js";

async function main() {
  const promote = await verifyAndPromote(db, {
    limit: 100,
    concurrency: 3,
    ingest: true,
  });
  console.log(JSON.stringify(promote, null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
