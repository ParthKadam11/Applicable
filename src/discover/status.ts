import { count, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companyCandidates } from "../db/schema.js";

export async function getDiscoverStatus(db: Db): Promise<{
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  bySourceStatus: Array<{ source: string; status: string; n: number }>;
}> {
  const statusRows = await db
    .select({
      status: companyCandidates.status,
      n: count(),
    })
    .from(companyCandidates)
    .groupBy(companyCandidates.status);

  const sourceRows = await db
    .select({
      source: companyCandidates.source,
      n: count(),
    })
    .from(companyCandidates)
    .groupBy(companyCandidates.source);

  const cross = await db
    .select({
      source: companyCandidates.source,
      status: companyCandidates.status,
      n: count(),
    })
    .from(companyCandidates)
    .groupBy(companyCandidates.source, companyCandidates.status)
    .orderBy(companyCandidates.source, companyCandidates.status);

  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = Number(r.n);

  const bySource: Record<string, number> = {};
  for (const r of sourceRows) bySource[r.source] = Number(r.n);

  return {
    byStatus,
    bySource,
    bySourceStatus: cross.map((r) => ({
      source: r.source,
      status: r.status,
      n: Number(r.n),
    })),
  };
}

export function formatDiscoverStatus(
  status: Awaited<ReturnType<typeof getDiscoverStatus>>,
): string {
  const lines = [
    "company_candidates status",
    `  by status: ${JSON.stringify(status.byStatus)}`,
    `  by source: ${JSON.stringify(status.bySource)}`,
    "",
    "  source × status:",
  ];
  for (const row of status.bySourceStatus) {
    lines.push(`    ${row.source.padEnd(12)} ${row.status.padEnd(10)} ${row.n}`);
  }
  void sql;
  return lines.join("\n");
}
