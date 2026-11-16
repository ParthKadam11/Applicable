import { z } from "zod";

export const AtsSchema = z.enum([
  "ashby",
  "greenhouse",
  "lever",
  "smartrecruiters",
  "workable",
]);

export type Ats = z.infer<typeof AtsSchema>;

export const NormalizedJobSchema = z.object({
  externalId: z.string().min(1),
  companyId: z.string().uuid(),
  title: z.string().min(1),
  department: z.string().nullable(),
  locationRaw: z.string().nullable(),
  isRemoteFlag: z.boolean().nullable(),
  employmentType: z.string().nullable(),
  descriptionText: z.string(),
  applyUrl: z.string().url(),
  compensationRaw: z.unknown().nullable(),
  postedAt: z.date().nullable(),
  sourceAts: AtsSchema,
});

export type NormalizedJob = z.infer<typeof NormalizedJobSchema>;

export interface AtsAdapter {
  readonly name: Ats;
  fetchJobs(slug: string, companyId: string): Promise<NormalizedJob[]>;
}
