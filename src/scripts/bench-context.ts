/**
 * Compare naive full-description / compact Postgres / explore|skill_gap.
 * Writes bench/context-results.md
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { companies, jobTags, jobs } from "../db/schema.js";
import { explore } from "../graph/explore.js";
import { skillGap } from "../graph/skill-gap.js";
import { createGraphClient, closeSharedGraphDriver } from "../graph/driver.js";

function tokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function overlapAtK(a: string[], b: string[], k = 10): number {
  const left = new Set(a.slice(0, k));
  const right = b.slice(0, k);
  if (left.size === 0 && right.length === 0) return 1;
  if (left.size === 0 || right.length === 0) return 0;
  let hit = 0;
  for (const id of right) if (left.has(id)) hit += 1;
  return hit / Math.min(k, Math.max(left.size, right.length), k);
}

type CompactRow = {
  id: string;
  title: string;
  company: string;
  label: string | null;
  apply_url: string;
};

async function fetchMatchingJobs(
  question: string,
  limit = 20,
): Promise<{
  naive_tokens: number;
  compact_tokens: number;
  latency_ms: number;
  ids: string[];
  compact: CompactRow[];
}> {
  const started = Date.now();
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9_+#.-]+/)
    .filter((w) => w.length > 2)
    .slice(0, 6);
  const conds = words.map(
    (w) =>
      or(
        ilike(jobs.title, `%${w}%`),
        ilike(jobs.descriptionText, `%${w}%`),
        ilike(companies.name, `%${w}%`),
      )!,
  );
  const rows = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      descriptionText: jobs.descriptionText,
      company: companies.name,
      label: jobTags.indiaEligibility,
      applyUrl: jobs.applyUrl,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(
        isNull(jobs.closedAt),
        eq(companies.active, true),
        or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
        inArray(jobTags.indiaEligibility, ["open", "india_remote"]),
        words.length ? or(...conds) : sql`true`,
      ),
    )
    .limit(limit);

  const naiveBlob = rows
    .map((r) => `${r.company}\n${r.title}\n${r.descriptionText}`)
    .join("\n---\n");
  const compact: CompactRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    company: r.company,
    label: r.label ?? null,
    apply_url: r.applyUrl,
  }));
  const compactBlob = JSON.stringify(compact);

  return {
    naive_tokens: tokens(naiveBlob),
    compact_tokens: tokens(compactBlob),
    latency_ms: Date.now() - started,
    ids: rows.map((r) => r.id),
    compact,
  };
}

type Row = {
  q: string;
  tool: string;
  naive_jobs: number;
  naive_tokens: number;
  naive_ms: number;
  compact_tokens: number;
  graph_tokens: number;
  graph_ms: number;
  graph_lines: number;
  overlap_at_10: string;
};

async function main() {
  const client = createGraphClient();
  const rows: Row[] = [];

  async function pushExplore(
    q: string,
    keywordQuery: string,
    input: Parameters<typeof explore>[1],
  ) {
    const base = await fetchMatchingJobs(keywordQuery);
    const started = Date.now();
    const ex = await explore(db, input, { client });
    const graphIds = ex.jobs.map((j) => j.id);
    rows.push({
      q,
      tool: "explore",
      naive_jobs: base.ids.length,
      naive_tokens: base.naive_tokens,
      naive_ms: base.latency_ms,
      compact_tokens: base.compact_tokens,
      graph_tokens: ex.tokens_used,
      graph_ms: Date.now() - started,
      graph_lines: ex.lines.length,
      overlap_at_10: overlapAtK(base.ids, graphIds, 10).toFixed(2),
    });
  }

  await pushExplore(
    "backend jobs similar to companies I'd like, India OK (start rescale)",
    "backend remote india",
    {
      start: { type: "company", value: "rescale" },
      path: ["SIMILAR_TO", "POSTS", "LABELED"],
      filter: { labels: ["open", "india_remote"] },
      max_results: 10,
      max_tokens: 1500,
    },
  );

  {
    const q =
      "what skill unlocks most India remote jobs for a Node+Postgres dev";
    const base = await fetchMatchingJobs("nodejs postgres remote");
    const started = Date.now();
    const sg = await skillGap(
      db,
      {
        my_skills: ["nodejs", "postgres"],
        labels: ["open", "india_remote"],
      },
      { client },
    );
    const exampleIds = sg.gaps.flatMap((g) => g.examples.map((e) => e.id));
    const payload = JSON.stringify(sg.gaps);
    rows.push({
      q,
      tool: "skill_gap",
      naive_jobs: base.ids.length,
      naive_tokens: base.naive_tokens,
      naive_ms: base.latency_ms,
      compact_tokens: base.compact_tokens,
      graph_tokens: tokens(payload),
      graph_ms: Date.now() - started,
      graph_lines: sg.gaps.length,
      overlap_at_10: overlapAtK(base.ids, exampleIds, 10).toFixed(2),
    });
  }

  await pushExplore("India-OK jobs requiring typescript", "typescript", {
    start: { type: "skill", value: "typescript" },
    path: ["REQUIRES"],
    filter: { labels: ["open", "india_remote"] },
    max_results: 10,
  });

  await pushExplore("open jobs at alpaca", "alpaca", {
    start: { type: "company", value: "alpaca" },
    path: ["POSTS", "LABELED"],
    filter: { labels: ["open", "india_remote"] },
    max_results: 10,
  });

  await pushExplore("India-OK kubernetes roles", "kubernetes", {
    start: { type: "skill", value: "kubernetes" },
    path: ["REQUIRES"],
    filter: { labels: ["open", "india_remote"] },
    max_results: 10,
  });

  const md = `# Context layer benchmark

Generated: ${new Date().toISOString()}
Graph enabled: ${client.enabled}

Baselines:
- **A naive** = full title+description blobs for keyword-matched India-OK tech jobs
- **C compact** = same rows as \`{id,title,company,label,apply_url}\` JSON
- **B graph** = explore path lines or skill_gap JSON (approx chars/4)
- **overlap@10** = |graph∩compact| / 10 on job ids (skill_gap uses example job ids)

| Question | Tool | A jobs | A tokens | A ms | C tokens | B tokens | B ms | B lines/gaps | overlap@10 | B/A | B/C |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${rows
  .map((r) => {
    const ba =
      r.naive_tokens > 0
        ? (r.graph_tokens / r.naive_tokens).toFixed(3)
        : "n/a";
    const bc =
      r.compact_tokens > 0
        ? (r.graph_tokens / r.compact_tokens).toFixed(3)
        : "n/a";
    return `| ${r.q.replace(/\|/g, "/")} | ${r.tool} | ${r.naive_jobs} | ${r.naive_tokens} | ${r.naive_ms} | ${r.compact_tokens} | ${r.graph_tokens} | ${r.graph_ms} | ${r.graph_lines} | ${r.overlap_at_10} | ${ba} | ${bc} |`;
  })
  .join("\n")}
`;

  const dir = join(process.cwd(), "bench");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, "context-results.md");
  writeFileSync(out, md);
  console.log(md);
  console.log(`wrote ${out}`);

  await closeSharedGraphDriver();
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
