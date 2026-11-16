import { fetchJson } from "../../utils/http.js";
import { domainFromUrl, extractAtsUrls } from "../ats-urls.js";
import {
  isEarlyCareerText,
  isPriorityGeoText,
} from "../early-career-signal.js";
import type { DiscoveredCompany } from "../types.js";

interface HnHit {
  objectID?: string;
  title?: string;
  story_id?: number;
  author?: string;
  created_at_i?: number;
  comment_text?: string;
  story_title?: string;
}

interface HnSearchResponse {
  hits?: HnHit[];
}

const HN_SEARCH =
  "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=Who%20is%20hiring&hitsPerPage=12";

/** Prefer REMOTE + India/worldwide/anywhere/Asia signals in HN comments. */
const HN_REMOTE_RE =
  /\b(?:remote|work\s+from\s+anywhere|distributed|fully\s+remote)\b/i;
const HN_GEO_RE =
  /\b(?:india|indian|worldwide|world[\s-]?wide|anywhere|global|asia|apac|asia[\s-]?pacific|south[\s-]?asia)\b/i;

/** First line often: "Company Name (YC S21) | Remote | …" */
export function companyNameFromHnComment(text: string): string | null {
  const plain = text
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return null;

  const first = plain.split(/[|\n]/)[0]?.trim() ?? "";
  const cleaned = first
    .replace(/\s*\(YC[^)]*\)\s*/i, " ")
    .replace(/\s*https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 2 || cleaned.length > 80) return null;
  if (/^(hi|hello|hey|remote|full[- ]time|part[- ]time)\b/i.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function hnPriority(text: string): {
  keep: boolean;
  earlyCareer: boolean;
  priorityGeo: boolean;
} {
  const remote = HN_REMOTE_RE.test(text);
  const geo = HN_GEO_RE.test(text) || isPriorityGeoText(text);
  const earlyCareer = isEarlyCareerText(text);
  // Keep comments that mention remote AND (India/worldwide/anywhere/Asia),
  // or that already carry a public ATS URL (promote path verifies).
  const hasAts = extractAtsUrls(text).length > 0;
  const keep = (remote && geo) || (hasAts && (remote || geo));
  return { keep, earlyCareer, priorityGeo: geo || remote };
}

export function parseHnComments(
  comments: Array<{ comment_text?: string; story_id?: number }>,
  storyId: string,
): DiscoveredCompany[] {
  const byName = new Map<string, DiscoveredCompany>();

  for (const c of comments) {
    const text = c.comment_text ?? "";
    if (!text.trim()) continue;

    const { keep, earlyCareer, priorityGeo } = hnPriority(text);
    if (!keep) continue;

    const atsHits = extractAtsUrls(text);
    const name = companyNameFromHnComment(text);
    if (!name && atsHits.length === 0) continue;

    for (const hit of atsHits.length > 0 ? atsHits : [null]) {
      const key = hit
        ? `${hit.ats}:${hit.atsSlug}`.toLowerCase()
        : name!.toLowerCase();
      if (byName.has(key)) continue;

      byName.set(key, {
        name: name ?? hit!.atsSlug,
        domain: hit
          ? null
          : domainFromUrl(text.match(/https?:\/\/[^\s<]+/i)?.[0]),
        source: "hn_hiring",
        evidenceUrl:
          hit?.url ?? `https://news.ycombinator.com/item?id=${storyId}`,
        ats: hit?.ats ?? null,
        atsSlug: hit?.atsSlug ?? null,
        earlyCareer,
        priorityGeo,
      });
    }
  }

  return [...byName.values()];
}

/** Last ~3 months of Who is hiring threads (Algolia whoishiring author). */
export async function discoverHnHiring(): Promise<DiscoveredCompany[]> {
  const stories = await fetchJson<HnSearchResponse>(HN_SEARCH);
  const threeMonthsAgo =
    Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
  const recent = (stories.hits ?? []).filter(
    (h) =>
      h.objectID &&
      (h.created_at_i == null || h.created_at_i >= threeMonthsAgo) &&
      /who is hiring/i.test(h.title ?? ""),
  );

  if (recent.length === 0) {
    console.log("[discover:hn] no Who is hiring threads in last 3 months");
    return [];
  }

  const byKey = new Map<string, DiscoveredCompany>();
  for (const story of recent.slice(0, 4)) {
    const storyId = story.objectID!;
    console.log(
      `[discover:hn] thread ${storyId}: ${story.title ?? "(no title)"}`,
    );

    const comments: HnHit[] = [];
    for (let page = 0; page < 20; page += 1) {
      const url = `https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}&hitsPerPage=100&page=${page}`;
      const data = await fetchJson<HnSearchResponse>(url);
      const hits = data.hits ?? [];
      if (hits.length === 0) break;
      comments.push(...hits);
      if (hits.length < 100) break;
    }

    for (const row of parseHnComments(comments, storyId)) {
      const key =
        row.ats && row.atsSlug
          ? `${row.ats}:${row.atsSlug}`.toLowerCase()
          : row.name.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, row);
    }
  }

  const parsed = [...byKey.values()];
  console.log(
    `[discover:hn] candidates from ${recent.slice(0, 4).length} threads: ${parsed.length}`,
  );
  return parsed;
}
