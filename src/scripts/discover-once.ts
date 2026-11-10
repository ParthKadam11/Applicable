import { getEligibilityStats } from "../classify/stats.js";
import { config } from "../config.js";
import { runDiscovery } from "../discover/run.js";
import { db, pool } from "../db/client.js";

async function main() {
  const sourcesArg = process.argv.find((a) => a.startsWith("--sources="));
  const sources = sourcesArg
    ?.slice("--sources=".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as
    | Array<"yc" | "hn_hiring" | "himalayas" | "remoteok">
    | undefined;

  const promoteLimitArg = process.argv.find((a) =>
    a.startsWith("--promote-limit="),
  );
  const promoteLimit = promoteLimitArg
    ? Number(promoteLimitArg.split("=")[1])
    : Number(process.env.PROMOTE_LIMIT ?? config.DISCOVER_PROMOTE_LIMIT);

  console.log(
    `Running company discovery (promote limit=${promoteLimit}, concurrency=${config.DISCOVER_PROMOTE_CONCURRENCY})…`,
  );
  const result = await runDiscovery(db, { sources, promoteLimit });

  const stats = await getEligibilityStats(db);

  console.log("\n=== discovery summary ===");
  console.log(`found:     ${JSON.stringify(result.foundBySource)}`);
  console.log(`upserted:  ${result.upserted}`);
  console.log(
    `promote:   attempted=${result.promote.attempted} promoted=${result.promote.promoted} verified=${result.promote.verified} rejected=${result.promote.rejected} skipped_existing=${result.promote.skippedExisting}`,
  );
  console.log(
    `ingest:    jobs=${result.promote.ingestedJobs} classified=${result.promote.classifiedJobs} timeout_retries=${result.promote.timedOutRetried}`,
  );
  console.log(`pending:   ${result.promote.pendingRemaining} remaining`);
  console.log(
    `tech open: ${stats.jobsScanned} (non-tech excluded ${stats.nonTechExcluded})`,
  );
  console.log(`(details: npm run discover:status | npm run stats)`);

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
