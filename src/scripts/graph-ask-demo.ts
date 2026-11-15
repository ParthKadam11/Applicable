import { db, pool } from "../db/client.js";
import { askJobs } from "../graph/ask.js";
import { createGraphClient, closeSharedGraphDriver } from "../graph/driver.js";
import { countGraphTotals } from "../graph/cypher.js";
import { sql } from "drizzle-orm";

async function main() {
  const client = createGraphClient({ enabled: true });
  const totals = await countGraphTotals((cypher, params) =>
    client.run(cypher, params),
  );
  console.log(JSON.stringify({ graph_nodes: totals.nodes, graph_edges: totals.edges }));

  const slugRow = await db.execute(sql`
    select c.slug from companies c
    where c.active = true and c.slug is not null
    limit 1
  `);
  const slug =
    (slugRow as unknown as { rows: Array<{ slug: string }> }).rows[0]?.slug ??
    "rescale";

  const examples = [
    await askJobs(
      db,
      {
        op: "match_skills",
        skills: ["postgres", "typescript", "kubernetes"],
        max_results: 10,
      },
      client,
    ),
    await askJobs(
      db,
      { op: "similar_companies", company_slug: slug, max_results: 10 },
      client,
    ),
    await askJobs(
      db,
      {
        op: "company_jobs_by_skill",
        skill: "react",
        company_slug: slug,
        max_results: 10,
      },
      client,
    ),
  ];

  for (const ex of examples) {
    console.log(
      JSON.stringify({
        op: ex.op,
        source: ex.source,
        fallback_reason: ex.fallback_reason,
        count: ex.count,
        latency_ms: ex.latency_ms,
        approx_tokens: ex.approx_response_tokens,
        sample_jobs: ex.jobs.slice(0, 3).map((j) => ({
          id: j.id,
          title: j.title,
          company: j.company,
          matched_skills: j.matched_skills,
        })),
        sample_companies: ex.companies?.slice(0, 3),
      }),
    );
  }

  await closeSharedGraphDriver();
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
