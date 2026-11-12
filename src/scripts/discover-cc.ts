/**
 * Common Crawl ATS slug discovery.
 *
 * Usage:
 *   npm run discover:cc -- --limit 2000
 *   npm run discover:cc -- --limit 200 --dry-run
 */
import {
  formatCcRejectTop,
  runCommonCrawlDiscovery,
  topCcPromoteRejectReasons,
} from "../discover/run-cc.js";
import { db, pool } from "../db/client.js";

function argNum(name: string, fallback: number): number {
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  if (eq) {
    const n = Number(eq.split("=")[1]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }
  return fallback;
}

async function main() {
  const limit = argNum("--limit", 2000);
  const dryRun = process.argv.includes("--dry-run");
  const hasPromoteLimit =
    process.argv.includes("--promote-limit") ||
    process.argv.some((a) => a.startsWith("--promote-limit="));
  const promoteLimit = hasPromoteLimit
    ? argNum("--promote-limit", limit)
    : undefined;

  console.log(
    `Common Crawl discovery (limit=${limit}, dryRun=${dryRun}${promoteLimit != null ? `, promoteLimit=${promoteLimit}` : ""})…`,
  );

  const result = await runCommonCrawlDiscovery(db, {
    limit,
    dryRun,
    promoteLimit,
    ingest: !dryRun,
  });

  const validateRejects = formatCcRejectTop(result.validateStats, result.promote);
  const promoteRejects = dryRun
    ? []
    : await topCcPromoteRejectReasons(db, 10);

  console.log("\n=== discover:cc summary ===");
  console.log(`slugs_found:     ${result.slugsFound}`);
  console.log(`validated:       ${result.validated} (live probes=${result.validateStats.checked}, cache_skip=${result.validateStats.skippedFreshCache})`);
  console.log(`with_jobs:       ${result.withJobs}`);
  console.log(`upserted:        ${result.upserted}`);
  if (result.promote) {
    console.log(
      `promoted:        ${result.promote.promoted} (verified=${result.promote.verified}, rejected=${result.promote.rejected}, skipped_existing=${result.promote.skippedExisting})`,
    );
    console.log(
      `ingest:          jobs=${result.promote.ingestedJobs} classified=${result.promote.classifiedJobs}`,
    );
  } else {
    console.log(`promoted:        (skipped - dry-run or nothing to upsert)`);
  }
  console.log(
    `tech_open:       before=${result.techOpenBefore} after=${result.techOpenAfter} delta=${result.techOpenAfter - result.techOpenBefore}`,
  );
  console.log(`elapsed:         ${(result.elapsedMs / 1000).toFixed(1)}s`);

  console.log("\n=== top validation reject reasons ===");
  if (validateRejects.length === 0) console.log("(none)");
  for (const r of validateRejects) {
    console.log(`  ${r.count}\t${r.reason}`);
  }

  console.log("\n=== top promote reject reasons (common_crawl) ===");
  if (promoteRejects.length === 0) console.log("(none)");
  for (const r of promoteRejects) {
    console.log(`  ${r.count}\t${r.reason}`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
