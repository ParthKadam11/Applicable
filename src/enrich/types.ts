export const FACT_TYPES = [
  "hq",
  "founded_year",
  "team_size",
  "founder",
  "investor",
  "batch",
  "industry",
  "tag",
  "one_liner",
  "remote_policy",
] as const;

export type FactType = (typeof FACT_TYPES)[number];

export type SourceKind =
  | "ats_jd"
  | "website"
  | "yc_oss"
  | "yc_page"
  | "job_board";

export type ExtractedFact = {
  factType: FactType;
  value: string;
  sourceUrl: string;
  quote: string;
  sourceKind: SourceKind;
  confidence: number;
  /** Optional extras */
  title?: string;
  round?: string;
  role?: "founded" | "works_at";
  city?: string;
  country?: string;
  linkedin?: string;
};

export type EnrichCompanyResult = {
  companyId: string;
  slug: string | null;
  status: "enriched" | "skipped" | "failed";
  reason?: string;
  factsWritten: number;
  sources: SourceKind[];
};
