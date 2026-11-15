/** npm run health:check — ingest/classify/MCP/web stability snapshot */
import { sql } from "drizzle-orm";
import { execSync } from "node:child_process";
import { db, pool } from "../db/client.js";
import { getMcpStats } from "../mcp/tools.js";

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 15_000 }).trim();
  } catch (err) {
    return `ERR: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function main() {
  const labels = await db.execute(sql`
    SELECT t.india_eligibility AS label, count(*)::int AS n
    FROM jobs j
    JOIN job_tags t ON t.job_id = j.id
    JOIN companies c ON c.id = j.company_id
    WHERE j.closed_at IS NULL AND c.active = true
      AND (t.role_family IS NULL OR t.role_family <> 'non_tech')
    GROUP BY 1 ORDER BY 2 DESC
  `);

  const lastIngest = await db.execute(sql`
    SELECT finished_at, started_at, ok, company_id
    FROM fetch_runs
    WHERE ok = true
    ORDER BY finished_at DESC NULLS LAST
    LIMIT 1
  `);

  const stats = await getMcpStats(db);

  const pm2 = sh("pm2 jlist");
  let pm2Apps: unknown[] = [];
  try {
    const list = JSON.parse(pm2) as Array<{
      name: string;
      pm2_env?: { status?: string; restart_time?: number; unstable_restarts?: number };
      monit?: { memory?: number };
    }>;
    pm2Apps = list
      .filter((p) => /applicable|mcp/i.test(p.name))
      .map((p) => ({
        name: p.name,
        status: p.pm2_env?.status,
        restarts: p.pm2_env?.restart_time,
        unstable_restarts: p.pm2_env?.unstable_restarts,
      }));
  } catch {
    pm2Apps = [{ raw: pm2.slice(0, 200) }];
  }

  const docker = sh(
    "docker ps --format '{{.Names}}\t{{.Status}}' | rg -i 'applicable|caniapply|hydra' || true",
  );

  const out = {
    last_ingest: lastIngest.rows[0] ?? null,
    jobs_by_label: labels.rows,
    mcp_stats: {
      companies_active: stats.companies_active,
      tech_open_jobs: stats.tech_open_jobs,
      by_eligibility: stats.by_eligibility,
      last_ingestion_at: stats.last_ingestion_at,
      learning: stats.learning ?? null,
      graph: stats.graph,
    },
    pm2: pm2Apps,
    docker: docker.split("\n").filter(Boolean),
  };
  console.log(JSON.stringify(out, null, 2));
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
