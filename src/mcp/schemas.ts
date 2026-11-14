import { z } from "zod";

export const EligibilityFilterSchema = z.enum([
  "open",
  "india_remote",
  "india_onsite",
  "region_locked",
  "unclear",
]);

export type EligibilityFilter = z.infer<typeof EligibilityFilterSchema>;

export const SearchJobsInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Free-text search against job title (case-insensitive)"),
  eligibility: z
    .array(EligibilityFilterSchema)
    .min(1)
    .default(["open", "india_remote"])
    .describe(
      "India eligibility labels to include. Default: open + india_remote",
    ),
  role_keywords: z
    .string()
    .min(1)
    .optional()
    .describe("Optional keywords matched against title (e.g. backend, SRE)"),
  company: z
    .string()
    .min(1)
    .optional()
    .describe("Filter by company name (case-insensitive substring)"),
  posted_within_days: z
    .number()
    .int()
    .positive()
    .max(365)
    .optional()
    .describe("Only jobs posted within this many days"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe("Max results (1–50, default 20)"),
  cursor: z
    .string()
    .optional()
    .describe("Opaque pagination cursor from a previous search_jobs response"),
});

export const GetJobInputSchema = z.object({
  id: z.string().uuid().describe("Job UUID"),
});

export const AskJobsInputSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("match_skills"),
    skills: z
      .array(z.string().min(1).max(64))
      .min(1)
      .max(20)
      .describe("Skills to match (aliases normalized)"),
    labels: z
      .array(EligibilityFilterSchema)
      .min(1)
      .default(["open", "india_remote"]),
    max_results: z.number().int().min(1).max(25).default(10),
  }),
  z.object({
    op: z.literal("similar_companies"),
    company_slug: z.string().min(1).max(200),
    max_results: z.number().int().min(1).max(25).default(10),
  }),
  z.object({
    op: z.literal("company_jobs_by_skill"),
    skill: z.string().min(1).max(64),
    labels: z
      .array(EligibilityFilterSchema)
      .min(1)
      .default(["open", "india_remote"]),
    max_results: z.number().int().min(1).max(25).default(10),
  }),
]);

export const ListCompaniesInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Filter by company name (case-insensitive substring)"),
  ats: z
    .enum(["ashby", "greenhouse", "lever"])
    .optional()
    .describe("Filter by ATS provider"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .describe("Max companies to return (default 25)"),
});

export const StatsInputObjectSchema = z.object({
  history: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe(
      "If set, include up to this many days of daily_stats history (most recent first)",
    ),
});

export const StatsInputSchema = StatsInputObjectSchema.default({});

export const SubmitCompanyInputSchema = z.object({
  name: z.string().min(1).max(200).describe("Company display name"),
  careers_url: z
    .string()
    .url()
    .describe("Public careers or ATS board URL (http/https)"),
});

export const SaveJobInputSchema = z.object({
  job_id: z.string().uuid().describe("Job UUID to save"),
});

export const UnsaveJobInputSchema = z.object({
  job_id: z.string().uuid().describe("Job UUID to remove from saved"),
});

export const MySavedJobsInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(50)
    .describe("Max saved jobs to return (default 50)"),
});

/** Client-side AI search: LLM must emit this shape (no cursor). */
export const AiSearchFilterSchema = z.object({
  query: z.string().min(1).optional(),
  eligibility: z
    .array(EligibilityFilterSchema)
    .min(1)
    .default(["open", "india_remote"]),
  role_keywords: z.string().min(1).optional(),
  company: z.string().min(1).optional(),
  posted_within_days: z.number().int().positive().max(365).optional(),
  limit: z.number().int().min(1).max(50).default(25),
});

export type AiSearchFilter = z.infer<typeof AiSearchFilterSchema>;
