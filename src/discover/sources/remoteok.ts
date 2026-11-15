import { fetchJson } from "../../utils/http.js";
import { domainFromUrl, extractAtsUrls } from "../ats-urls.js";
import {
  isEarlyCareerText,
  isPriorityGeoText,
  sortByDiscoveryPriority,
} from "../early-career-signal.js";
import type { DiscoveredCompany } from "../types.js";

interface RemoteOkJob {
  company?: string;
  url?: string;
  apply_url?: string;
  description?: string;
  company_logo?: string;
  position?: string;
  location?: string;
  tags?: string[];
}

export function parseRemoteOkJobs(jobs: RemoteOkJob[]): DiscoveredCompany[] {
  type Scored = DiscoveredCompany & {
    earlyCareer?: boolean;
    priorityGeo?: boolean;
  };
  const byKey = new Map<string, Scored>();

  for (const job of jobs) {
    const name = job.company?.trim();
    if (!name || name.toLowerCase() === "undefined") continue;

    const blob = [job.url, job.apply_url, job.description, job.position]
      .filter(Boolean)
      .join("\n");
    const atsHits = extractAtsUrls(blob);
    const primary = atsHits[0];
    const earlyCareer = isEarlyCareerText(
      job.position,
      job.description,
      ...(job.tags ?? []),
    );
    const priorityGeo = isPriorityGeoText(job.location, job.description);

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
      domain: domainFromUrl(job.url) && !/remoteok\.com/i.test(job.url ?? "")
        ? domainFromUrl(job.url)
        : null,
      source: "remoteok",
      evidenceUrl: primary?.url ?? job.apply_url ?? job.url ?? null,
      ats: primary?.ats ?? null,
      atsSlug: primary?.atsSlug ?? null,
      earlyCareer,
      priorityGeo,
    });
  }

  return sortByDiscoveryPriority([...byKey.values()]);
}

export async function discoverRemoteOk(): Promise<DiscoveredCompany[]> {
  const data = await fetchJson<RemoteOkJob[]>("https://remoteok.com/api");
  // First element is often legal metadata without a company.
  const jobs = (Array.isArray(data) ? data : []).filter((j) => j.company);
  const parsed = parseRemoteOkJobs(jobs);
  console.log(`[discover:remoteok] companies: ${parsed.length}`);
  return parsed;
}
