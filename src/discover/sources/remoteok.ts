import { fetchJson } from "../../utils/http.js";
import { domainFromUrl, extractAtsUrls } from "../ats-urls.js";
import type { DiscoveredCompany } from "../types.js";

interface RemoteOkJob {
  company?: string;
  url?: string;
  apply_url?: string;
  description?: string;
  company_logo?: string;
}

export function parseRemoteOkJobs(jobs: RemoteOkJob[]): DiscoveredCompany[] {
  const byKey = new Map<string, DiscoveredCompany>();

  for (const job of jobs) {
    const name = job.company?.trim();
    if (!name || name.toLowerCase() === "undefined") continue;

    const blob = [job.url, job.apply_url, job.description]
      .filter(Boolean)
      .join("\n");
    const atsHits = extractAtsUrls(blob);
    const primary = atsHits[0];

    const key = primary
      ? `${primary.ats}:${primary.atsSlug}`.toLowerCase()
      : name.toLowerCase();
    if (byKey.has(key)) continue;

    byKey.set(key, {
      name,
      domain: domainFromUrl(job.url) && !/remoteok\.com/i.test(job.url ?? "")
        ? domainFromUrl(job.url)
        : null,
      source: "remoteok",
      evidenceUrl: primary?.url ?? job.apply_url ?? job.url ?? null,
      ats: primary?.ats ?? null,
      atsSlug: primary?.atsSlug ?? null,
    });
  }

  return [...byKey.values()];
}

export async function discoverRemoteOk(): Promise<DiscoveredCompany[]> {
  const data = await fetchJson<RemoteOkJob[]>("https://remoteok.com/api");
  // First element is often legal metadata without a company.
  const jobs = (Array.isArray(data) ? data : []).filter((j) => j.company);
  const parsed = parseRemoteOkJobs(jobs);
  console.log(`[discover:remoteok] companies: ${parsed.length}`);
  return parsed;
}
