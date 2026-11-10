import {
  formatDiscoverStatus,
  getDiscoverStatus,
} from "../discover/status.js";
import { db, pool } from "../db/client.js";

async function main() {
  const status = await getDiscoverStatus(db);
  console.log(formatDiscoverStatus(status));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
