import { fetchJson } from "../../utils/http.js";
import { domainFromUrl, extractAtsUrls } from "../ats-urls.js";
import {
  isEarlyCareerText,
  isPriorityGeoText,
  sortByDiscoveryPriority,
} from "../early-career-signal.js";
import type { DiscoveredCompany } from "../types.js";

interface RemotiveJob {
  id?: number;
  title?: string;
  company_name?: string;
  company_logo?: string;
  url?: string;
  description?: string;
  candidate_required_location?: string;
  category?: string;
  job_type?: string;
}

interface RemotiveResponse {
  jobs?: RemotiveJob[];
}

type Scored = DiscoveredCompany & {
  earlyCareer?: boolean;
  priorityGeo?: boolean;
};

export function parseRemotiveJobs(jobs: RemotiveJob[]): DiscoveredCompany[] {
  const byKey = new Map<string, Scored>();

  for (const job of jobs) {
    const name = job.company_name?.trim();
    if (!name) continue;

    const blob = [job.url, job.description, job.title].filter(Boolean).join("\n");
    const atsHits = extractAtsUrls(blob);
    const primary = atsHits[0];
    const earlyCareer = isEarlyCareerText(job.title, job.description, job.job_type);
    const priorityGeo = isPriorityGeoText(
      job.candidate_required_location,
      job.description,
    );

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
      source: "remotive",
      evidenceUrl: primary?.url ?? job.url ?? null,
      ats: primary?.ats ?? null,
      atsSlug: primary?.atsSlug ?? null,
      earlyCareer,
      priorityGeo,
    });
  }

  return sortByDiscoveryPriority([...byKey.values()]);
}

/** Remotive public API — software-dev category, rate-limit friendly. */
export async function discoverRemotive(): Promise<DiscoveredCompany[]> {
  const data = await fetchJson<RemotiveResponse>(
    "https://remotive.com/api/remote-jobs?category=software-dev&limit=100",
  );
  const jobs = data.jobs ?? [];
  const parsed = parseRemotiveJobs(jobs);
  console.log(`[discover:remotive] companies: ${parsed.length}`);
  return parsed;
}
