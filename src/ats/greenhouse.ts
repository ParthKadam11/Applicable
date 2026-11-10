import { fetchJson } from "../utils/http.js";
import { stripHtml } from "../utils/html.js";
import type { AtsAdapter, NormalizedJob } from "./types.js";

interface GreenhouseLocation {
  name?: string;
}

interface GreenhouseDepartment {
  name?: string;
}

interface GreenhouseOffice {
  name?: string;
  location?: string;
}

interface GreenhouseJob {
  id: number | string;
  title: string;
  updated_at?: string;
  absolute_url?: string;
  location?: GreenhouseLocation;
  departments?: GreenhouseDepartment[];
  offices?: GreenhouseOffice[];
  content?: string;
  metadata?: Array<{ name?: string; value?: string | null }>;
}

interface GreenhouseBoardResponse {
  jobs?: GreenhouseJob[];
}

function isRemoteHint(job: GreenhouseJob): boolean | null {
  const location = job.location?.name?.toLowerCase() ?? "";
  if (location.includes("remote")) return true;

  const offices = (job.offices ?? [])
    .map((o) => `${o.name ?? ""} ${o.location ?? ""}`.toLowerCase())
    .join(" ");
  if (offices.includes("remote")) return true;

  return null;
}

export function normalizeGreenhouseJob(
  job: GreenhouseJob,
  companyId: string,
): NormalizedJob {
  const department =
    job.departments?.map((d) => d.name).filter(Boolean).join(", ") || null;

  return {
    externalId: String(job.id),
    companyId,
    title: job.title,
    department,
    locationRaw: job.location?.name ?? null,
    isRemoteFlag: isRemoteHint(job),
    employmentType: null,
    descriptionText: stripHtml(job.content),
    applyUrl:
      job.absolute_url ??
      `https://boards.greenhouse.io/embed/job_app?token=${job.id}`,
    compensationRaw: null,
    postedAt: job.updated_at ? new Date(job.updated_at) : null,
    sourceAts: "greenhouse",
  };
}

export class GreenhouseAdapter implements AtsAdapter {
  readonly name = "greenhouse" as const;

  async fetchJobs(slug: string, companyId: string): Promise<NormalizedJob[]> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`;
    const data = await fetchJson<GreenhouseBoardResponse>(url);
    const jobs = data?.jobs ?? [];
    return jobs.map((job) => normalizeGreenhouseJob(job, companyId));
  }
}

export const greenhouseAdapter = new GreenhouseAdapter();
