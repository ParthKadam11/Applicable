import { z } from "zod";
import { IndiaEligibilitySchema } from "../classify/types.js";

export const CorrectionSourceSchema = z.enum([
  "manual",
  "llm_crosscheck",
  "mcp",
  "label_report",
  "seed",
]);
export type CorrectionSource = z.infer<typeof CorrectionSourceSchema>;

export const GoldRowSchema = z.object({
  job_id: z.string().uuid(),
  title: z.string(),
  company: z.string(),
  location_raw: z.string().nullable(),
  description_snippet: z.string(),
  /** Full description used at eval time (may be truncated in export for review). */
  description_text: z.string().optional(),
  verified_label: IndiaEligibilitySchema,
  evidence: z.string(),
  verified: z.boolean().default(true),
  /** Prod tag at freeze time (not used as truth). */
  prod_label: IndiaEligibilitySchema.optional(),
});
export type GoldRow = z.infer<typeof GoldRowSchema>;

export type EvalPrediction = {
  job_id: string;
  gold_label: string;
  pred_label: string;
  evidence: string[];
  evidence_valid: boolean;
  evidence_about_eligibility: boolean;
  source: "rules" | "pattern" | "company_prior" | "llm" | "fallback";
};

export type LabelMetrics = {
  precision: number;
  recall: number;
  f1: number;
  support: number;
};

export type EvalReport = {
  kind: "baseline" | "learned";
  timestamp: string;
  n: number;
  accuracy: number;
  unclear_rate: number;
  evidence_validity_rate: number;
  bad_evidence_rate: number;
  per_label: Record<string, LabelMetrics>;
  confusion: Record<string, Record<string, number>>;
  predictions: EvalPrediction[];
};
