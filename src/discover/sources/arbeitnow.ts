import { fetchJson } from "../../utils/http.js";
import { domainFromUrl, extractAtsUrls } from "../ats-urls.js";
import {
  isEarlyCareerText,
  isPriorityGeoText,
  sortByDiscoveryPriority,
} from "../early-career-signal.js";
import type { DiscoveredCompany } from "../types.js";

interface ArbeitnowJob {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  location?: string;
  job_types?: string[];
  tags?: string[];
}

interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
  links?: { next?: string | null };
}

type Scored = DiscoveredCompany & {
  earlyCareer?: boolean;
  priorityGeo?: boolean;
};

export function parseArbeitnowJobs(jobs: ArbeitnowJob[]): DiscoveredCompany[] {
  const byKey = new Map<string, Scored>();

  for (const job of jobs) {
    if (job.remote === false) continue;
    const name = job.company_name?.trim();
    if (!name) continue;

    const blob = [job.url, job.description, job.title, ...(job.tags ?? [])]
      .filter(Boolean)
      .join("\n");
    const atsHits = extractAtsUrls(blob);
    const primary = atsHits[0];
    const earlyCareer = isEarlyCareerText(
      job.title,
      job.description,
      ...(job.job_types ?? []),
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
      domain: domainFromUrl(job.url),
      source: "arbeitnow",
      evidenceUrl: primary?.url ?? job.url ?? null,
      ats: primary?.ats ?? null,
      atsSlug: primary?.atsSlug ?? null,
      earlyCareer,
      priorityGeo,
    });
  }

  return sortByDiscoveryPriority([...byKey.values()]);
}

/** Arbeitnow public API — mostly EU; filter to remote; 2 pages max. */
export async function discoverArbeitnow(maxPages = 2): Promise<DiscoveredCompany[]> {
  const all: ArbeitnowJob[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await fetchJson<ArbeitnowResponse>(
      `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
    );
    const rows = data.data ?? [];
    if (rows.length === 0) break;
    all.push(...rows);
  }
  const parsed = parseArbeitnowJobs(all);
  console.log(`[discover:arbeitnow] companies: ${parsed.length}`);
  return parsed;
}
