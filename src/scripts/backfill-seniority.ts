/**
 * Recompute seniority (+ evidence / YoE) for open jobs via rules.
 * Default: seniority fields only (preserves india labels), unknowns only.
 * --all: recompute every open job
 * --full: full rules reclassify (also refreshes india/role)
 *
 * Usage: npx tsx src/scripts/backfill-seniority.ts [--all] [--full] [--limit=N]
 */
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { classifyAndStoreJob } from "../classify/classify.js";
import { classifySeniority } from "../classify/seniority.js";
import { db, pool } from "../db/client.js";
import { jobTags, jobs } from "../db/schema.js";

async function seniorityCounts() {
  const res = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE j.closed_at IS NULL)::text AS open_jobs,
      count(*) FILTER (WHERE j.closed_at IS NULL AND coalesce(t.seniority, 'unknown') = 'unknown')::text AS unknown,
      count(*) FILTER (WHERE j.closed_at IS NULL AND t.seniority = 'entry')::text AS entry,
      count(*) FILTER (WHERE j.closed_at IS NULL AND t.seniority = 'intern')::text AS intern,
      count(*) FILTER (
        WHERE j.closed_at IS NULL
          AND t.seniority IN ('entry', 'intern', 'junior')
      )::text AS early,
      count(*) FILTER (
        WHERE j.closed_at IS NULL
          AND t.seniority IN ('entry', 'intern', 'junior')
          AND t.india_eligibility IN ('open', 'india_remote')
      )::text AS india_early
    FROM jobs j
    LEFT JOIN job_tags t ON t.job_id = j.id
  `);
  const row = (res.rows as Array<Record<string, string>>)[0];
  if (!row) throw new Error("seniorityCounts: empty result");
  return row;
}

async function main() {
  const full = process.argv.includes("--full");
  const all = process.argv.includes("--all") || full;
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

  const before = await seniorityCounts();
  console.log("[backfill-seniority] BEFORE", before);

  const where = all
    ? isNull(jobs.closedAt)
    : and(
        isNull(jobs.closedAt),
        or(
          eq(jobTags.seniority, "unknown"),
          isNull(jobTags.seniority),
        ),
      );

  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      descriptionText: jobs.descriptionText,
      prev: jobTags.seniority,
    })
    .from(jobs)
    .leftJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(where)
    .limit(limit > 0 ? limit : 100_000);

  console.log(
    `[backfill-seniority] targets=${rows.length} mode=${full ? "full" : all ? "seniority-all" : "unknown-only"}`,
  );

  let updated = 0;
  let changed = 0;
  const counts = new Map<string, number>();
  const samples: Array<{
    id: string;
    title: string;
    from: string;
    to: string;
    evidence: string | null;
  }> = [];

  for (const row of rows) {
    if (full) {
      await classifyAndStoreJob(db, row.id, { rulesOnly: true, force: true });
      const [tag] = await db
        .select({
          seniority: jobTags.seniority,
          evidence: jobTags.seniorityEvidence,
        })
        .from(jobTags)
        .where(eq(jobTags.jobId, row.id))
        .limit(1);
      const s = tag?.seniority ?? "unknown";
      counts.set(s, (counts.get(s) ?? 0) + 1);
      if (s !== (row.prev ?? "unknown")) {
        changed += 1;
        if (samples.length < 40 && s !== "unknown") {
          samples.push({
            id: row.id,
            title: row.title,
            from: row.prev ?? "unknown",
            to: s,
            evidence: tag?.evidence ?? null,
          });
        }
      }
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
      if (r.seniority !== (row.prev ?? "unknown")) {
        changed += 1;
        if (samples.length < 40 && r.seniority !== "unknown") {
          samples.push({
            id: row.id,
            title: row.title,
            from: row.prev ?? "unknown",
            to: r.seniority,
            evidence: r.evidence,
          });
        }
      }
      updated += 1;
    }
    if (updated % 500 === 0) {
      console.log(`[backfill-seniority] ${updated}/${rows.length}`);
    }
  }

  // Fisher-Yates pick 20 samples for spot-check
  for (let i = samples.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [samples[i], samples[j]] = [samples[j]!, samples[i]!];
  }
  const spot = samples.slice(0, 20);

  console.log("[backfill-seniority] batch counts:");
  for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`[backfill-seniority] done updated=${updated} changed=${changed}`);

  const after = await seniorityCounts();
  console.log("[backfill-seniority] AFTER", after);
  console.log("[backfill-seniority] SAMPLES");
  for (const s of spot) {
    console.log(
      JSON.stringify({
        title: s.title,
        from: s.from,
        to: s.to,
        evidence: s.evidence?.slice(0, 140) ?? null,
      }),
    );
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
