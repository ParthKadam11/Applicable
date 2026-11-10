import { eq } from "drizzle-orm";
import type { Ats } from "../ats/types.js";
import type { Db } from "../db/client.js";
import { companies, companyCandidates } from "../db/schema.js";
import { fetchCompanyJobs } from "../ingestion/fetch-company.js";
import { extractAtsUrls, websiteFromDomain } from "./ats-urls.js";
import { isBlocked, loadBlocklist } from "./blocklist.js";
import { countOpenJobs, detectAtsByGuess } from "./probe-ats.js";
import { MAX_JOBS_FOR_PROMOTE } from "./types.js";

export interface PromoteStats {
  pending: number;
  verified: number;
  promoted: number;
  rejected: number;
  skippedExisting: number;
  ingestedJobs: number;
}

async function existingAtsKeys(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ ats: companies.ats, slug: companies.atsSlug })
    .from(companies);
  return new Set(rows.map((r) => `${r.ats}:${r.slug.toLowerCase()}`));
}

async function reject(
  db: Db,
  id: string,
  reason: string,
): Promise<void> {
  await db
    .update(companyCandidates)
    .set({
      status: "rejected",
      rejectReason: reason.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(companyCandidates.id, id));
}

/**
 * Resolve ATS for pending candidates, promote startups with 1..500 open jobs.
 */
export async function verifyAndPromote(
  db: Db,
  options?: { limit?: number; ingest?: boolean },
): Promise<PromoteStats> {
  const limit = options?.limit ?? 80;
  const ingest = options?.ingest !== false;
  const blocklist = loadBlocklist();

  // Prefer candidates that already have an ATS URL/slug (fast path).
  const withAts = await db
    .select()
    .from(companyCandidates)
    .where(eq(companyCandidates.status, "pending"))
    .limit(limit * 3);

  const pending = [
    ...withAts.filter((c) => c.ats && c.atsSlug),
    ...withAts.filter((c) => !(c.ats && c.atsSlug)),
  ].slice(0, limit);

  const stats: PromoteStats = {
    pending: pending.length,
    verified: 0,
    promoted: 0,
    rejected: 0,
    skippedExisting: 0,
    ingestedJobs: 0,
  };

  const existing = await existingAtsKeys(db);

  for (const cand of pending) {
    if (
      isBlocked(blocklist, {
        name: cand.name,
        domain: cand.domain,
        atsSlug: cand.atsSlug,
      })
    ) {
      await reject(db, cand.id, "blocklisted in companies.yaml");
      stats.rejected += 1;
      continue;
    }

    let ats = cand.ats as Ats | null;
    let slug = cand.atsSlug;
    let evidence = cand.evidenceUrl;
    let jobCount: number | null = null;

    if (evidence) {
      const fromUrl = extractAtsUrls(evidence)[0];
      if (fromUrl) {
        ats = fromUrl.ats;
        slug = fromUrl.atsSlug;
        evidence = fromUrl.url;
      }
    }

    if (ats && slug) {
      try {
        jobCount = await countOpenJobs(ats, slug);
      } catch (err) {
        console.warn(
          `[discover:promote] count failed ${ats}/${slug}:`,
          err instanceof Error ? err.message.slice(0, 120) : err,
        );
        jobCount = null;
      }
      if (jobCount == null) {
        ats = null;
        slug = null;
      }
    }

    if (!ats || !slug) {
      const guessed = await detectAtsByGuess(cand.name, cand.domain);
      if (!guessed) {
        await reject(db, cand.id, "no ATS board found");
        stats.rejected += 1;
        continue;
      }
      ats = guessed.ats;
      slug = guessed.atsSlug;
      evidence = guessed.url;
      jobCount = guessed.jobCount;
    }

    if (jobCount == null) {
      jobCount = (await countOpenJobs(ats, slug)) ?? 0;
    }

    if (jobCount < 1) {
      await reject(db, cand.id, "ATS board has 0 open jobs");
      stats.rejected += 1;
      continue;
    }

    if (jobCount > MAX_JOBS_FOR_PROMOTE) {
      await reject(
        db,
        cand.id,
        `too many jobs (${jobCount} > ${MAX_JOBS_FOR_PROMOTE})`,
      );
      stats.rejected += 1;
      continue;
    }

    const key = `${ats}:${slug.toLowerCase()}`;
    if (existing.has(key)) {
      await db
        .update(companyCandidates)
        .set({
          status: "verified",
          ats,
          atsSlug: slug,
          evidenceUrl: evidence,
          jobCount,
          rejectReason: "already in companies",
          updatedAt: new Date(),
        })
        .where(eq(companyCandidates.id, cand.id));
      stats.verified += 1;
      stats.skippedExisting += 1;
      continue;
    }

    const website = websiteFromDomain(cand.domain);
    const [company] = await db
      .insert(companies)
      .values({
        name: cand.name,
        website,
        ats,
        atsSlug: slug,
        active: true,
      })
      .onConflictDoUpdate({
        target: [companies.ats, companies.atsSlug],
        set: {
          name: cand.name,
          active: true,
        },
      })
      .returning();

    if (!company) {
      await reject(db, cand.id, "failed to insert company");
      stats.rejected += 1;
      continue;
    }

    existing.add(key);

    await db
      .update(companyCandidates)
      .set({
        status: "verified",
        ats,
        atsSlug: slug,
        evidenceUrl: evidence,
        jobCount,
        promotedCompanyId: company.id,
        rejectReason: null,
        updatedAt: new Date(),
      })
      .where(eq(companyCandidates.id, cand.id));

    stats.verified += 1;
    stats.promoted += 1;

    if (ingest) {
      const result = await fetchCompanyJobs(db, company.id);
      if (result.ok) {
        stats.ingestedJobs += result.jobCount;
        console.log(
          `[discover:promote] ingested ${company.name}: ${result.jobCount} jobs`,
        );
      } else {
        console.warn(
          `[discover:promote] ingest failed ${company.name}: ${result.error}`,
        );
      }
    }
  }

  return stats;
}
