import { HttpError, fetchJson } from "../utils/http.js";
import { stripHtml } from "../utils/html.js";
import type { AtsAdapter, NormalizedJob } from "./types.js";

interface SrLocation {
  city?: string;
  region?: string;
  country?: string;
  remote?: boolean;
  fullLocation?: string;
}

interface SrSection {
  title?: string;
  text?: string;
}

interface SrListJob {
  id?: string;
  uuid?: string;
  name?: string;
  location?: SrLocation;
  releasedDate?: string;
  typeOfEmployment?: string | { label?: string };
  department?: { label?: string };
  function?: { label?: string };
  refNumber?: string;
}

interface SrListResponse {
  content?: SrListJob[];
  totalFound?: number;
  offset?: number;
  limit?: number;
}

interface SrDetail {
  id?: string;
  name?: string;
  location?: SrLocation;
  applyUrl?: string;
  postingUrl?: string;
  releasedDate?: string;
  typeOfEmployment?: string | { label?: string };
  department?: { label?: string };
  function?: { label?: string };
  jobAd?: { sections?: Record<string, SrSection> };
}

function locationRaw(loc?: SrLocation | null): string | null {
  if (!loc) return null;
  if (loc.fullLocation?.trim()) return loc.fullLocation.trim();
  const parts = [loc.city, loc.region, loc.country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function employmentType(
  raw: string | { label?: string } | undefined,
): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  return raw.label ?? null;
}

function descriptionFromDetail(detail: SrDetail): string {
  const sections = detail.jobAd?.sections ?? {};
  const order = [
    "jobDescription",
    "qualifications",
    "additionalInformation",
    "companyDescription",
  ];
  const chunks: string[] = [];
  for (const key of order) {
    const sec = sections[key];
    if (sec?.text) chunks.push(stripHtml(sec.text));
  }
  for (const [key, sec] of Object.entries(sections)) {
    if (order.includes(key)) continue;
    if (sec?.text) chunks.push(stripHtml(sec.text));
  }
  return chunks.filter(Boolean).join("\n\n");
}

export function normalizeSmartRecruitersJob(
  listJob: SrListJob,
  detail: SrDetail | null,
  companyId: string,
  slug: string,
): NormalizedJob {
  const id = String(detail?.id ?? listJob.id ?? listJob.uuid ?? "");
  const title = detail?.name ?? listJob.name ?? "Untitled";
  const loc = detail?.location ?? listJob.location;
  const apply =
    detail?.applyUrl ??
    detail?.postingUrl ??
    `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${id}`;

  return {
    externalId: id,
    companyId,
    title,
    department:
      detail?.department?.label ??
      listJob.department?.label ??
      detail?.function?.label ??
      listJob.function?.label ??
      null,
    locationRaw: locationRaw(loc),
    isRemoteFlag:
      loc?.remote === true ? true : loc?.remote === false ? false : null,
    employmentType: employmentType(
      detail?.typeOfEmployment ?? listJob.typeOfEmployment,
    ),
    descriptionText: detail ? descriptionFromDetail(detail) : "",
    applyUrl: apply,
    compensationRaw: null,
    postedAt: detail?.releasedDate ?? listJob.releasedDate
      ? new Date(detail?.releasedDate ?? listJob.releasedDate!)
      : null,
    sourceAts: "smartrecruiters",
  };
}

async function listAllPostings(slug: string): Promise<SrListJob[]> {
  const out: SrListJob[] = [];
  let offset = 0;
  const limit = 100;
  for (let page = 0; page < 20; page += 1) {
    const listUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=${limit}&offset=${offset}`;
    const data = await fetchJson<SrListResponse>(listUrl);
    const jobs = data.content ?? [];
    if (jobs.length === 0) break;
    out.push(...jobs);
    offset += jobs.length;
    const total = data.totalFound ?? offset;
    if (offset >= total || jobs.length < limit) break;
  }
  return out;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (i < items.length) {
        const idx = i;
        i += 1;
        results[idx] = await fn(items[idx]!);
      }
    }),
  );
  return results;
}

/** Titles-only (no per-job detail fetch) for industry tech-ratio checks. */
export async function listSmartRecruitersTitles(slug: string): Promise<string[]> {
  const jobs = await listAllPostings(slug);
  return jobs.map((j) => j.name ?? "").filter(Boolean);
}

export async function countSmartRecruitersJobs(
  slug: string,
): Promise<number | null> {
  try {
    const data = await fetchJson<SrListResponse>(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=1&offset=0`,
    );
    return typeof data.totalFound === "number" ? data.totalFound : 0;
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

export class SmartRecruitersAdapter implements AtsAdapter {
  readonly name = "smartrecruiters" as const;

  async fetchJobs(slug: string, companyId: string): Promise<NormalizedJob[]> {
    const listed = await listAllPostings(slug);
    return mapPool(listed, 8, async (job) => {
      const id = String(job.id ?? "");
      let detail: SrDetail | null = null;
      if (id) {
        try {
          detail = await fetchJson<SrDetail>(
            `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings/${encodeURIComponent(id)}`,
          );
        } catch {
          detail = null;
        }
      }
      return normalizeSmartRecruitersJob(job, detail, companyId, slug);
    });
  }
}

export const smartRecruitersAdapter = new SmartRecruitersAdapter();
