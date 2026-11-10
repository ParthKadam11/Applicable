import { fetchJson } from "../utils/http.js";
import { stripHtml } from "../utils/html.js";
import type { AtsAdapter, NormalizedJob } from "./types.js";

interface LeverCategories {
  commitment?: string | null;
  department?: string | null;
  location?: string | null;
  team?: string | null;
  allLocations?: string[];
}

interface LeverJob {
  id: string;
  text: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  description?: string;
  descriptionPlain?: string;
  additional?: string;
  additionalPlain?: string;
  categories?: LeverCategories;
  workplaceType?: string;
}

function isRemoteFromLever(job: LeverJob): boolean | null {
  const workplace = job.workplaceType?.toLowerCase();
  if (workplace === "remote") return true;
  if (workplace === "hybrid" || workplace === "onsite") return false;

  const location = job.categories?.location?.toLowerCase() ?? "";
  if (location.includes("remote")) return true;
  return null;
}

export function normalizeLeverJob(
  job: LeverJob,
  companyId: string,
): NormalizedJob {
  const descriptionHtml = [job.description, job.additional]
    .filter(Boolean)
    .join("\n");
  const descriptionPlain = [job.descriptionPlain, job.additionalPlain]
    .filter(Boolean)
    .join("\n")
    .trim();

  const locations = [
    job.categories?.location,
    ...(job.categories?.allLocations ?? []),
  ].filter(Boolean);

  return {
    externalId: String(job.id),
    companyId,
    title: job.text,
    department: job.categories?.department ?? job.categories?.team ?? null,
    locationRaw: locations.length ? [...new Set(locations)].join("; ") : null,
    isRemoteFlag: isRemoteFromLever(job),
    employmentType: job.categories?.commitment ?? null,
    descriptionText: descriptionPlain || stripHtml(descriptionHtml),
    applyUrl: job.hostedUrl ?? job.applyUrl ?? `https://jobs.lever.co/${job.id}`,
    compensationRaw: null,
    postedAt:
      typeof job.createdAt === "number" ? new Date(job.createdAt) : null,
    sourceAts: "lever",
  };
}

export class LeverAdapter implements AtsAdapter {
  readonly name = "lever" as const;

  async fetchJobs(slug: string, companyId: string): Promise<NormalizedJob[]> {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
    const data = await fetchJson<LeverJob[]>(url);
    const jobs = Array.isArray(data) ? data : [];
    return jobs.map((job) => normalizeLeverJob(job, companyId));
  }
}

export const leverAdapter = new LeverAdapter();
