import { getEligibilityStats } from "../classify/stats.js";
import { db, pool } from "../db/client.js";
import { verifyAndPromote } from "../discover/promote.js";

function argLimit(): number {
  const eq = process.argv.find((a) => a.startsWith("--limit="));
  if (eq) {
    const n = Number(eq.split("=")[1]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  const idx = process.argv.indexOf("--limit");
  if (idx >= 0 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  const positional = Number(process.argv[2]);
  if (Number.isFinite(positional) && positional > 0) return Math.floor(positional);
  return 600;
}

async function main() {
  const limit = argLimit();
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
