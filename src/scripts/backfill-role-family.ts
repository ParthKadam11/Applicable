/**
 * Recompute role_family for open jobs (staffing noise → non_tech, fix ml mis-tags).
 * Keeps rows; only updates job_tags.role_family.
 *
 * Usage: npx tsx src/scripts/backfill-role-family.ts [--limit=N]
 */
import { eq, isNull, sql } from "drizzle-orm";
import { classifyRoleFamily, isStaffingNoise } from "../classify/roles.js";
import { db, pool } from "../db/client.js";
import { companies, jobTags, jobs } from "../db/schema.js";

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      descriptionText: jobs.descriptionText,
      companyName: companies.name,
      prev: jobTags.roleFamily,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(isNull(jobs.closedAt))
    .limit(limit > 0 ? limit : 200_000);

  console.log(`[backfill-role-family] targets=${rows.length}`);

  let updated = 0;
  let flaggedNoise = 0;
  const byCompany = new Map<string, number>();

  for (const row of rows) {
    const next = classifyRoleFamily(
      row.title,
      row.descriptionText,
      row.companyName,
    ).role_family;
    const noise = isStaffingNoise(
      row.title,
      row.companyName,
      row.descriptionText,
    );
    if (noise) {
      flaggedNoise += 1;
      byCompany.set(row.companyName, (byCompany.get(row.companyName) ?? 0) + 1);
    }
    if (row.prev === next) continue;
    if (!row.prev && next === "other") {
      // leave untagged-as-null alone only if we'd write other? always write.
    }
    await db
      .update(jobTags)
      .set({
        roleFamily: next,
        classifiedAt: new Date(),
      })
      .where(eq(jobTags.jobId, row.id));
    updated += 1;
  }

  // Also flag any open job missing tags that is staffing noise via insert path skipped —
  // report only.
  const sorted = [...byCompany.entries()].sort((a, b) => b[1] - a[1]);
  console.log(
    JSON.stringify(
      {
        flagged_staffing_noise: flaggedNoise,
        role_family_updated: updated,
        per_company: Object.fromEntries(sorted),
      },
      null,
      2,
    ),
  );

  const early = await db.execute(sql`
    select j.title, c.name, t.role_family, t.seniority, t.india_eligibility
    from jobs j
    join companies c on c.id = j.company_id
    join job_tags t on t.job_id = j.id
    where j.closed_at is null and c.active
      and t.india_eligibility in ('open','india_remote')
      and (
        t.seniority in ('intern','entry','junior')
        or (t.seniority = 'mid' and t.years_experience_max is not null and t.years_experience_max <= 2)
      )
      and (t.role_family is null or t.role_family <> 'non_tech')
    order by c.name, j.title
  `);
  console.log("[backfill-role-family] early-career india-eligible AFTER:");
  for (const r of early.rows as Array<Record<string, string>>) {
    console.log(
      `- [${r.seniority}] ${r.title} @ ${r.name} (${r.india_eligibility}) rf=${r.role_family}`,
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
