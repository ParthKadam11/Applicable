import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companyCandidates } from "../db/schema.js";

export async function getDiscoverStatus(db: Db): Promise<{
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  bySourceStatus: Array<{ source: string; status: string; n: number }>;
  rejections: Array<{ reason: string; n: number }>;
  recentRejected: Array<{
    name: string;
    source: string;
    reason: string | null;
  }>;
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

  const rejectionRows = await db
    .select({
      reason: companyCandidates.rejectReason,
      n: count(),
    })
    .from(companyCandidates)
    .where(eq(companyCandidates.status, "rejected"))
    .groupBy(companyCandidates.rejectReason)
    .orderBy(desc(count()));

  const recentRejected = await db
    .select({
      name: companyCandidates.name,
      source: companyCandidates.source,
      reason: companyCandidates.rejectReason,
    })
    .from(companyCandidates)
    .where(
      and(
        eq(companyCandidates.status, "rejected"),
        sql`${companyCandidates.rejectReason} is not null`,
      ),
    )
    .orderBy(desc(companyCandidates.updatedAt))
    .limit(25);

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
    rejections: rejectionRows.map((r) => ({
      reason: r.reason ?? "(none)",
      n: Number(r.n),
    })),
    recentRejected,
  };
}

export function formatDiscoverStatus(
  status: Awaited<ReturnType<typeof getDiscoverStatus>>,
): string {
  const lines = [
    "company_candidates",
    `  totals: ${JSON.stringify(status.byStatus)}`,
    "",
    "  by source × status:",
  ];
  for (const row of status.bySourceStatus) {
    lines.push(
      `    ${row.source.padEnd(12)} ${row.status.padEnd(10)} ${row.n}`,
    );
  }

  lines.push("", "  rejection reasons:");
  if (status.rejections.length === 0) {
    lines.push("    (none)");
  } else {
    for (const r of status.rejections) {
      lines.push(`    ${String(r.n).padStart(4)}  ${r.reason}`);
    }
  }

  if (status.recentRejected.length > 0) {
    lines.push("", "  recent rejected:");
    for (const r of status.recentRejected.slice(0, 15)) {
      lines.push(`    - ${r.name} [${r.source}]: ${r.reason ?? "?"}`);
    }
  }

  return lines.join("\n");
}
