import { pool, db } from "../db/client.js";
import { createGraphClient } from "../graph/driver.js";
import { runGraphSync } from "../graph/sync.js";

async function main() {
  const full = process.argv.includes("--full");
  const client = createGraphClient();
  if (!client.enabled) {
    console.log(
      "Graph sync disabled (set HYDRA_GRAPH_ENABLED=true and HYDRA_TOKEN). No-op.",
    );
    await pool.end();
    return;
  }

  console.log(`Graph sync starting (full=${full})…`);
  const result = await runGraphSync(db, { full }, client);
  console.log(JSON.stringify(result, null, 2));
  await client.close();
  await pool.end();
  if (result.error && result.nodesAdded === 0 && result.edgesAdded === 0) {
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
