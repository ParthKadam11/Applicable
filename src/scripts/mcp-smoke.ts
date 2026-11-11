/**
 * Call each MCP tool once against the live DB (for local verification).
 * Usage: npm run mcp:smoke
 */
import { db, pool } from "../db/client.js";
import {
  getJob,
  getMcpStats,
  listCompanies,
  searchJobs,
  submitCompany,
} from "../mcp/tools.js";

function trim(obj: unknown, max = 1200): string {
  const s = JSON.stringify(obj, null, 2);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

async function main() {
  console.log("=== stats ===");
  const stats = await getMcpStats(db);
  console.log(trim(stats, 2000));

  console.log("\n=== search_jobs backend (default filters) ===");
  const search = await searchJobs(db, {
    query: "backend",
    eligibility: ["open", "india_remote"],
    limit: 5,
  });
  console.log(trim(search, 2500));

  console.log("\n=== get_job ===");
  const firstId = search.results[0]?.id;
  if (firstId) {
    const detail = await getJob(db, { id: firstId });
    console.log(trim(detail, 2000));
  } else {
    console.log("(no search hits — skipped get_job)");
  }

  console.log("\n=== list_companies ===");
  const companies = await listCompanies(db, { limit: 5 });
  console.log(trim(companies, 2000));

  console.log("\n=== submit_company ===");
  const once = await submitCompany(db, {
    name: "MCP Smoke Test Co",
    careers_url: "https://example.com/careers",
  });
  console.log(trim(once));
  const twice = await submitCompany(db, {
    name: "MCP Smoke Test Co",
    careers_url: "https://example.com/careers",
  });
  console.log("dedupe:", trim(twice));

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
