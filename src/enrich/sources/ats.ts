import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { jobs } from "../../db/schema.js";
import { extractAboutSections, extractFactsFromText } from "../extract-rules.js";
import type { ExtractedFact } from "../types.js";

/** Pull about/footer signals from stored job descriptions (no extra network). */
export async function enrichFromAtsJobs(
  db: Db,
  company: { id: string; name: string; website: string; ats: string; atsSlug: string },
): Promise<ExtractedFact[]> {
  const rows = await db
    .select({
      id: jobs.id,
      applyUrl: jobs.applyUrl,
      descriptionText: jobs.descriptionText,
      locationRaw: jobs.locationRaw,
    })
    .from(jobs)
    .where(and(eq(jobs.companyId, company.id), isNull(jobs.closedAt)))
    .orderBy(desc(jobs.postedAt))
    .limit(25);

  const facts: ExtractedFact[] = [];
  for (const row of rows) {
    const sourceUrl =
      row.applyUrl ||
      `${company.website.replace(/\/$/, "")}/jobs/${row.id}`;
    const about = extractAboutSections(row.descriptionText ?? "");
    facts.push(
      ...extractFactsFromText({
        text: about,
        sourceUrl,
        sourceKind: "ats_jd",
      }),
    );
    if (row.locationRaw?.trim()) {
      // Location on JD is often role location, not HQ — only keep if "headquarters" nearby
      // skip as HQ here; ATS org path may still find "headquartered in"
    }
  }
  return facts;
}
