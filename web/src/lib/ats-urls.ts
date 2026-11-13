/** Extract Ashby / Greenhouse / Lever board hits from a URL or text. */

export type Ats = "ashby" | "greenhouse" | "lever";

export type AtsHit = {
  ats: Ats;
  atsSlug: string;
  url: string;
};

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
];

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

export function evidenceUrlFor(ats: Ats, slug: string): string {
  if (ats === "ashby") return `https://jobs.ashbyhq.com/${slug}`;
  if (ats === "lever") return `https://jobs.lever.co/${slug}`;
  return `https://boards.greenhouse.io/${slug}`;
}

export function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 180);
}

export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`)
      .hostname.toLowerCase()
      .replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}
