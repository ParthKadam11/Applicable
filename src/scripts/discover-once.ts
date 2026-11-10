import {
  formatEligibilityStats,
  getEligibilityStats,
} from "../classify/stats.js";
import { runDiscovery } from "../discover/run.js";
import {
  formatDiscoverStatus,
  getDiscoverStatus,
} from "../discover/status.js";
import { config } from "../config.js";
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
    : config.DISCOVER_PROMOTE_LIMIT;

  console.log("Running company discovery…");
  const result = await runDiscovery(db, { sources, promoteLimit });

  console.log("\n=== discovery summary ===");
  console.log("found by source:", result.foundBySource);
  console.log("upserted:", result.upserted);
  console.log("promote:", result.promote);

  const status = await getDiscoverStatus(db);
  console.log("\n" + formatDiscoverStatus(status));

  const stats = await getEligibilityStats(db);
  console.log("\n=== open job stats ===");
  console.log(formatEligibilityStats(stats));

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
