import { pool, db } from "../db/client.js";
import { createHydraClient } from "../hydra/client.js";
import { runHydraSync } from "../hydra/sync.js";

async function main() {
  const full = process.argv.includes("--full");
  const client = createHydraClient();
  if (!client.enabled) {
    console.log(
      "HydraDB disabled (set HYDRADB_ENABLED=true and HYDRADB_API_KEY). No-op.",
    );
    await pool.end();
    return;
  }

  console.log(`HydraDB sync starting (full=${full})…`);
  const result = await runHydraSync(db, { full }, client);
  console.log(JSON.stringify(result, null, 2));
  await pool.end();
  if (result.error && result.pushed === 0 && result.updated === 0) {
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
