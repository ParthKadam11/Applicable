import { and, eq, isNull, sql } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { jobTags, jobs } from "../db/schema.js";

function parseArgs(argv: string[]) {
  let tag = "open";
  let n = 20;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--tag") tag = argv[++i] ?? tag;
    else if (a === "--n") n = Number(argv[++i] ?? n);
  }
  return { tag, n };
}

async function main() {
  const { tag, n } = parseArgs(process.argv.slice(2));
  const allowed = new Set(["open", "region_locked", "unclear"]);
  if (!allowed.has(tag)) {
    console.error(`--tag must be one of ${[...allowed].join("|")}`);
    process.exit(1);
  }

  const rows = await db
    .select({
      title: jobs.title,
      locationRaw: jobs.locationRaw,
      evidence: jobTags.eligibilityEvidence,
      applyUrl: jobs.applyUrl,
    })
    .from(jobs)
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(isNull(jobs.closedAt), eq(jobTags.indiaEligibility, tag)),
    )
    .orderBy(sql`random()`)
    .limit(n);

  console.log(`Sample of ${rows.length} open jobs tagged india_eligibility=${tag}\n`);
  for (const [i, row] of rows.entries()) {
    console.log(`${i + 1}. ${row.title}`);
    console.log(`   location_raw: ${row.locationRaw ?? "(none)"}`);
    console.log(
      `   evidence: ${(row.evidence ?? []).map((e) => JSON.stringify(e)).join(" | ") || "(none)"}`,
    );
    console.log(`   apply: ${row.applyUrl}`);
    console.log("");
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
