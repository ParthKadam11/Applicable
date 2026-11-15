/**
 * Enrich tracked companies from ATS JDs, websites, yc-oss.
 * npm run enrich:companies [-- --limit=20] [-- --company=slug] [-- --force] [-- --skip-website] [-- --skip-llm] [-- --skip-graph]
 */
import { db, pool } from "../db/client.js";
import { enrichCompanies } from "../enrich/run.js";

function argVal(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}

async function main() {
  const limit = Number(argVal("limit") ?? "25") || 25;
  const companySlug = argVal("company");
  const force = process.argv.includes("--force");
  const skipWebsite = process.argv.includes("--skip-website");
  const skipLlm = process.argv.includes("--skip-llm");
  const skipGraph = process.argv.includes("--skip-graph");

  const summary = await enrichCompanies(db, {
    limit,
    companySlug,
    force,
    skipWebsite,
    skipLlm,
    skipGraph,
  });

  const topFailures = Object.entries(summary.failureReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log(
    JSON.stringify(
      {
        enriched: summary.enriched,
        skipped: summary.skipped,
        failed: summary.failed,
        factsWritten: summary.factsWritten,
        bySource: summary.bySource,
        byType: summary.byType,
        topFailureReasons: topFailures,
      },
      null,
      2,
    ),
  );
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
