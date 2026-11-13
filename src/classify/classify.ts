import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { jobTags, jobs, type Job } from "../db/schema.js";
import { isNegativeEligibilitySentence } from "./eligibility.js";
import { guardEvidence } from "./guard.js";
import { retryAfterMsFromError } from "./llm/errors.js";
import { createLlmProvider, type LlmProvider } from "./llm/index.js";
import { buildEligibilitySnippet } from "./llm/snippet.js";
import { TokenBucket } from "./rate-limit.js";
import { isTechRole } from "./roles.js";
import { compensationFromAtsRaw } from "./compensation.js";
import { classifyWithRules, shouldCallLlm } from "./rules.js";
import {
  LlmClassificationSchema,
  type ClassificationResult,
  type ClassifiedTag,
} from "./types.js";

export { retryAfterMsFromError };

export interface ClassifyOptions {
  llm?: LlmProvider | null;
  rateLimiter?: TokenBucket | null;
  /** Skip LLM even if rules are inconclusive (tests / offline). */
  rulesOnly?: boolean;
  /** Only call LLM when india_eligibility is unclear (ignore seniority/role). */
  llmOnlyIfUnclear?: boolean;
  /** Reclassify even when job_tags.content_hash matches. */
  force?: boolean;
}

function mergeLlmIntoRules(
  rules: ClassificationResult,
  llm: ReturnType<typeof LlmClassificationSchema.parse>,
): ClassificationResult {
  const merged: ClassificationResult = { ...rules };

  if (rules.india_eligibility === "unclear") {
    const evidence = llm.eligibility_evidence.filter(
      (e) => !isNegativeEligibilitySentence(e),
    );
    merged.india_eligibility = llm.india_eligibility;
    merged.eligibility_evidence = evidence;
    if (
      (llm.india_eligibility === "open" ||
        llm.india_eligibility === "india_remote" ||
        llm.india_eligibility === "india_onsite" ||
        llm.india_eligibility === "region_locked") &&
      evidence.length === 0
    ) {
      merged.india_eligibility = "unclear";
      merged.remote_scope = "unknown";
    } else if (llm.remote_scope) {
      merged.remote_scope = llm.remote_scope;
    }
  }

  return merged;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call LLM until success, provider exhaustion, or non-retryable failure.
 * On daily 429: rotation marks provider exhausted and moves on.
 * If all providers exhausted: leave rules (unclear) - do not fail the job.
 */
async function callLlmWithRetry(
  provider: LlmProvider,
  input: Parameters<LlmProvider["classify"]>[0],
  rateLimiter: TokenBucket | null | undefined,
): Promise<{
  parsed: ReturnType<typeof LlmClassificationSchema.parse>;
  model: string;
} | null> {
  let attempt = 0;
  let validationFailures = 0;

  for (;;) {
    attempt += 1;
    try {
      if (rateLimiter) await rateLimiter.acquire();
      const raw = await provider.classify(input);
      const providerTag =
        raw &&
        typeof raw === "object" &&
        "__provider" in raw &&
        typeof (raw as { __provider?: unknown }).__provider === "string"
          ? (raw as { __provider: string }).__provider
          : `${provider.name}:${provider.model}`;
      if (raw && typeof raw === "object" && "__provider" in raw) {
        delete (raw as { __provider?: string }).__provider;
      }
      return {
        parsed: LlmClassificationSchema.parse(raw),
        model: providerTag,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[classify:llm] attempt ${attempt} failed:`,
        message.slice(0, 300),
      );

      if (/ALL_PROVIDERS_EXHAUSTED/i.test(message)) {
        console.warn(
          `[classify:llm] all free providers exhausted - keeping rules (unclear)`,
        );
        return null;
      }

      const is429 = /\b429\b|rate limit/i.test(message);
      if (is429) {
        const wait =
          retryAfterMsFromError(message) ??
          Math.min(60_000, 5_000 * Math.min(attempt, 6));
        console.warn(
          `[classify:llm] rate limited - waiting ${wait}ms (will not drop)`,
        );
        await sleep(wait);
        continue;
      }

      validationFailures += 1;
      if (validationFailures < 3) {
        await sleep(500);
        continue;
      }
      console.warn(
        `[classify:llm] giving up after ${validationFailures} non-rate-limit failures`,
      );
      return null;
    }
  }
}

function tagFromRow(
  job: Pick<Job, "contentHash">,
  row: typeof jobTags.$inferSelect,
): ClassifiedTag {
  return {
    india_eligibility: (row.indiaEligibility ??
      "unclear") as ClassifiedTag["india_eligibility"],
    eligibility_evidence: row.eligibilityEvidence ?? [],
    remote_scope: (row.remoteScope ??
      "unknown") as ClassifiedTag["remote_scope"],
    interview_style: (row.interviewStyle ?? [
      "unknown",
    ]) as ClassifiedTag["interview_style"],
    interview_style_evidence: row.interviewStyleEvidence ?? {},
    contractor_or_eor: row.contractorOrEor,
    contractor_or_eor_evidence: row.contractorOrEorEvidence,
    compensation:
      row.compensationMin != null || row.compensationMax != null
        ? {
            min: row.compensationMin,
            max: row.compensationMax,
            currency: row.compensationCurrency,
            period: (row.compensationPeriod ??
              "unknown") as NonNullable<
              ClassifiedTag["compensation"]
            >["period"],
          }
        : null,
    seniority: (row.seniority ?? "unknown") as ClassifiedTag["seniority"],
    role_family: (row.roleFamily ?? "other") as ClassifiedTag["role_family"],
    classifier: "cache",
    model: row.model,
    classifiedAt: row.classifiedAt ?? new Date(),
    contentHash: job.contentHash,
  };
}

export async function classifyJobContent(
  job: Pick<
    Job,
    "title" | "descriptionText" | "locationRaw" | "contentHash" | "compensationRaw"
  >,
  options: ClassifyOptions = {},
): Promise<ClassifiedTag> {
  const rules = classifyWithRules({
    title: job.title,
    descriptionText: job.descriptionText,
    locationRaw: job.locationRaw,
  });

  // Prefer structured ATS compensation (Ashby) over free-text regex.
  const fromAts = compensationFromAtsRaw(job.compensationRaw);
  let result = fromAts ? { ...rules, compensation: fromAts } : rules;
  let classifier: "rules" | "llm" | "cache" = "rules";
  let model: string | null = null;

  if (options.rulesOnly !== true) {
    const provider = options.llm ?? createLlmProvider();
    if (!provider) {
      console.log(`[classify] skip llm: no provider configured`);
    } else {
      const decision = options.llmOnlyIfUnclear
        ? !isTechRole(rules.role_family)
          ? { call: false, reason: "skip llm: role_family=non_tech" }
          : rules.india_eligibility === "unclear"
            ? { call: true, reason: "india_eligibility=unclear" }
            : {
                call: false,
                reason: `skip llm: india=${rules.india_eligibility}`,
              }
        : shouldCallLlm(rules, job.title, job.descriptionText);

      if (!decision.call) {
        console.log(`[classify] ${decision.reason}`);
      } else {
        console.log(`[classify] calling llm: ${decision.reason}`);
        const snippet = buildEligibilitySnippet({
          title: job.title,
          descriptionText: job.descriptionText,
          locationRaw: job.locationRaw,
        });
        const llmResult = await callLlmWithRetry(
          provider,
          {
            title: job.title,
            descriptionText: job.descriptionText,
            locationRaw: job.locationRaw,
            snippet,
            rulesHint: {
              india_eligibility: rules.india_eligibility,
            },
          },
          options.rateLimiter,
        );

        if (llmResult) {
          result = mergeLlmIntoRules(rules, llmResult.parsed);
          classifier = "llm";
          model = llmResult.model;
        } else {
          console.log(
            `[classify] skip llm merge: invalid/exhausted - keeping rules`,
          );
        }
      }
    }
  }

  const guarded = guardEvidence(
    job.descriptionText,
    job.title,
    job.locationRaw,
    result,
  );

  return {
    ...guarded.result,
    classifier,
    model,
    classifiedAt: new Date(),
    contentHash: job.contentHash,
  };
}

export async function persistClassification(
  db: Db,
  jobId: string,
  tag: ClassifiedTag,
): Promise<void> {
  const row = {
    jobId,
    indiaEligibility: tag.india_eligibility,
    eligibilityEvidence: tag.eligibility_evidence,
    remoteScope: tag.remote_scope,
    interviewStyle: tag.interview_style,
    interviewStyleEvidence: tag.interview_style_evidence,
    contractorOrEor: tag.contractor_or_eor,
    contractorOrEorEvidence: tag.contractor_or_eor_evidence,
    compensationMin: tag.compensation?.min ?? null,
    compensationMax: tag.compensation?.max ?? null,
    compensationCurrency: tag.compensation?.currency ?? null,
    compensationPeriod: tag.compensation?.period ?? null,
    seniority: tag.seniority,
    roleFamily: tag.role_family,
    classifier: tag.classifier === "cache" ? "rules" : tag.classifier,
    model: tag.model,
    classifiedAt: tag.classifiedAt,
    contentHash: tag.contentHash,
  };

  await db
    .insert(jobTags)
    .values(row)
    .onConflictDoUpdate({
      target: jobTags.jobId,
      set: {
        indiaEligibility: row.indiaEligibility,
        eligibilityEvidence: row.eligibilityEvidence,
        remoteScope: row.remoteScope,
        interviewStyle: row.interviewStyle,
        interviewStyleEvidence: row.interviewStyleEvidence,
        contractorOrEor: row.contractorOrEor,
        contractorOrEorEvidence: row.contractorOrEorEvidence,
        compensationMin: row.compensationMin,
        compensationMax: row.compensationMax,
        compensationCurrency: row.compensationCurrency,
        compensationPeriod: row.compensationPeriod,
        seniority: row.seniority,
        roleFamily: row.roleFamily,
        classifier: row.classifier,
        model: row.model,
        classifiedAt: row.classifiedAt,
        contentHash: row.contentHash,
      },
    });
}

export async function classifyAndStoreJob(
  db: Db,
  jobId: string,
  options: ClassifyOptions = {},
): Promise<ClassifiedTag> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  if (!options.force) {
    const [existing] = await db
      .select()
      .from(jobTags)
      .where(eq(jobTags.jobId, jobId))
      .limit(1);
    if (existing?.contentHash && existing.contentHash === job.contentHash) {
      console.log(`[classify] cache hit content_hash=${job.contentHash.slice(0, 8)}`);
      return tagFromRow(job, existing);
    }
  }

  const tag = await classifyJobContent(job, options);
  await persistClassification(db, jobId, tag);
  return tag;
}
