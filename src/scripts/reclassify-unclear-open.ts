/**
 * Force rules (+ patterns) reclassify of open + unclear tech jobs.
 * npm run reclassify:open is LLM-heavy; this is rules-first for data-quality fixes.
 */
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { classifyAndStoreJob } from "../classify/classify.js";
import { db, pool } from "../db/client.js";
import { companies, jobTags, jobs } from "../db/schema.js";

async function main() {
  const before = await db.execute(sql`
    SELECT jt.india_eligibility, count(*)::int AS n
    FROM jobs j
    JOIN job_tags jt ON jt.job_id = j.id
    JOIN companies c ON c.id = j.company_id
    WHERE j.closed_at IS NULL AND c.active
    GROUP BY 1
  `);
  console.log("BEFORE", before.rows);
  const unclearBefore =
    (before.rows as Array<{ india_eligibility: string; n: number }>).find(
      (r) => r.india_eligibility === "unclear",
    )?.n ?? 0;

  const targets = await db
    .select({ id: jobs.id })
    .from(jobs)
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(
      and(
        isNull(jobs.closedAt),
        eq(companies.active, true),
        inArray(jobTags.indiaEligibility, ["unclear", "open"]),
        or(isNull(jobTags.roleFamily), sql`${jobTags.roleFamily} <> 'non_tech'`),
      ),
    );

  console.log("reclassify targets", targets.length);
  let i = 0;
  for (const t of targets) {
    await classifyAndStoreJob(db, t.id, { rulesOnly: true, force: true, db });
    i += 1;
    if (i % 100 === 0) console.log("…", i);
  }

  const after = await db.execute(sql`
    SELECT jt.india_eligibility, count(*)::int AS n
    FROM jobs j
    JOIN job_tags jt ON jt.job_id = j.id
    JOIN companies c ON c.id = j.company_id
    WHERE j.closed_at IS NULL AND c.active
    GROUP BY 1
    ORDER BY 2 DESC
  `);
  console.log("AFTER", after.rows);
  const unclearAfter =
    (after.rows as Array<{ india_eligibility: string; n: number }>).find(
      (r) => r.india_eligibility === "unclear",
    )?.n ?? 0;
  console.log(
    JSON.stringify({
      unclear_before: unclearBefore,
      unclear_after: unclearAfter,
      unclear_reduced_by: unclearBefore - unclearAfter,
      reclassified: targets.length,
    }),
  );
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
