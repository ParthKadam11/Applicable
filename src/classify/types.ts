import { z } from "zod";

export const IndiaEligibilitySchema = z.enum([
  "open",
  "india_remote",
  "india_onsite",
  "region_locked",
  "unclear",
]);
export type IndiaEligibility = z.infer<typeof IndiaEligibilitySchema>;

export const RemoteScopeSchema = z.enum([
  "worldwide",
  "region",
  "country",
  "onsite",
  "hybrid",
  "unknown",
]);
export type RemoteScope = z.infer<typeof RemoteScopeSchema>;

export const InterviewStyleSchema = z.enum([
  "take_home",
  "live_coding",
  "dsa",
  "system_design",
  "pair_programming",
  "unknown",
]);
export type InterviewStyle = z.infer<typeof InterviewStyleSchema>;

export const SenioritySchema = z.enum([
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "unknown",
]);
export type Seniority = z.infer<typeof SenioritySchema>;

export const RoleFamilySchema = z.enum([
  "backend",
  "fullstack",
  "frontend",
  "infra",
  "ml",
  "other",
]);
export type RoleFamily = z.infer<typeof RoleFamilySchema>;

export const CompensationPeriodSchema = z.enum([
  "year",
  "month",
  "hour",
  "unknown",
]);

export const ClassificationResultSchema = z.object({
  india_eligibility: IndiaEligibilitySchema,
  eligibility_evidence: z.array(z.string()),
  remote_scope: RemoteScopeSchema,
  interview_style: z.array(InterviewStyleSchema),
  interview_style_evidence: z.record(z.string(), z.array(z.string())),
  contractor_or_eor: z.boolean().nullable(),
  contractor_or_eor_evidence: z.string().nullable(),
  compensation: z
    .object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      currency: z.string().nullable(),
      period: CompensationPeriodSchema.nullable(),
    })
    .nullable(),
  seniority: SenioritySchema,
  role_family: RoleFamilySchema,
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

/** Short schema the LLM fills when rules leave india unclear. */
export const LlmClassificationSchema = z.object({
  india_eligibility: IndiaEligibilitySchema,
  eligibility_evidence: z.array(z.string()).max(4),
  remote_scope: RemoteScopeSchema.optional(),
});

export type LlmClassification = z.infer<typeof LlmClassificationSchema>;

export type ClassifiedTag = ClassificationResult & {
  classifier: "rules" | "llm" | "cache";
  model: string | null;
  classifiedAt: Date;
  contentHash: string;
};
