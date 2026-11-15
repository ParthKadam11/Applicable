import { fetchJson } from "../../utils/http.js";
import { domainFromUrl, extractAtsUrls } from "../ats-urls.js";
import {
  isEarlyCareerText,
  isPriorityGeoText,
  sortByDiscoveryPriority,
} from "../early-career-signal.js";
import type { DiscoveredCompany } from "../types.js";

interface JobicyJob {
  id?: number | string;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  companyLogo?: string;
  jobIndustry?: string[] | string;
  jobType?: string[] | string;
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
}

interface JobicyResponse {
  jobs?: JobicyJob[];
  success?: boolean;
}

type Scored = DiscoveredCompany & {
  earlyCareer?: boolean;
  priorityGeo?: boolean;
};

function asText(v: string | string[] | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? v.join(" ") : v;
}

export function parseJobicyJobs(jobs: JobicyJob[]): DiscoveredCompany[] {
  const byKey = new Map<string, Scored>();

  for (const job of jobs) {
    const name = job.companyName?.trim();
    if (!name) continue;

    const blob = [
      job.url,
      job.jobDescription,
      job.jobExcerpt,
      job.jobTitle,
    ]
      .filter(Boolean)
      .join("\n");
    const atsHits = extractAtsUrls(blob);
    const primary = atsHits[0];
    const earlyCareer = isEarlyCareerText(
      job.jobTitle,
      job.jobLevel,
      asText(job.jobType),
      job.jobExcerpt,
      job.jobDescription,
    );
    const priorityGeo = isPriorityGeoText(job.jobGeo, job.jobDescription);

    const key = primary
      ? `${primary.ats}:${primary.atsSlug}`.toLowerCase()
      : name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.earlyCareer = existing.earlyCareer || earlyCareer;
      existing.priorityGeo = existing.priorityGeo || priorityGeo;
      continue;
    }

    byKey.set(key, {
      name,
      domain: domainFromUrl(job.url),
      source: "jobicy",
      evidenceUrl: primary?.url ?? job.url ?? null,
      ats: primary?.ats ?? null,
      atsSlug: primary?.atsSlug ?? null,
      earlyCareer,
      priorityGeo,
    });
  }

  return sortByDiscoveryPriority([...byKey.values()]);
}

/** Jobicy public API — last 7 days, poll sparingly (≤1/hr). */
export async function discoverJobicy(): Promise<DiscoveredCompany[]> {
  // Prefer v2; fall back to legacy path shape if needed.
  let jobs: JobicyJob[] = [];
  try {
    const data = await fetchJson<JobicyResponse>(
      "https://jobicy.com/api/v2/remote-jobs?count=100&industry=supporting-or-other&tag=software",
    );
    jobs = data.jobs ?? [];
  } catch {
    const data = await fetchJson<JobicyResponse>(
      "https://jobicy.com/api/jobs?count=100",
    );
    jobs = data.jobs ?? [];
  }
  const parsed = parseJobicyJobs(jobs);
  console.log(`[discover:jobicy] companies: ${parsed.length}`);
  return parsed;
}
