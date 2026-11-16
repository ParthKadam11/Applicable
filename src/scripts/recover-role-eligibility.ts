/**
 * PART A recovery:
 * 1) Recompute role_family with title-wins eng rules (no LLM).
 * 2) Flip open/india_remote → region_locked when evidence is US/EU/UK/Canada-only.
 *
 * Usage: npx tsx src/scripts/recover-role-eligibility.ts
 */
import { eq, isNull, sql } from "drizzle-orm";
import { classifyRoleFamily, isStaffingNoise } from "../classify/roles.js";
import { db, pool } from "../db/client.js";
import { companies, jobTags, jobs } from "../db/schema.js";

const GEO_ONLY_EVIDENCE =
  /\b(?:remote in the u\.?s\.?|remote[, ]+u\.?s\.?a?\.?|remote[, ]+(?:united states|canada|uk|united kingdom|eu|europe)|(?:us|u\.s\.|united states|canada|uk|united kingdom|eu|europe)[- ]only|us work authorization|authorized to work in the (?:us|u\.s\.|united states)|must (?:reside|be based|live) in)\b/i;

function evidenceLooksGeoLocked(evidence: string[] | null): string | null {
  if (!evidence?.length) return null;
  for (const e of evidence) {
    if (typeof e === "string" && GEO_ONLY_EVIDENCE.test(e)) return e;
  }
  return null;
}

async function counts() {
  const res = await db.execute(sql`
    select
      count(*) filter (where t.role_family is distinct from 'non_tech')::int as tech_open,
      count(*) filter (where t.role_family is distinct from 'non_tech' and t.india_eligibility='open')::int as open_ww,
      count(*) filter (where t.role_family is distinct from 'non_tech' and t.india_eligibility='india_remote')::int as ir,
      count(*) filter (where t.role_family is distinct from 'non_tech' and t.india_eligibility='india_onsite')::int as io,
      count(*) filter (
        where t.role_family is distinct from 'non_tech'
          and t.india_eligibility in ('open','india_remote')
          and t.seniority in ('intern','entry','junior')
      )::int as early_india
    from jobs j
    join companies c on c.id = j.company_id
    join job_tags t on t.job_id = j.id
    where j.closed_at is null and c.active
  `);
  return res.rows[0] as Record<string, number>;
}

async function main() {
  const before = await counts();
  console.log("[recover] BEFORE", before);

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      descriptionText: jobs.descriptionText,
      companyName: companies.name,
      roleFamily: jobTags.roleFamily,
      indiaEligibility: jobTags.indiaEligibility,
      evidence: jobTags.eligibilityEvidence,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(isNull(jobs.closedAt));

  const reasonCounts = {
    staffing_noise: 0,
    true_non_dev: 0,
    eng_restored: 0,
    stayed_tech: 0,
    stayed_non_tech: 0,
    demoted_to_non_tech: 0,
    geo_locked: 0,
  };
  const restoredSamples: string[] = [];
  const excludedSamples: string[] = [];
  const removedSamples: Array<{
    title: string;
    company: string;
    reason: string;
    eligibility: string | null;
  }> = [];

  for (const row of rows) {
    const nextRole = classifyRoleFamily(
      row.title,
      row.descriptionText,
      row.companyName,
    ).role_family;
    const wasTech = row.roleFamily !== "non_tech";
    const nowTech = nextRole !== "non_tech";

    let reason = "other";
    if (!nowTech) {
      if (isStaffingNoise(row.title, row.companyName, row.descriptionText)) {
        reason = "staffing_noise";
        reasonCounts.staffing_noise += 1;
      } else {
        reason = "true_non_dev";
        reasonCounts.true_non_dev += 1;
      }
    }

    if (wasTech && nowTech) reasonCounts.stayed_tech += 1;
    else if (!wasTech && !nowTech) {
      reasonCounts.stayed_non_tech += 1;
      if (excludedSamples.length < 10) {
        excludedSamples.push(
          `[${row.indiaEligibility}] ${row.title} @ ${row.companyName} (${reason})`,
        );
      }
    } else if (!wasTech && nowTech) {
      reasonCounts.eng_restored += 1;
      if (restoredSamples.length < 10) {
        restoredSamples.push(
          `[${row.indiaEligibility}] ${row.title} @ ${row.companyName}`,
        );
      }
    } else {
      reasonCounts.demoted_to_non_tech += 1;
      if (removedSamples.length < 30) {
        removedSamples.push({
          title: row.title,
          company: row.companyName,
          reason,
          eligibility: row.indiaEligibility,
        });
      }
    }

    const patch: {
      roleFamily: string;
      indiaEligibility?: string;
      remoteScope?: string;
      classifiedAt: Date;
    } = {
      roleFamily: nextRole,
      classifiedAt: new Date(),
    };

    // Evidence bug: open/india_remote with US/EU/UK/Canada-only quote → region_locked
    if (
      (row.indiaEligibility === "open" ||
        row.indiaEligibility === "india_remote") &&
      evidenceLooksGeoLocked(row.evidence)
    ) {
      patch.indiaEligibility = "region_locked";
      patch.remoteScope = "region";
      reasonCounts.geo_locked += 1;
    }

    const roleChanged = row.roleFamily !== nextRole;
    const eligChanged = Boolean(patch.indiaEligibility);
    if (roleChanged || eligChanged) {
      await db.update(jobTags).set(patch).where(eq(jobTags.jobId, row.id));
    }
  }

  // Fill removed sample list with demotions + staffing that lost india labels from tech set
  if (removedSamples.length < 30) {
    for (const row of rows) {
      if (removedSamples.length >= 30) break;
      const next = classifyRoleFamily(
        row.title,
        row.descriptionText,
        row.companyName,
      ).role_family;
      if (row.roleFamily !== "non_tech" && next === "non_tech") continue; // already counted
      if (
        next === "non_tech" &&
        ["open", "india_remote", "india_onsite"].includes(
          row.indiaEligibility ?? "",
        )
      ) {
        const reason = isStaffingNoise(
          row.title,
          row.companyName,
          row.descriptionText,
        )
          ? "staffing_noise"
          : "true_non_dev";
        removedSamples.push({
          title: row.title,
          company: row.companyName,
          reason,
          eligibility: row.indiaEligibility,
        });
      }
    }
  }

  const after = await counts();
  console.log(
    JSON.stringify(
      {
        reason_counts: reasonCounts,
        restored_samples: restoredSamples,
        still_excluded_samples: excludedSamples,
        removed_samples_30: removedSamples.slice(0, 30),
        before,
        after_recovery: after,
      },
      null,
      2,
    ),
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
