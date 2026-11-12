/**
 * One-off data-quality cleanup:
 * - backfill company display names (strip ATS suffix / humanize slug)
 * - deactivate non-software / low-tech-ratio companies
 * - re-queue "too many jobs" + compensation overflow rejects as pending
 * - promote pending (including re-queued)
 *
 * Usage: npm run dq:cleanup
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { getEligibilityStats } from "../classify/stats.js";
import { db, pool } from "../db/client.js";
import { companies, companyCandidates, jobs } from "../db/schema.js";
import {
  cleanCompanyDisplayName,
  displayNameFromSlug,
  stripAtsSuffix,
} from "../discover/company-name.js";
import {
  evaluateIndustryFilter,
  techJobRatio,
} from "../discover/industry-filter.js";
import { verifyAndPromote } from "../discover/promote.js";

async function backfillNames(): Promise<number> {
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      ats: companies.ats,
      slug: companies.atsSlug,
    })
    .from(companies);

  let updated = 0;
  for (const row of rows) {
    let next = cleanCompanyDisplayName(row.name, row.slug);
    // Trailing digits on slug-like names → humanize (datavant2 → Datavant)
    const stripped = stripAtsSuffix(row.name);
    if (
      /^\S+$/.test(stripped) &&
      stripped.replace(/[-_\s]/g, "").toLowerCase() ===
        row.slug.replace(/[-_]/g, "").toLowerCase()
    ) {
      next = displayNameFromSlug(row.slug);
    }
    if (next !== row.name) {
      await db
        .update(companies)
        .set({ name: next })
        .where(eq(companies.id, row.id));
      updated += 1;
    }
  }
  console.log(`[dq] backfilled ${updated} company names (local; promote uses ATS API)`);
  return updated;
}

async function deactivateBadCompanies(): Promise<
  Array<{ name: string; ats: string; slug: string; reason: string }>
> {
  const active = await db
    .select({
      id: companies.id,
      name: companies.name,
      website: companies.website,
      ats: companies.ats,
      slug: companies.atsSlug,
    })
    .from(companies)
    .where(eq(companies.active, true));

  const deactivated: Array<{
    name: string;
    ats: string;
    slug: string;
    reason: string;
  }> = [];

  for (const c of active) {
    const kw = evaluateIndustryFilter({
      name: c.name,
      domain: c.website,
      atsSlug: c.slug,
    });
    let reason: string | null = kw.ok ? null : kw.reason;

    if (!reason) {
      const openTitles = await db
        .select({ title: jobs.title })
        .from(jobs)
        .where(and(eq(jobs.companyId, c.id), isNull(jobs.closedAt)));
      const titles = openTitles.map((r) => r.title);
      const mix = evaluateIndustryFilter({
        name: c.name,
        domain: c.website,
        atsSlug: c.slug,
        jobTitles: titles,
      });
      if (!mix.ok) reason = mix.reason;
      else if (titles.length >= 3) {
        const { ratio } = techJobRatio(titles);
        if (ratio < 0.15) {
          reason = `low tech ratio (${(ratio * 100).toFixed(0)}%)`;
        }
      }
    }

    if (!reason) continue;

    await db
      .update(companies)
      .set({ active: false })
      .where(eq(companies.id, c.id));
    deactivated.push({
      name: c.name,
      ats: c.ats,
      slug: c.slug,
      reason,
    });
  }

  console.log(`[dq] deactivated ${deactivated.length} companies`);
  return deactivated;
}

async function requeueRejects(): Promise<{ tooMany: number; overflow: number }> {
  const tooMany = await db.execute(sql`
    update company_candidates
    set status = 'pending', reject_reason = null, updated_at = now()
    where status = 'rejected'
      and reject_reason like 'too many jobs%'
    returning id
  `);
  const overflow = await db.execute(sql`
    update company_candidates
    set status = 'pending', reject_reason = null, updated_at = now()
    where status = 'rejected'
      and reject_reason like 'error: value % is out of range for type integer%'
    returning id
  `);
  const nToo = (tooMany.rows as unknown[]).length;
  const nOv = (overflow.rows as unknown[]).length;
  console.log(
    `[dq] requeued pending: too_many_jobs=${nToo} compensation_overflow=${nOv}`,
  );
  return { tooMany: nToo, overflow: nOv };
}

async function main() {
  const before = await getEligibilityStats(db);
  console.log(`[dq] tech_open before=${before.jobsScanned}`);

  await backfillNames();
  const deactivated = await deactivateBadCompanies();

  console.log("\n=== deactivated (all) ===");
  for (const d of deactivated) {
    console.log(`  ${d.name}  [${d.ats}/${d.slug}]  - ${d.reason}`);
  }
  console.log("\n=== deactivated (20 examples) ===");
  for (const d of deactivated.slice(0, 20)) {
    console.log(`  ${d.name}  - ${d.reason}`);
  }

  const requeued = await requeueRejects();

  // Promote requeued + any other pending (cap high enough for the 139+)
  const promoteLimit = Math.max(500, requeued.tooMany + requeued.overflow + 50);
  console.log(`[dq] promote:pending limit=${promoteLimit}`);
  const promote = await verifyAndPromote(db, {
    limit: promoteLimit,
    concurrency: 5,
    ingest: true,
  });
  console.log("[dq] promote stats:", JSON.stringify(promote));

  const after = await getEligibilityStats(db);
  console.log(
    `[dq] tech_open after=${after.jobsScanned} delta=${after.jobsScanned - before.jobsScanned}`,
  );

  // Top 15 + eligibility for the report
  const top = await db.execute(sql`
    select c.name, c.ats, count(distinct j.id)::int as open_jobs
    from companies c
    join jobs j on j.company_id = c.id and j.closed_at is null
    where c.active
    group by c.id, c.name, c.ats
    order by open_jobs desc
    limit 15
  `);
  console.log("\n=== top 15 active by open jobs ===");
  for (const row of top.rows as Array<{
    name: string;
    ats: string;
    open_jobs: number;
  }>) {
    console.log(`  ${row.open_jobs}\t${row.name} (${row.ats})`);
  }

  console.log("\n=== eligibility (tech open) ===");
  for (const [k, v] of Object.entries(after.byClassifier ?? {})) {
    // getEligibilityStats doesn't expose byEligibility directly in a simple map -
    // print jobsScanned / open / india* from the stats object
    void k;
    void v;
  }
  console.log(
    JSON.stringify(
      {
        jobsScanned: after.jobsScanned,
        open: after.open,
        indiaRemote: after.indiaRemote,
        indiaOnsite: after.indiaOnsite,
        regionLocked: after.regionLocked,
        unclear: after.unclear,
        untagged: after.untagged,
        nonTechExcluded: after.nonTechExcluded,
      },
      null,
      2,
    ),
  );

  console.log(
    `\n[dq] SUMMARY deactivated=${deactivated.length} requeued_too_many=${requeued.tooMany} requeued_overflow=${requeued.overflow} promoted=${promote.promoted}`,
  );

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
