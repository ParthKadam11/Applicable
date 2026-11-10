import { fetchJson } from "../../utils/http.js";
import { domainFromUrl, extractAtsUrls } from "../ats-urls.js";
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
  "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=Who%20is%20hiring&hitsPerPage=5";

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

export function parseHnComments(
  comments: Array<{ comment_text?: string; story_id?: number }>,
  storyId: string,
): DiscoveredCompany[] {
  const byName = new Map<string, DiscoveredCompany>();

  for (const c of comments) {
    const text = c.comment_text ?? "";
    if (!text.trim()) continue;

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
        domain: hit ? null : domainFromUrl(text.match(/https?:\/\/[^\s<]+/i)?.[0]),
        source: "hn_hiring",
        evidenceUrl: hit?.url ?? `https://news.ycombinator.com/item?id=${storyId}`,
        ats: hit?.ats ?? null,
        atsSlug: hit?.atsSlug ?? null,
      });
    }
  }

  return [...byName.values()];
}

export async function discoverHnHiring(): Promise<DiscoveredCompany[]> {
  const stories = await fetchJson<HnSearchResponse>(HN_SEARCH);
  const latest = stories.hits?.[0];
  if (!latest?.objectID) {
    console.log("[discover:hn] no Who is hiring thread found");
    return [];
  }

  const storyId = latest.objectID;
  console.log(
    `[discover:hn] thread ${storyId}: ${latest.title ?? "(no title)"}`,
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

  const parsed = parseHnComments(comments, storyId);
  console.log(`[discover:hn] candidates from comments: ${parsed.length}`);
  return parsed;
}
