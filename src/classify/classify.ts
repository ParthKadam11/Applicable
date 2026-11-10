import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { jobTags, jobs, type Job } from "../db/schema.js";
import { isNegativeEligibilitySentence } from "./eligibility.js";
import { guardEvidence } from "./guard.js";
import { createLlmProvider, type LlmProvider } from "./llm/index.js";
import { TokenBucket } from "./rate-limit.js";
import { classifyWithRules, shouldCallLlm } from "./rules.js";
import {
  LlmClassificationSchema,
  type ClassificationResult,
  type ClassifiedTag,
} from "./types.js";

export interface ClassifyOptions {
  llm?: LlmProvider | null;
  rateLimiter?: TokenBucket | null;
  /** Skip LLM even if rules are inconclusive (tests / offline). */
  rulesOnly?: boolean;
  /** Only call LLM when india_eligibility is unclear (ignore seniority/role). */
  llmOnlyIfUnclear?: boolean;
}

function mergeLlmIntoRules(
  rules: ClassificationResult,
  llm: ReturnType<typeof LlmClassificationSchema.parse>,
): ClassificationResult {
  const merged: ClassificationResult = { ...rules };

  if (rules.india_eligibility === "unclear") {
    // Drop LLM evidence that fails apply-context / negative filters.
    const evidence = llm.eligibility_evidence.filter(
      (e) => !isNegativeEligibilitySentence(e),
    );
    merged.india_eligibility = llm.india_eligibility;
    merged.eligibility_evidence = evidence;
    if (
      (llm.india_eligibility === "open" ||
        llm.india_eligibility === "region_locked") &&
      evidence.length === 0
    ) {
      merged.india_eligibility = "unclear";
      merged.remote_scope = "unknown";
    } else if (llm.remote_scope) {
      merged.remote_scope = llm.remote_scope;
    }
  }

  if (rules.seniority === "unknown" && llm.seniority !== "unknown") {
    merged.seniority = llm.seniority;
  }

  if (rules.role_family === "other" && llm.role_family !== "other") {
    merged.role_family = llm.role_family;
  }

  return merged;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse Groq/Gemini retry hints: "6m53.424s", "16m7.68s", "7.2s", "500ms". */
export function retryAfterMsFromError(message: string): number | null {
  const compound = message.match(
    /try again in\s+(?:(\d+(?:\.\d+)?)h)?\s*(?:(\d+(?:\.\d+)?)m)?\s*(?:(\d+(?:\.\d+)?)s)?/i,
  );
  if (compound && (compound[1] || compound[2] || compound[3])) {
    const hours = Number(compound[1] ?? 0);
    const mins = Number(compound[2] ?? 0);
    const secs = Number(compound[3] ?? 0);
    const total = Math.ceil((hours * 3600 + mins * 60 + secs) * 1000) + 250;
    if (total > 250) return total;
  }
  const msOnly = message.match(/try again in\s+(\d+(?:\.\d+)?)\s*ms/i);
  if (msOnly?.[1]) return Math.ceil(Number(msOnly[1])) + 250;
  return null;
}

/**
 * Call LLM until success or non-retryable failure.
 * On 429: wait (honor RPM / TPM) — never drop the job for rate limits.
 */
async function callLlmWithRetry(
  provider: LlmProvider,
  input: Parameters<LlmProvider["classify"]>[0],
  rateLimiter: TokenBucket | null | undefined,
): Promise<ReturnType<typeof LlmClassificationSchema.parse> | null> {
  let attempt = 0;
  let validationFailures = 0;

  for (;;) {
    attempt += 1;
    try {
      if (rateLimiter) await rateLimiter.acquire();
      const raw = await provider.classify(input);
      return LlmClassificationSchema.parse(raw);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[classify:llm] attempt ${attempt} failed:`, message.slice(0, 300));

      const is429 = /\b429\b|rate limit/i.test(message);
      if (is429) {
        const wait = retryAfterMsFromError(message) ?? Math.min(60_000, 5_000 * Math.min(attempt, 6));
        console.warn(`[classify:llm] rate limited — waiting ${wait}ms (will not drop)`);
        await sleep(wait);
        continue;
      }

      // Invalid JSON / schema: retry a couple times then keep rules.
      validationFailures += 1;
      if (validationFailures < 3) {
        await sleep(500);
        continue;
      }
      console.warn(`[classify:llm] giving up after ${validationFailures} non-rate-limit failures`);
      return null;
    }
  }
}

export async function classifyJobContent(
  job: Pick<Job, "title" | "descriptionText" | "locationRaw" | "contentHash">,
  options: ClassifyOptions = {},
): Promise<ClassifiedTag> {
  const rules = classifyWithRules({
    title: job.title,
    descriptionText: job.descriptionText,
    locationRaw: job.locationRaw,
  });

  let result = rules;
  let classifier: "rules" | "llm" = "rules";
  let model: string | null = null;

  if (options.rulesOnly !== true) {
    const provider = options.llm ?? createLlmProvider();
    if (!provider) {
      console.log(`[classify] skip llm: no provider configured`);
    } else {
      const decision = options.llmOnlyIfUnclear
        ? rules.india_eligibility === "unclear"
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
        const llmParsed = await callLlmWithRetry(
          provider,
          {
            title: job.title,
            descriptionText: job.descriptionText,
            locationRaw: job.locationRaw,
            rulesHint: {
              india_eligibility: rules.india_eligibility,
              seniority: rules.seniority,
              role_family: rules.role_family,
            },
          },
          options.rateLimiter,
        );

        if (llmParsed) {
          result = mergeLlmIntoRules(rules, llmParsed);
          classifier = "llm";
          model = `${provider.name}:${provider.model}`;
        } else {
          console.log(
            `[classify] skip llm merge: invalid output after retries — keeping rules`,
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
    classifier: tag.classifier,
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

  const tag = await classifyJobContent(job, options);
  await persistClassification(db, jobId, tag);
  return tag;
}
