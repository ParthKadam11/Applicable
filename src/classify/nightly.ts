import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { jobTags, jobs } from "../db/schema.js";
import { config } from "../config.js";
import { classifyAndStoreJob } from "./classify.js";
import {
  createLlmProvider,
  isExhausted,
  listConfiguredProviders,
  type ProviderName,
} from "./llm/index.js";
import { TokenBucket } from "./rate-limit.js";

function allConfiguredProvidersExhausted(): boolean {
  const providers = listConfiguredProviders();
  if (providers.length === 0) return true;
  return providers.every((p) => isExhausted(p.name as ProviderName));
}

export type NightlyLlmResult = {
  scanned: number;
  attempted: number;
  movedOutOfUnclear: number;
  stillUnclear: number;
  skippedNoLlm: number;
  stoppedReason: "completed" | "providers_exhausted" | "limit";
  byEligibility: Record<string, number>;
};

/**
 * Open tech jobs tagged unclear that have never received an LLM classification.
 * (classifier is null/rules/cache - not llm)
 */
export async function findUnclearTechJobsWithoutLlm(
  db: Db,
  limit?: number,
): Promise<Array<{ id: string }>> {
  const q = db
    .select({ id: jobs.id })
    .from(jobs)
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(
        isNull(jobs.closedAt),
        eq(jobTags.indiaEligibility, "unclear"),
        or(
          isNull(jobTags.roleFamily),
          ne(jobTags.roleFamily, "non_tech"),
        ),
        or(
          isNull(jobTags.classifier),
          ne(jobTags.classifier, "llm"),
        ),
      ),
    )
    .orderBy(jobs.firstSeenAt);

  if (limit != null && limit > 0) {
    return q.limit(limit);
  }
  return q;
}

/**
 * Batch LLM pass over unclear tech jobs. Stops cleanly when free-tier
 * providers are exhausted. Evidence guard runs inside classifyAndStoreJob.
 */
export async function runNightlyLlmPass(
  db: Db,
  options: { limit?: number; concurrency?: number } = {},
): Promise<NightlyLlmResult> {
  const limit = options.limit;
  const concurrency = Math.max(
    1,
    options.concurrency ?? config.CLASSIFY_CONCURRENCY,
  );
  const llm = createLlmProvider();
  const rateLimiter = llm ? new TokenBucket(config.LLM_RPM) : null;

  const candidates = await findUnclearTechJobsWithoutLlm(db, limit);
  const result: NightlyLlmResult = {
    scanned: candidates.length,
    attempted: 0,
    movedOutOfUnclear: 0,
    stillUnclear: 0,
    skippedNoLlm: 0,
    stoppedReason: "completed",
    byEligibility: {},
  };

  if (!llm) {
    console.warn("[classify:nightly] no LLM providers configured - skipping");
    result.skippedNoLlm = candidates.length;
    result.stoppedReason = "providers_exhausted";
    return result;
  }

  if (candidates.length === 0) {
    console.log("[classify:nightly] no unclear tech jobs without LLM cache");
    return result;
  }

  console.log(
    `[classify:nightly] starting: ${candidates.length} jobs (concurrency=${concurrency})`,
  );

  let stop = false;
  let cursor = 0;
  // classifyAndStoreJob swallows ALL_PROVIDERS_EXHAUSTED (incl. transient 503).
  // Stop after a streak of jobs that never reached the LLM.
  let consecutiveNoLlm = 0;
  const noLlmStopAfter = Math.max(concurrency * 2, 4);

  const bump = (eligibility: string) => {
    result.byEligibility[eligibility] =
      (result.byEligibility[eligibility] ?? 0) + 1;
  };

  async function worker(): Promise<void> {
    while (!stop) {
      if (allConfiguredProvidersExhausted()) {
        stop = true;
        result.stoppedReason = "providers_exhausted";
        console.warn(
          "[classify:nightly] providers exhausted - stopping cleanly",
        );
        return;
      }

      const idx = cursor;
      cursor += 1;
      if (idx >= candidates.length) return;
      const jobId = candidates[idx]!.id;

      try {
        result.attempted += 1;
        const tag = await classifyAndStoreJob(db, jobId, {
          llm,
          rateLimiter,
          rulesOnly: false,
          llmOnlyIfUnclear: true,
          force: true,
        });
        const el = tag.india_eligibility;
        bump(el);
        if (el === "unclear") {
          result.stillUnclear += 1;
        } else {
          result.movedOutOfUnclear += 1;
        }

        if (tag.classifier === "llm") {
          consecutiveNoLlm = 0;
        } else {
          consecutiveNoLlm += 1;
          if (
            allConfiguredProvidersExhausted() ||
            consecutiveNoLlm >= noLlmStopAfter
          ) {
            stop = true;
            result.stoppedReason = "providers_exhausted";
            console.warn(
              `[classify:nightly] providers unavailable (${consecutiveNoLlm} consecutive non-LLM) - stopping cleanly`,
            );
            return;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/ALL_PROVIDERS_EXHAUSTED/i.test(message)) {
          stop = true;
          result.stoppedReason = "providers_exhausted";
          console.warn(
            "[classify:nightly] providers exhausted - stopping cleanly",
          );
          return;
        }
        console.warn(
          `[classify:nightly] job ${jobId} failed:`,
          message.slice(0, 240),
        );
        result.stillUnclear += 1;
        bump("error");
        consecutiveNoLlm += 1;
        if (consecutiveNoLlm >= noLlmStopAfter) {
          stop = true;
          result.stoppedReason = "providers_exhausted";
          return;
        }
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  if (
    result.stoppedReason === "completed" &&
    limit != null &&
    candidates.length >= limit
  ) {
    result.stoppedReason = "limit";
  }

  // Detect exhaustion signaled via classify keeping unclear after rotation throws internally
  // (classifyAndStoreJob swallows ALL_PROVIDERS_EXHAUSTED and keeps rules).
  // Re-check: if we attempted jobs but none got classifier=llm recently and providers report exhausted,
  // the per-job path already logged; leave stoppedReason as-is unless we saw explicit throw.

  console.log(
    `[classify:nightly] done: scanned=${result.scanned} attempted=${result.attempted} ` +
      `moved_out_of_unclear=${result.movedOutOfUnclear} still_unclear=${result.stillUnclear} ` +
      `stopped=${result.stoppedReason} by=${JSON.stringify(result.byEligibility)}`,
  );

  return result;
}

/** Count open tech unclear jobs (any classifier) - for logging deltas. */
export async function countOpenUnclearTech(db: Db): Promise<number> {
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .innerJoin(jobTags, eq(jobTags.jobId, jobs.id))
    .where(
      and(
        isNull(jobs.closedAt),
        eq(jobTags.indiaEligibility, "unclear"),
        or(isNull(jobTags.roleFamily), ne(jobTags.roleFamily, "non_tech")),
      ),
    );
  return Number(n);
}
