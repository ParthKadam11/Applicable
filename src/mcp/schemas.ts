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
    .describe(
      "Free-text search against title + description (title matches ranked higher)",
    ),
  eligibility: z
    .array(EligibilityFilterSchema)
    .min(1)
    .default(["open", "india_remote"])
    .describe(
      "India eligibility labels to include. Default: open + india_remote",
    ),
  role_keywords: z
    .union([
      z.string().min(1),
      z.array(z.string().min(1)).min(1).transform((a) => a.join(" ")),
    ])
    .optional()
    .describe(
      "Optional keywords matched against title + description (string or string[])",
    ),
  company: z
    .string()
    .min(1)
    .optional()
    .describe("Filter by company name (case-insensitive substring)"),
  location: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Filter by location_raw substring (e.g. Bangalore, India, Remote)",
    ),
  seniority: z
    .array(
      z.enum([
        "intern",
        "entry",
        "junior",
        "mid",
        "senior",
        "staff",
        "unknown",
      ]),
    )
    .min(1)
    .optional()
    .describe(
      "Filter by seniority. junior is an alias of entry. staff = staff+/principal.",
    ),
  early_career: z
    .boolean()
    .optional()
    .describe(
      "If true, only intern + entry (+ junior alias) + mid with ≤2 years experience. Overrides seniority when set.",
    ),
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
  max_per_company: z
    .number()
    .int()
    .min(0)
    .max(50)
    .default(3)
    .describe(
      "Max jobs per company on a page (default 3). Set 0 to disable diversity cap.",
    ),
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
    company_slug: z
      .string()
      .min(1)
      .max(200)
      .describe("Required company slug — only return jobs at this company"),
    labels: z
      .array(EligibilityFilterSchema)
      .min(1)
      .default(["open", "india_remote"]),
    max_results: z.number().int().min(1).max(25).default(10),
  }),
]);

export const ExploreHopSchema = z.enum([
  "SIMILAR_TO",
  "POSTS",
  "REQUIRES",
  "USES_SKILL",
  "LABELED",
  "SAVED",
  "INVESTED_IN",
  "FOUNDED",
  "HQ_IN",
  "IN_BATCH",
]);

export const ExploreInputSchema = z.object({
  start: z.object({
    type: z.enum([
      "skill",
      "company",
      "job",
      "me",
      "investor",
      "person",
      "batch",
    ]),
    value: z.string().min(1).max(200).optional(),
  }),
  path: z.array(ExploreHopSchema).max(3).default([]),
  filter: z
    .object({
      labels: z
        .array(EligibilityFilterSchema)
        .min(1)
        .default(["open", "india_remote"])
        .optional(),
      skills: z.array(z.string().min(1).max(64)).max(20).optional(),
      seniority: z
        .array(z.enum(["intern", "entry", "mid", "senior", "staff", "unknown"]))
        .min(1)
        .optional(),
      early_career: z.boolean().optional(),
    })
    .optional(),
  max_results: z.number().int().min(1).max(25).default(10),
  max_tokens: z.number().int().min(100).max(4000).default(1500),
});

export const SkillGapInputSchema = z.object({
  my_skills: z.array(z.string().min(1).max(64)).max(40).optional(),
  me: z.boolean().optional(),
  labels: z
    .array(EligibilityFilterSchema)
    .min(1)
    .default(["open", "india_remote"])
    .optional(),
  max_skills: z.number().int().min(1).max(10).default(5).optional(),
});

export const ListCompaniesInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .optional()
    .describe("Filter by company name (case-insensitive substring)"),
  ats: z
    .enum(["ashby", "greenhouse", "lever", "smartrecruiters"])
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

export const GetCompanyInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .optional()
    .describe("Company public slug"),
  name: z
    .string()
    .min(1)
    .optional()
    .describe("Company name substring (used if slug omitted)"),
  id: z.string().uuid().optional().describe("Company UUID"),
});

export const FindCompaniesInputSchema = z.object({
  investor: z
    .string()
    .min(1)
    .optional()
    .describe("Investor name substring (e.. Peak XV, Accel)"),
  founder: z.string().min(1).optional().describe("Founder name substring"),
  batch: z
    .string()
    .min(1)
    .optional()
    .describe("YC batch e.g. Winter 2024 / W24"),
  industry: z.string().min(1).optional().describe("Industry / tag substring"),
  hq_country: z
    .string()
    .min(1)
    .optional()
    .describe("HQ country substring"),
  team_size_min: z.number().int().min(0).optional(),
  team_size_max: z.number().int().min(0).optional(),
  has_india_jobs: z
    .boolean()
    .optional()
    .describe("Only companies with open or india_remote jobs"),
  limit: z.number().int().min(1).max(50).default(20).optional(),
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

export const ReportLabelInputSchema = z.object({
  job_id: z.string().uuid().describe("Job UUID whose label is wrong"),
  label: EligibilityFilterSchema.describe("Correct India eligibility label"),
  evidence: z
    .string()
    .min(3)
    .max(500)
    .describe(
      "Exact substring from the posting that proves the corrected label",
    ),
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
  seniority: z
    .array(z.enum(["intern", "entry", "mid", "senior", "staff", "unknown"]))
    .min(1)
    .optional(),
  early_career: z.boolean().optional(),
  posted_within_days: z.number().int().positive().max(365).optional(),
  limit: z.number().int().min(1).max(50).default(25),
});

export type AiSearchFilter = z.infer<typeof AiSearchFilterSchema>;
