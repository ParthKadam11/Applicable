import { fetchJson } from "../../utils/http.js";
import { extractAtsUrls } from "../ats-urls.js";
import {
  isEarlyCareerText,
  isPriorityGeoText,
  isWorldwideAnywhereText,
  sortByDiscoveryPriority,
} from "../early-career-signal.js";
import type { DiscoveredCompany } from "../types.js";

interface HimalayasJob {
  title?: string;
  companyName?: string;
  companySlug?: string;
  description?: string;
  applicationLink?: string;
  guid?: string;
}

interface HimalayasResponse {
  jobs?: HimalayasJob[];
  nextCursor?: string | null;
  totalCount?: number;
}

export function parseHimalayasJobs(jobs: HimalayasJob[]): DiscoveredCompany[] {
  type Scored = DiscoveredCompany & {
    earlyCareer?: boolean;
    priorityGeo?: boolean;
  };
  const byKey = new Map<string, Scored>();

  for (const job of jobs) {
    const name = job.companyName?.trim();
    if (!name) continue;

    const blob = [job.description, job.applicationLink, job.guid, job.title]
      .filter(Boolean)
      .join("\n");
    const atsHits = extractAtsUrls(blob);
    const primary = atsHits[0];
    const earlyCareer = isEarlyCareerText(job.title, job.description);
    const worldwide = isWorldwideAnywhereText(job.description, job.title);
    const priorityGeo =
      worldwide || isPriorityGeoText(job.description, job.title);
    // Prefer worldwide/anywhere-tagged postings for growth.
    if (!worldwide && !primary) continue;

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
      // Don't invent fake domains - leave null unless we have a real URL.
      domain: null,
      source: "himalayas",
      evidenceUrl:
        primary?.url ??
        (job.companySlug
          ? `https://himalayas.app/companies/${job.companySlug}`
          : null),
      ats: primary?.ats ?? null,
      atsSlug: primary?.atsSlug ?? null,
      earlyCareer,
      priorityGeo: true,
    });
  }

  return sortByDiscoveryPriority([...byKey.values()]);
}

export async function discoverHimalayas(
  maxPages = 5,
): Promise<DiscoveredCompany[]> {
  const all: HimalayasJob[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const url: string = cursor
      ? `https://himalayas.app/jobs/api?limit=100&cursor=${encodeURIComponent(cursor)}`
      : "https://himalayas.app/jobs/api?limit=100";
    const data: HimalayasResponse = await fetchJson<HimalayasResponse>(url);
    const jobs = data.jobs ?? [];
    all.push(...jobs);
    cursor = data.nextCursor ?? null;
    if (!cursor || jobs.length === 0) break;
  }

  const parsed = parseHimalayasJobs(all);
  console.log(`[discover:himalayas] companies: ${parsed.length}`);
  return parsed;
}
