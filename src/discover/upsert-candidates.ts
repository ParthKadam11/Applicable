import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { companyCandidates } from "../db/schema.js";
import type { DiscoveredCompany } from "./types.js";

/** Collapse duplicate (source, name) rows — last write wins ATS evidence. */
export function dedupeDiscovered(
  discovered: DiscoveredCompany[],
): DiscoveredCompany[] {
  const byKey = new Map<string, DiscoveredCompany>();
  for (const d of discovered) {
    const name = d.name.slice(0, 200);
    const key = `${d.source}::${name.toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...d, name });
      continue;
    }
    byKey.set(key, {
      ...prev,
      ...d,
      name,
      domain: d.domain ?? prev.domain,
      evidenceUrl: d.evidenceUrl ?? prev.evidenceUrl,
      ats: d.ats ?? prev.ats,
      atsSlug: d.atsSlug ?? prev.atsSlug,
      earlyCareer: Boolean(prev.earlyCareer || d.earlyCareer),
      priorityGeo: Boolean(prev.priorityGeo || d.priorityGeo),
    });
  }
  return [...byKey.values()];
}

export async function upsertCandidates(
  db: Db,
  discovered: DiscoveredCompany[],
): Promise<number> {
  const unique = dedupeDiscovered(discovered);
  if (unique.length === 0) return 0;

  let written = 0;
  const chunk = 50;
  for (let i = 0; i < unique.length; i += chunk) {
    const batch = unique.slice(i, i + chunk).map((d) => ({
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
          // Re-open rejected/verified-with-new-evidence for promote.
          status: sql`case
            when ${companyCandidates.status} = 'rejected'
              and excluded.ats is not null
            then 'pending'
            when ${companyCandidates.status} = 'rejected'
              and excluded.evidence_url is distinct from ${companyCandidates.evidenceUrl}
              and excluded.evidence_url is not null
            then 'pending'
            else ${companyCandidates.status}
          end`,
          rejectReason: sql`case
            when ${companyCandidates.status} = 'rejected'
              and (
                excluded.ats is not null
                or (
                  excluded.evidence_url is distinct from ${companyCandidates.evidenceUrl}
                  and excluded.evidence_url is not null
                )
              )
            then null
            else ${companyCandidates.rejectReason}
          end`,
          updatedAt: new Date(),
        },
      });
    written += batch.length;
  }
  return written;
}
