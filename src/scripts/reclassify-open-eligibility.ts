/**
 * Re-run rules classification on jobs currently tagged india_eligibility=open.
 * Ignores content_hash cache. Prints before/after counts + sample evidence.
 *
 * Usage: npx tsx src/scripts/reclassify-open-eligibility.ts
 */
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { classifyAndStoreJob } from "../classify/classify.js";
import {
  formatEligibilityStats,
  getEligibilityStats,
} from "../classify/stats.js";
import { db, pool } from "../db/client.js";
import { companies, jobTags, jobs } from "../db/schema.js";

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await fn(items[idx]!, idx);
      }
    },
  );
  await Promise.all(workers);
}

async function main() {
  const before = await getEligibilityStats(db);
  console.log("=== BEFORE (tech open jobs) ===");
  console.log(formatEligibilityStats(before));
  console.log(
    JSON.stringify(
      {
        open: before.open,
        india_remote: before.indiaRemote,
        india_onsite: before.indiaOnsite,
        region_locked: before.regionLocked,
        unclear: before.unclear,
      },
      null,
      2,
    ),
  );

  const openTagged = await db
    .select({ id: jobs.id })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(
        isNull(jobs.closedAt),
        eq(companies.active, true),
        eq(jobTags.indiaEligibility, "open"),
        or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
      ),
    );

  console.log(
    `\nRules-only force reclassify of ${openTagged.length} jobs currently labeled open…`,
  );

  let done = 0;
  await mapPool(openTagged, 20, async (row) => {
    await classifyAndStoreJob(db, row.id, { rulesOnly: true, force: true });
    done += 1;
    if (done % 50 === 0 || done === openTagged.length) {
      console.log(`  ${done}/${openTagged.length}`);
    }
  });

  const after = await getEligibilityStats(db);
  console.log("\n=== AFTER (tech open jobs) ===");
  console.log(formatEligibilityStats(after));
  console.log(
    JSON.stringify(
      {
        open: after.open,
        india_remote: after.indiaRemote,
        india_onsite: after.indiaOnsite,
        region_locked: after.regionLocked,
        unclear: after.unclear,
      },
      null,
      2,
    ),
  );

  const samples = await db.execute(sql`
    select j.title, c.name as company, j.location_raw, t.eligibility_evidence
    from jobs j
    join companies c on c.id = j.company_id
    join job_tags t on t.job_id = j.id
    where j.closed_at is null
      and c.active = true
      and t.india_eligibility = 'open'
      and (t.role_family is null or t.role_family <> 'non_tech')
    order by random()
    limit 15
  `);

  console.log("\n=== 15 random jobs still labeled open ===");
  const rows = samples.rows as Array<{
    title: string;
    company: string;
    location_raw: string | null;
    eligibility_evidence: string[] | null;
  }>;
  for (const [i, r] of rows.entries()) {
    const quote = (r.eligibility_evidence ?? [])[0] ?? "(no evidence)";
    console.log(
      `${i + 1}. [${r.company}] ${r.title} | loc=${r.location_raw ?? "null"}\n   evidence: ${quote.slice(0, 220)}`,
    );
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
