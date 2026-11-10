import { fetchJson } from "../utils/http.js";
import { stripHtml } from "../utils/html.js";
import type { AtsAdapter, NormalizedJob } from "./types.js";

interface AshbyJob {
  id: string;
  title: string;
  department?: string;
  team?: string;
  location?: string;
  locationName?: string;
  isRemote?: boolean;
  employmentType?: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  jobUrl?: string;
  applyUrl?: string;
  publishedAt?: string;
  compensation?: unknown;
}

interface AshbyBoardResponse {
  jobs?: AshbyJob[];
}

function locationFrom(job: AshbyJob): string | null {
  return job.locationName ?? job.location ?? null;
}

function applyUrlFrom(job: AshbyJob, slug: string): string {
  if (job.applyUrl) return job.applyUrl;
  if (job.jobUrl) return job.jobUrl;
  return `https://jobs.ashbyhq.com/${slug}/${job.id}`;
}

export function normalizeAshbyJob(
  job: AshbyJob,
  slug: string,
  companyId: string,
): NormalizedJob {
  const descriptionText =
    job.descriptionPlain?.trim() || stripHtml(job.descriptionHtml);

  return {
    externalId: String(job.id),
    companyId,
    title: job.title,
    department: job.department ?? job.team ?? null,
    locationRaw: locationFrom(job),
    isRemoteFlag: typeof job.isRemote === "boolean" ? job.isRemote : null,
    employmentType: job.employmentType ?? null,
    descriptionText,
    applyUrl: applyUrlFrom(job, slug),
    compensationRaw: job.compensation ?? null,
    postedAt: job.publishedAt ? new Date(job.publishedAt) : null,
    sourceAts: "ashby",
  };
}

export class AshbyAdapter implements AtsAdapter {
  readonly name = "ashby" as const;

  async fetchJobs(slug: string, companyId: string): Promise<NormalizedJob[]> {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`;
    const data = await fetchJson<AshbyBoardResponse>(url);
    const jobs = data?.jobs ?? [];
    return jobs.map((job) => normalizeAshbyJob(job, slug, companyId));
  }
}

export const ashbyAdapter = new AshbyAdapter();
