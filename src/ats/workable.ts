import { fetchJson, HttpError } from "../utils/http.js";
import { stripHtml } from "../utils/html.js";
import type { AtsAdapter, NormalizedJob } from "./types.js";

interface WorkableLocation {
  city?: string | null;
  country?: string | null;
  countryCode?: string | null;
  region?: string | null;
  state?: string | null;
  hidden?: boolean;
}

interface WorkableListJob {
  id?: number | string;
  shortcode: string;
  title: string;
  remote?: boolean;
  workplace?: string | null;
  location?: WorkableLocation | null;
  locations?: WorkableLocation[];
  department?: string[] | string | null;
  published?: string | null;
  state?: string | null;
}

interface WorkableListResponse {
  results?: WorkableListJob[];
  total?: number;
  nextPage?: string | null;
}

interface WorkableDetailJob extends WorkableListJob {
  description?: string | null;
  requirements?: string | null;
  benefits?: string | null;
  employment_type?: string | null;
  application_url?: string | null;
  url?: string | null;
  telecommuting?: boolean;
  city?: string | null;
  country?: string | null;
  state?: string | null;
}

interface WorkableWidgetResponse {
  name?: string;
  jobs?: WorkableDetailJob[];
}

function departmentFrom(
  department: string[] | string | null | undefined,
): string | null {
  if (Array.isArray(department)) {
    const joined = department.filter(Boolean).join(", ").trim();
    return joined || null;
  }
  if (typeof department === "string" && department.trim()) return department.trim();
  return null;
}

function locationRawFrom(job: WorkableDetailJob | WorkableListJob): string | null {
  const parts: string[] = [];
  const locs =
    job.locations && job.locations.length > 0
      ? job.locations.filter((l) => !l.hidden)
      : job.location
        ? [job.location]
        : [];
  for (const loc of locs) {
    const bit = [loc.city, loc.region ?? loc.state, loc.country]
      .filter(Boolean)
      .join(", ");
    if (bit) parts.push(bit);
  }
  if (
    parts.length === 0 &&
    "city" in job &&
    (job.city || job.country || job.state)
  ) {
    const bit = [job.city, job.state, job.country].filter(Boolean).join(", ");
    if (bit) parts.push(bit);
  }
  if ("remote" in job && job.remote) parts.push("Remote");
  if ("telecommuting" in job && job.telecommuting) parts.push("Remote");
  if ("workplace" in job && job.workplace === "remote") parts.push("Remote");
  return parts.length ? [...new Set(parts)].join("; ") : null;
}

function isRemoteFlag(job: WorkableDetailJob | WorkableListJob): boolean | null {
  if (typeof (job as WorkableDetailJob).telecommuting === "boolean") {
    return (job as WorkableDetailJob).telecommuting!;
  }
  if (typeof job.remote === "boolean") return job.remote;
  if (job.workplace === "remote") return true;
  if (job.workplace === "hybrid" || job.workplace === "on_site") return false;
  return null;
}

function applyUrlFrom(slug: string, job: WorkableDetailJob): string {
  if (job.application_url) return job.application_url;
  if (job.url) return job.url;
  return `https://apply.workable.com/${slug}/j/${job.shortcode}/`;
}

function descriptionFrom(job: WorkableDetailJob): string {
  const html = [job.description, job.requirements, job.benefits]
    .filter(Boolean)
    .join("\n\n");
  return stripHtml(html);
}

export function normalizeWorkableJob(
  job: WorkableDetailJob,
  slug: string,
  companyId: string,
): NormalizedJob {
  return {
    externalId: String(job.shortcode),
    companyId,
    title: job.title,
    department: departmentFrom(job.department),
    locationRaw: locationRawFrom(job),
    isRemoteFlag: isRemoteFlag(job),
    employmentType: job.employment_type ?? null,
    descriptionText: descriptionFrom(job),
    applyUrl: applyUrlFrom(slug, job),
    compensationRaw: null,
    postedAt: job.published ? new Date(job.published) : null,
    sourceAts: "workable",
  };
}

async function listWorkablePage(
  slug: string,
  token?: string,
): Promise<WorkableListResponse> {
  const url = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(slug)}/jobs`;
  const body: Record<string, unknown> = {
    query: "",
    location: [],
    department: [],
    worktype: [],
    remote: [],
  };
  if (token) body.token = token;
  return fetchJson<WorkableListResponse>(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
}

/** Count published jobs on a Workable board (null = not found). */
export async function countWorkableJobs(slug: string): Promise<number | null> {
  try {
    const data = await listWorkablePage(slug);
    if (typeof data.total === "number") return data.total;
    return Array.isArray(data.results) ? data.results.length : 0;
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 400)) {
      return null;
    }
    throw err;
  }
}

async function fetchWorkableDetail(
  slug: string,
  shortcode: string,
): Promise<WorkableDetailJob | null> {
  const url = `https://apply.workable.com/api/v2/accounts/${encodeURIComponent(slug)}/jobs/${encodeURIComponent(shortcode)}`;
  try {
    return await fetchJson<WorkableDetailJob>(url);
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

/** Prefer widget?details=true (full text in one call); fall back to list+detail. */
async function fetchViaWidget(
  slug: string,
  companyId: string,
): Promise<NormalizedJob[] | null> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`;
  try {
    const data = await fetchJson<WorkableWidgetResponse>(url);
    const jobs = data.jobs ?? [];
    // Dedupe by shortcode (Workable repeats locations as rows).
    const byCode = new Map<string, WorkableDetailJob>();
    for (const job of jobs) {
      if (!job.shortcode || !job.title) continue;
      const prev = byCode.get(job.shortcode);
      if (!prev) {
        byCode.set(job.shortcode, job);
        continue;
      }
      // Merge location hints
      const locs = [
        ...(prev.locations ?? []),
        ...(job.locations ?? []),
      ];
      byCode.set(job.shortcode, { ...prev, locations: locs });
    }
    return [...byCode.values()].map((j) =>
      normalizeWorkableJob(j, slug, companyId),
    );
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

export class WorkableAdapter implements AtsAdapter {
  readonly name = "workable" as const;

  async fetchJobs(slug: string, companyId: string): Promise<NormalizedJob[]> {
    const viaWidget = await fetchViaWidget(slug, companyId);
    if (viaWidget) return viaWidget;

    const collected: NormalizedJob[] = [];
    let token: string | undefined;
    for (let page = 0; page < 50; page += 1) {
      const data = await listWorkablePage(slug, token);
      const results = data.results ?? [];
      for (const item of results) {
        if (!item.shortcode) continue;
        const detail =
          (await fetchWorkableDetail(slug, item.shortcode)) ?? item;
        collected.push(normalizeWorkableJob(detail, slug, companyId));
      }
      if (!data.nextPage || results.length === 0) break;
      token = data.nextPage;
    }
    // Dedupe shortcodes
    const byId = new Map(collected.map((j) => [j.externalId, j]));
    return [...byId.values()];
  }
}

export const workableAdapter = new WorkableAdapter();
