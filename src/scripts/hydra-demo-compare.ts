import { sql } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { askJobs } from "../hydra/ask.js";
import { createHydraClient } from "../hydra/client.js";
import { searchJobs } from "../mcp/tools.js";

/** Semantic questions for Hydra; when disabled, title ILIKE fallback may return fewer hits. */
const questions = [
  "remote backend engineer India",
  "SRE or devops with India eligibility",
  "frontend React jobs open worldwide",
];

async function main() {
  const eligible = await db.execute(sql`
    select count(*)::int as n from jobs j
    join companies c on c.id = j.company_id
    join job_tags t on t.job_id = j.id
    where j.closed_at is null and c.active = true
      and (t.role_family is null or t.role_family <> 'non_tech')
      and t.india_eligibility in ('open','india_remote','india_onsite')
  `);
  const rows = (eligible as unknown as { rows: Array<{ n: number }> }).rows;
  console.log("eligible_for_hydra_sync", rows[0]?.n ?? null);

  const client = createHydraClient();
  console.log("hydra_enabled", client.enabled);

  for (const q of questions) {
    const ask = await askJobs(db, { question: q, max_results: 10 }, client);
    const search = await searchJobs(db, {
      query: q,
      limit: 10,
      eligibility: ["open", "india_remote"],
    });
    const searchTokens = Math.ceil(JSON.stringify(search).length / 4);
    console.log(
      JSON.stringify({
        question: q,
        ask_jobs: {
          source: ask.source,
          count: ask.count,
          latency_ms: ask.latency_ms,
          approx_tokens: ask.approx_response_tokens,
          fallback: ask.fallback_reason,
        },
        search_jobs: { count: search.count, approx_tokens: searchTokens },
      }),
    );
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
