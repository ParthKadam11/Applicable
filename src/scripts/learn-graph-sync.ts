/**
 * Push all Postgres corrections (+ patterns) into Hydra after a graph wipe/resync.
 * npm run learn:graph-sync
 */
import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { companies, corrections, jobs, learnedPatterns } from "../db/schema.js";
import {
  countLearningGraphNodes,
  pushCorrectionToGraph,
} from "../learn/graph-learn.js";
import { extractPatternPhrase } from "../learn/patterns.js";

async function main() {
  const rows = await db
    .select({
      id: corrections.id,
      jobId: corrections.jobId,
      oldLabel: corrections.oldLabel,
      newLabel: corrections.newLabel,
      evidence: corrections.evidence,
      source: corrections.source,
      companyId: jobs.companyId,
      companyName: companies.name,
    })
    .from(corrections)
    .innerJoin(jobs, eq(jobs.id, corrections.jobId))
    .innerJoin(companies, eq(companies.id, jobs.companyId));

  const patterns = await db.select().from(learnedPatterns);
  const weightByPhrase = new Map(
    patterns.map((p) => [p.phrase, { label: p.label, weight: Number(p.weight) }]),
  );

  let ok = 0;
  let fail = 0;
  for (const r of rows) {
    const phrase = extractPatternPhrase(r.evidence);
    const pat = phrase ? weightByPhrase.get(phrase) : undefined;
    const result = await pushCorrectionToGraph({
      correctionId: r.id,
      jobId: r.jobId,
      companyId: r.companyId,
      companyName: r.companyName,
      oldLabel: r.oldLabel,
      newLabel: r.newLabel,
      evidence: r.evidence,
      source: r.source,
      patternPhrase: phrase,
      patternLabel: pat?.label ?? r.newLabel,
      patternWeight: pat?.weight ?? 1,
    });
    if (result.ok) ok += 1;
    else {
      fail += 1;
      console.error(`fail ${r.id}: ${result.error}`);
    }
  }

  const hydra = await countLearningGraphNodes();
  console.log(
    JSON.stringify(
      {
        postgres: { corrections: rows.length, patterns: patterns.length },
        pushed: { ok, fail },
        hydra,
      },
      null,
      2,
    ),
  );
  await pool.end();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
