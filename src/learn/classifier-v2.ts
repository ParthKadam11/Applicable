import { eq } from "drizzle-orm";
import { classifyIndiaEligibility } from "../classify/eligibility.js";
import type { IndiaEligibility } from "../classify/types.js";
import type { Db } from "../db/client.js";
import { jobs } from "../db/schema.js";
import {
  isEligibilityEvidence,
  isEvidenceSubstring,
  isFundingOrInvestorEvidence,
  sanitizePostingForPatterns,
  validateEligibilityEvidence,
} from "./evidence-guard.js";
import { companyLabelPrior } from "./corrections.js";
import {
  companyLabelPriorFromGraph,
  fetchSimilarCorrectionsFromGraph,
} from "./graph-learn.js";
import { loadPatterns, matchPatterns, type PatternHit } from "./patterns.js";

export type ClassifyV2Input = {
  title: string;
  descriptionText: string;
  locationRaw?: string | null;
  jobId?: string;
  companyId?: string;
};

export type ClassifyV2Result = {
  india_eligibility: IndiaEligibility;
  eligibility_evidence: string[];
  remote_scope: string;
  source: "rules" | "pattern" | "company_prior" | "llm" | "fallback";
  pattern?: PatternHit | null;
};

export type ClassifyV2Options = {
  db?: Db;
  patterns?: PatternHit[];
  useCompanyPrior?: boolean;
  useLlm?: boolean;
  llmTimeoutMs?: number;
};

function evidenceOk(evidence: string[], input: ClassifyV2Input): string[] {
  return evidence.filter((e) => {
    const v = validateEligibilityEvidence({
      evidence: e,
      title: input.title,
      locationRaw: input.locationRaw,
      descriptionText: input.descriptionText,
    });
    return v.ok;
  });
}

/**
 * Classifier v2: rules → learned patterns → soft company prior → optional LLM.
 * Always falls back to rules; never throws.
 */
export async function classifyV2(
  input: ClassifyV2Input,
  opts: ClassifyV2Options = {},
): Promise<ClassifyV2Result> {
  try {
    const rules = classifyIndiaEligibility({
      descriptionText: input.descriptionText,
      locationRaw: input.locationRaw,
      title: input.title,
    });
    const rulesEvidence = evidenceOk(rules.eligibility_evidence, input);

    // --- learned patterns (fill gaps + override when weight ≥ 2) ---
    let patterns = opts.patterns;
    if (!patterns && opts.db) {
      try {
        patterns = await loadPatterns(opts.db);
      } catch {
        patterns = [];
      }
    }
    patterns = patterns ?? [];

    const posting = [
      input.title,
      input.locationRaw ? `Location: ${input.locationRaw}` : "",
      sanitizePostingForPatterns(input.descriptionText),
    ]
      .filter(Boolean)
      .join("\n");

    const hit = matchPatterns(posting, patterns);
    if (hit) {
      const phrase = hit.phrase;
      const inPosting =
        isEvidenceSubstring(
          phrase,
          input.title,
          input.locationRaw,
          input.descriptionText,
        ) || posting.toLowerCase().includes(phrase.toLowerCase());
      const usable =
        inPosting &&
        !isFundingOrInvestorEvidence(phrase) &&
        (isEligibilityEvidence(phrase) || phrase.length >= 8);
      if (usable) {
        const overridesRules =
          hit.weight >= 2 && hit.label !== rules.india_eligibility;
        const fillsUnclear =
          rules.india_eligibility === "unclear" ||
          rulesEvidence.length === 0;
        if (overridesRules || fillsUnclear) {
          return {
            india_eligibility: hit.label,
            eligibility_evidence: [phrase],
            remote_scope: rules.remote_scope,
            source: "pattern",
            pattern: hit,
          };
        }
      }
    }

    if (rules.india_eligibility !== "unclear" && rulesEvidence.length > 0) {
      return {
        india_eligibility: rules.india_eligibility,
        eligibility_evidence: rulesEvidence,
        remote_scope: rules.remote_scope,
        source: "rules",
      };
    }

    // --- soft company prior (never sole evidence without remote+India hint) ---
    if (opts.useCompanyPrior !== false && opts.db && input.companyId) {
      try {
        let prior =
          (await companyLabelPrior(opts.db, input.companyId, input.jobId)) ??
          null;
        if (!prior) {
          const g = await companyLabelPriorFromGraph(input.companyId);
          if (g) prior = { label: g.label as IndiaEligibility, n: g.n };
        }
        if (
          prior &&
          (prior.label === "india_remote" || prior.label === "open") &&
          /\bremote\b/i.test(`${input.locationRaw ?? ""} ${input.title}`) &&
          /\bIndia\b/i.test(posting)
        ) {
          const hint =
            input.locationRaw?.trim() ||
            "Remote role at company with verified India-eligible jobs";
          return {
            india_eligibility: prior.label,
            eligibility_evidence: [hint.slice(0, 200)],
            remote_scope: rules.remote_scope,
            source: "company_prior",
          };
        }
      } catch {
        // ignore
      }
    }

    if (opts.useLlm) {
      try {
        const fewShot = await fetchSimilarCorrectionsFromGraph(
          patterns.slice(0, 5).map((p) => p.phrase),
          3,
        );
        const llm = await classifyUnclearWithLlm(
          input,
          fewShot,
          opts.llmTimeoutMs,
        );
        if (llm) return llm;
      } catch {
        // fall through
      }
    }

    return {
      india_eligibility: rules.india_eligibility,
      eligibility_evidence:
        rulesEvidence.length > 0 ? rulesEvidence : rules.eligibility_evidence,
      remote_scope: rules.remote_scope,
      source: "rules",
    };
  } catch {
    return {
      india_eligibility: "unclear",
      eligibility_evidence: [],
      remote_scope: "unknown",
      source: "fallback",
    };
  }
}

async function classifyUnclearWithLlm(
  input: ClassifyV2Input,
  fewShot: Array<{ evidence: string; new_label: string; phrase: string }>,
  timeoutMs = 12_000,
): Promise<ClassifyV2Result | null> {
  const { createLlmProvider } = await import("../classify/llm/index.js");
  const provider = createLlmProvider();
  if (!provider) return null;

  const shotBlock =
    fewShot.length > 0
      ? `\n\nPast verified corrections (few-shot):\n${fewShot
          .map((f) => `- label=${f.new_label} evidence="${f.evidence}"`)
          .join("\n")}\n`
      : "";

  try {
    const result = await Promise.race([
      provider.classify({
        title: input.title,
        descriptionText: input.descriptionText.slice(0, 6000) + shotBlock,
        locationRaw: input.locationRaw ?? null,
        rulesHint: { india_eligibility: "unclear" },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!result || typeof result !== "object") return null;
    const r = result as {
      india_eligibility?: IndiaEligibility;
      eligibility_evidence?: string[];
      remote_scope?: string;
    };
    if (!r.india_eligibility) return null;
    const ev = evidenceOk(r.eligibility_evidence ?? [], input);
    if (r.india_eligibility !== "unclear" && ev.length === 0) return null;
    return {
      india_eligibility: r.india_eligibility,
      eligibility_evidence: ev,
      remote_scope: r.remote_scope ?? "unknown",
      source: "llm",
    };
  } catch {
    return null;
  }
}

export async function classifyJobV2(
  db: Db,
  jobId: string,
  opts: Omit<ClassifyV2Options, "db"> = {},
): Promise<ClassifyV2Result & { job_id: string }> {
  const [row] = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      locationRaw: jobs.locationRaw,
      descriptionText: jobs.descriptionText,
      companyId: jobs.companyId,
    })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!row) {
    return {
      job_id: jobId,
      india_eligibility: "unclear",
      eligibility_evidence: [],
      remote_scope: "unknown",
      source: "fallback",
    };
  }
  const result = await classifyV2(
    {
      title: row.title,
      descriptionText: row.descriptionText,
      locationRaw: row.locationRaw,
      jobId: row.id,
      companyId: row.companyId,
    },
    { ...opts, db },
  );
  return { ...result, job_id: jobId };
}
