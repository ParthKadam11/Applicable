import { fetchJson, HttpError } from "../utils/http.js";
import type { Ats } from "../ats/types.js";

const ATS_SUFFIX = /\s*\((?:greenhouse|lever|ashby|workable|recruitee|personio)\)\s*$/i;

/** Strip trailing "(greenhouse)" / "(lever)" / "(ashby)" from display names. */
export function stripAtsSuffix(name: string): string {
  return name.replace(ATS_SUFFIX, "").trim();
}

/**
 * Humanize an ATS slug: "datavant2" → "Datavant", "acme-corp" → "Acme Corp".
 * Trailing digit runs used as board disambiguators are dropped when the stem is long enough.
 */
export function displayNameFromSlug(slug: string): string {
  let s = slug.trim().toLowerCase();
  // drop trailing digits if preceded by letters (datavant2 → datavant)
  if (/[a-z].*\d+$/i.test(s) && !/^\d+$/.test(s)) {
    const stem = s.replace(/\d+$/, "");
    if (stem.length >= 3) s = stem;
  }
  return s
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 180);
}

export function cleanCompanyDisplayName(
  name: string | null | undefined,
  slug?: string | null,
): string {
  const stripped = stripAtsSuffix(name ?? "").trim();
  if (stripped.length >= 2) return stripped.slice(0, 200);
  if (slug) return displayNameFromSlug(slug);
  return (name ?? "Unknown").slice(0, 200);
}

/** Best-effort company name from public ATS board APIs. */
export async function fetchAtsCompanyName(
  ats: Ats,
  slug: string,
): Promise<string | null> {
  try {
    if (ats === "greenhouse") {
      const data = await fetchJson<{ name?: string; company_name?: string }>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`,
      );
      const n = data?.name ?? data?.company_name;
      return typeof n === "string" && n.trim() ? n.trim() : null;
    }
    if (ats === "ashby") {
      const data = await fetchJson<{
        jobs?: Array<{ department?: string }>;
        // Ashby posting-api may not expose company name; try optional fields
        companyName?: string;
        name?: string;
      }>(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
      );
      const n = data?.companyName ?? data?.name;
      return typeof n === "string" && n.trim() ? n.trim() : null;
    }
    if (ats === "smartrecruiters") {
      const data = await fetchJson<{
        content?: Array<{ company?: { name?: string } }>;
      }>(
        `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings?limit=1`,
      );
      const n = data?.content?.[0]?.company?.name;
      return typeof n === "string" && n.trim() ? n.trim() : null;
    }
    // Lever public JSON is postings-only - no reliable company name field.
    return null;
  } catch (err) {
    if (err instanceof HttpError && (err.status === 404 || err.status === 400)) {
      return null;
    }
    return null;
  }
}

export async function resolveCompanyDisplayName(input: {
  ats: Ats;
  slug: string;
  fallbackName?: string | null;
}): Promise<string> {
  const fromApi = await fetchAtsCompanyName(input.ats, input.slug);
  if (fromApi) return cleanCompanyDisplayName(fromApi, input.slug);
  const cleaned = cleanCompanyDisplayName(input.fallbackName, input.slug);
  // If cleaned still looks like a raw slug with digits, prefer humanized slug
  if (/^[a-z0-9]+$/i.test(cleaned.replace(/\s+/g, "")) && input.slug) {
    return displayNameFromSlug(input.slug);
  }
  return cleaned;
}
