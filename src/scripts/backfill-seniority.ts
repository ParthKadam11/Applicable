/**
 * Recompute seniority (+ evidence / YoE) for all open jobs via rules.
 * Default: seniority fields only (preserves india labels).
 * --full: full rules reclassify (also refreshes india/role).
 *
 * Usage: npx tsx src/scripts/backfill-seniority.ts [--full] [--limit=N]
 */
import { eq, isNull } from "drizzle-orm";
import { classifyAndStoreJob } from "../classify/classify.js";
import { classifySeniority } from "../classify/seniority.js";
import { db, pool } from "../db/client.js";
import { jobTags, jobs } from "../db/schema.js";

async function main() {
  const full = process.argv.includes("--full");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      descriptionText: jobs.descriptionText,
    })
    .from(jobs)
    .where(isNull(jobs.closedAt))
    .limit(limit > 0 ? limit : 100_000);

  console.log(
    `[backfill-seniority] open jobs=${rows.length} mode=${full ? "full" : "seniority-only"}`,
  );

  let updated = 0;
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (full) {
      await classifyAndStoreJob(db, row.id, { rulesOnly: true, force: true });
      const [tag] = await db
        .select({ seniority: jobTags.seniority })
        .from(jobTags)
        .where(eq(jobTags.jobId, row.id))
        .limit(1);
      const s = tag?.seniority ?? "unknown";
      counts.set(s, (counts.get(s) ?? 0) + 1);
      updated += 1;
    } else {
      const r = classifySeniority(row.title, row.descriptionText ?? "");
      await db
        .update(jobTags)
        .set({
          seniority: r.seniority,
          seniorityEvidence: r.evidence,
          yearsExperienceMin: r.yearsMin,
          yearsExperienceMax: r.yearsMax,
        })
        .where(eq(jobTags.jobId, row.id));
      counts.set(r.seniority, (counts.get(r.seniority) ?? 0) + 1);
      updated += 1;
    }
    if (updated % 500 === 0) {
      console.log(`[backfill-seniority] ${updated}/${rows.length}`);
    }
  }

  console.log("[backfill-seniority] counts:");
  for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`[backfill-seniority] done updated=${updated}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
