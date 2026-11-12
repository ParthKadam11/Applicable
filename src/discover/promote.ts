import { and, eq, sql } from "drizzle-orm";
import type { Ats } from "../ats/types.js";
import { classifyAndStoreJob } from "../classify/classify.js";
import { findJobsNeedingClassification } from "../classify/enqueue.js";
import { config } from "../config.js";
import type { Db } from "../db/client.js";
import { companies, companyCandidates } from "../db/schema.js";
import { fetchCompanyJobs } from "../ingestion/fetch-company.js";
import { extractAtsUrls, websiteFromDomain } from "./ats-urls.js";
import { fetchBoardJobTitles } from "./board-titles.js";
import { isBlocked, loadBlocklist } from "./blocklist.js";
import { resolveCompanyDisplayName } from "./company-name.js";
import { evaluateIndustryFilter } from "./industry-filter.js";
import { countOpenJobs, detectAtsByGuess } from "./probe-ats.js";

export interface PromoteStats {
  attempted: number;
  verified: number;
  promoted: number;
  rejected: number;
  skippedExisting: number;
  ingestedJobs: number;
  classifiedJobs: number;
  timedOutRetried: number;
  pendingRemaining: number;
}

function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /timeout|aborted|AbortError|ETIMEDOUT/i.test(msg);
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        await fn(items[idx]!);
      }
    },
  );
  await Promise.all(workers);
}

async function existingAtsKeys(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ ats: companies.ats, slug: companies.atsSlug })
    .from(companies);
  return new Set(rows.map((r) => `${r.ats}:${r.slug.toLowerCase()}`));
}

async function reject(db: Db, id: string, reason: string): Promise<void> {
  await db
    .update(companyCandidates)
    .set({
      status: "rejected",
      rejectReason: reason.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(eq(companyCandidates.id, id));
}

async function classifyNewJobs(
  db: Db,
  companyId: string,
): Promise<number> {
  const needing = await findJobsNeedingClassification(db, companyId);
  if (needing.length === 0) return 0;
  await mapPool(needing, 10, async (job) => {
    await classifyAndStoreJob(db, job.id, { rulesOnly: true, force: true });
  });
  return needing.length;
}

/** Deactivate companies that match the yaml blocklist by name or ATS slug. */
export async function deactivateBlocklistedCompanies(db: Db): Promise<number> {
  const blocklist = loadBlocklist();
  let n = 0;
  for (const name of blocklist.names) {
    const updated = await db
      .update(companies)
      .set({ active: false })
      .where(
        and(
          eq(companies.active, true),
          sql`lower(${companies.name}) = ${name.toLowerCase()}`,
        ),
      )
      .returning({ id: companies.id });
    n += updated.length;
  }
  for (const slug of blocklist.slugs) {
    const updated = await db
      .update(companies)
      .set({ active: false })
      .where(
        and(
          eq(companies.active, true),
          sql`lower(${companies.atsSlug}) = ${slug.toLowerCase()}`,
        ),
      )
      .returning({ id: companies.id });
    n += updated.length;
  }
  if (n > 0) {
    console.log(`[discover:promote] deactivated ${n} blocklisted companies`);
  }
  return n;
}

type Cand = typeof companyCandidates.$inferSelect;

type PromoteOutcome =
  | { kind: "ok" }
  | { kind: "timeout"; cand: Cand }
  | { kind: "done" };

async function promoteOne(
  db: Db,
  cand: Cand,
  existing: Set<string>,
  stats: PromoteStats,
  ingest: boolean,
): Promise<PromoteOutcome> {
  const blocklist = loadBlocklist();

  if (
    isBlocked(blocklist, {
      name: cand.name,
      domain: cand.domain,
      atsSlug: cand.atsSlug,
    })
  ) {
    await reject(db, cand.id, "blocklisted in companies.yaml");
    stats.rejected += 1;
    return { kind: "done" };
  }

  let ats = cand.ats as Ats | null;
  let slug = cand.atsSlug;
  let evidence = cand.evidenceUrl;
  let jobCount: number | null = null;

  try {
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
        if (isTimeoutError(err)) return { kind: "timeout", cand };
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
      try {
        const guessed = await detectAtsByGuess(cand.name, cand.domain);
        if (!guessed) {
          await reject(db, cand.id, "no ATS board found");
          stats.rejected += 1;
          return { kind: "done" };
        }
        ats = guessed.ats;
        slug = guessed.atsSlug;
        evidence = guessed.url;
        jobCount = guessed.jobCount;
      } catch (err) {
        if (isTimeoutError(err)) return { kind: "timeout", cand };
        throw err;
      }
    }

    if (jobCount == null) {
      try {
        jobCount = (await countOpenJobs(ats, slug)) ?? 0;
      } catch (err) {
        if (isTimeoutError(err)) return { kind: "timeout", cand };
        throw err;
      }
    }

    if (jobCount < 1) {
      await reject(db, cand.id, "ATS board has 0 open jobs");
      stats.rejected += 1;
      return { kind: "done" };
    }

    // Industry / tech-mix filter (all discovery sources).
    const keywordHit = evaluateIndustryFilter({
      name: cand.name,
      domain: cand.domain,
      atsSlug: slug,
    });
    if (!keywordHit.ok) {
      await reject(db, cand.id, keywordHit.reason);
      stats.rejected += 1;
      return { kind: "done" };
    }

    const titles = await fetchBoardJobTitles(ats, slug);
    const industry = evaluateIndustryFilter({
      name: cand.name,
      domain: cand.domain,
      atsSlug: slug,
      jobTitles: titles,
    });
    if (!industry.ok) {
      await reject(db, cand.id, industry.reason);
      stats.rejected += 1;
      return { kind: "done" };
    }

    const displayName = await resolveCompanyDisplayName({
      ats,
      slug,
      fallbackName: cand.name,
    });

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
      // Keep display name fresh when we re-verify an existing board.
      await db
        .update(companies)
        .set({ name: displayName })
        .where(
          and(eq(companies.ats, ats), eq(companies.atsSlug, slug)),
        );
      stats.verified += 1;
      stats.skippedExisting += 1;
      return { kind: "done" };
    }

    const website = websiteFromDomain(cand.domain);
    const [company] = await db
      .insert(companies)
      .values({
        name: displayName,
        website,
        ats,
        atsSlug: slug,
        active: true,
      })
      .onConflictDoUpdate({
        target: [companies.ats, companies.atsSlug],
        set: {
          name: displayName,
          active: true,
        },
      })
      .returning();

    if (!company) {
      await reject(db, cand.id, "failed to insert company");
      stats.rejected += 1;
      return { kind: "done" };
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
        const classified = await classifyNewJobs(db, company.id);
        stats.classifiedJobs += classified;
        console.log(
          `[discover:promote] ${company.name}: ingested ${result.jobCount}, classified ${classified}`,
        );
      } else {
        if (isTimeoutError(result.error)) {
          return { kind: "timeout", cand };
        }
        console.warn(
          `[discover:promote] ingest failed ${company.name}: ${result.error}`,
        );
      }
    }

    return { kind: "ok" };
  } catch (err) {
    if (isTimeoutError(err)) return { kind: "timeout", cand };
    const msg = err instanceof Error ? err.message : String(err);
    await reject(db, cand.id, `error: ${msg.slice(0, 200)}`);
    stats.rejected += 1;
    return { kind: "done" };
  }
}

async function loadPendingBatch(
  db: Db,
  batchSize: number,
  candidateIds?: string[],
): Promise<Cand[]> {
  const conditions = [eq(companyCandidates.status, "pending")];
  if (candidateIds && candidateIds.length > 0) {
    conditions.push(
      sql`${companyCandidates.id} in (${sql.join(
        candidateIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }
  const rows = await db
    .select()
    .from(companyCandidates)
    .where(and(...conditions))
    .orderBy(
      sql`case when ${companyCandidates.ats} is not null then 0 else 1 end`,
      companyCandidates.discoveredAt,
    )
    .limit(batchSize);
  return rows;
}

async function countPending(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(companyCandidates)
    .where(eq(companyCandidates.status, "pending"));
  return Number(row?.n ?? 0);
}

/**
 * Promote pending candidates in concurrent batches until pending=0 or limit hit.
 * Timeouts are retried once at the end of the run.
 */
export async function verifyAndPromote(
  db: Db,
  options?: {
    limit?: number;
    concurrency?: number;
    ingest?: boolean;
    /** When set, only promote these candidate UUIDs (tests / targeted runs). */
    candidateIds?: string[];
  },
): Promise<PromoteStats> {
  const limit = options?.limit ?? config.DISCOVER_PROMOTE_LIMIT;
  const concurrency =
    options?.concurrency ?? config.DISCOVER_PROMOTE_CONCURRENCY;
  const ingest = options?.ingest !== false;
  const candidateIds = options?.candidateIds;

  await deactivateBlocklistedCompanies(db);

  const stats: PromoteStats = {
    attempted: 0,
    verified: 0,
    promoted: 0,
    rejected: 0,
    skippedExisting: 0,
    ingestedJobs: 0,
    classifiedJobs: 0,
    timedOutRetried: 0,
    pendingRemaining: 0,
  };

  const existing = await existingAtsKeys(db);
  const timedOut: Cand[] = [];
  const batchSize = Math.max(concurrency * 2, 10);

  while (stats.attempted < limit) {
    const remaining = limit - stats.attempted;
    const batch = await loadPendingBatch(
      db,
      Math.min(batchSize, remaining),
      candidateIds,
    );
    if (batch.length === 0) break;

    await mapPool(batch, concurrency, async (cand) => {
      if (stats.attempted >= limit) return;
      stats.attempted += 1;
      const outcome = await promoteOne(db, cand, existing, stats, ingest);
      if (outcome.kind === "timeout") {
        timedOut.push(outcome.cand);
      }
    });
  }

  // Retry timeouts once later.
  for (const cand of timedOut) {
    if (stats.attempted > limit + timedOut.length) break;
    stats.timedOutRetried += 1;
    console.log(`[discover:promote] retry after timeout: ${cand.name}`);
    const outcome = await promoteOne(db, cand, existing, stats, ingest);
    if (outcome.kind === "timeout") {
      await reject(db, cand.id, "timeout after retry");
      stats.rejected += 1;
    }
  }

  stats.pendingRemaining = await countPending(db);
  return stats;
}
