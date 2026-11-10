import { deactivateBlocklistedCompanies } from "../discover/promote.js";
import { db, pool } from "../db/client.js";

async function main() {
  const n = await deactivateBlocklistedCompanies(db);
  console.log(`Deactivated ${n} blocklisted companies.`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
