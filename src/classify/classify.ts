import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { jobTags, jobs, type Job } from "../db/schema.js";
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
}

function mergeLlmIntoRules(
  rules: ClassificationResult,
  llm: ReturnType<typeof LlmClassificationSchema.parse>,
): ClassificationResult {
  const merged: ClassificationResult = { ...rules };

  if (rules.india_eligibility === "unclear") {
    merged.india_eligibility = llm.india_eligibility;
    merged.eligibility_evidence = llm.eligibility_evidence;
    if (llm.remote_scope) merged.remote_scope = llm.remote_scope;
  }

  if (rules.seniority === "unknown" && llm.seniority !== "unknown") {
    merged.seniority = llm.seniority;
  }

  if (rules.role_family === "other" && llm.role_family !== "other") {
    merged.role_family = llm.role_family;
  }

  return merged;
}

async function callLlmWithRetry(
  provider: LlmProvider,
  input: Parameters<LlmProvider["classify"]>[0],
  rateLimiter: TokenBucket | null | undefined,
): Promise<ReturnType<typeof LlmClassificationSchema.parse> | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (rateLimiter) await rateLimiter.acquire();
      const raw = await provider.classify(input);
      return LlmClassificationSchema.parse(raw);
    } catch (err) {
      console.warn(
        `[classify:llm] attempt ${attempt + 1} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return null;
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

  const provider =
    options.rulesOnly === true
      ? null
      : (options.llm ?? createLlmProvider());

  if (
    provider &&
    shouldCallLlm(rules, job.title, job.descriptionText)
  ) {
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
