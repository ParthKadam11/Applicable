import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companyCandidates } from "../db/schema.js";
import type { DiscoveredCompany } from "./types.js";

export async function upsertCandidates(
  db: Db,
  discovered: DiscoveredCompany[],
): Promise<number> {
  if (discovered.length === 0) return 0;

  let written = 0;
  const chunk = 50;
  for (let i = 0; i < discovered.length; i += chunk) {
    const batch = discovered.slice(i, i + chunk).map((d) => ({
      name: d.name.slice(0, 200),
      domain: d.domain ?? null,
      source: d.source,
      status: "pending" as const,
      ats: d.ats ?? null,
      atsSlug: d.atsSlug ?? null,
      evidenceUrl: d.evidenceUrl ?? null,
      updatedAt: new Date(),
    }));

    await db
      .insert(companyCandidates)
      .values(batch)
      .onConflictDoUpdate({
        target: [companyCandidates.source, companyCandidates.name],
        set: {
          domain: sql`coalesce(excluded.domain, ${companyCandidates.domain})`,
          evidenceUrl: sql`coalesce(excluded.evidence_url, ${companyCandidates.evidenceUrl})`,
          ats: sql`coalesce(${companyCandidates.ats}, excluded.ats)`,
          atsSlug: sql`coalesce(${companyCandidates.atsSlug}, excluded.ats_slug)`,
          updatedAt: new Date(),
        },
      });
    written += batch.length;
  }
  return written;
}
