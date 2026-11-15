import type { Ats } from "../ats/types.js";
import type { AtsHit } from "./types.js";

const PATTERNS: Array<{
  ats: Ats;
  regex: RegExp;
  slugGroup: number;
}> = [
  {
    ats: "ashby",
    regex: /https?:\/\/jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/gi,
    slugGroup: 1,
  },
  {
    ats: "greenhouse",
    regex:
      /https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/([a-zA-Z0-9_-]+)/gi,
    slugGroup: 1,
  },
  {
    ats: "lever",
    regex: /https?:\/\/jobs\.lever\.co\/([a-zA-Z0-9_-]+)/gi,
    slugGroup: 1,
  },
  {
    ats: "smartrecruiters",
    regex: /https?:\/\/jobs\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/gi,
    slugGroup: 1,
  },
];

/** Extract Ashby / Greenhouse / Lever / SmartRecruiters board hits from text. */
export function extractAtsUrls(text: string): AtsHit[] {
  const found = new Map<string, AtsHit>();
  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      const slug = match[pattern.slugGroup];
      if (!slug) continue;
      const key = `${pattern.ats}:${slug.toLowerCase()}`;
      if (!found.has(key)) {
        found.set(key, {
          ats: pattern.ats,
          atsSlug: slug,
          url: match[0],
        });
      }
    }
  }
  return [...found.values()];
}

export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Build a website URL from a domain. Returns empty string when unknown — never example.com. */
export function websiteFromDomain(domain: string | null | undefined): string {
  if (!domain?.trim()) return "";
  const host = domain
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/^www\./, "");
  if (!host || host === "example.com" || host.endsWith(".example")) return "";
  return `https://${host}`;
}
