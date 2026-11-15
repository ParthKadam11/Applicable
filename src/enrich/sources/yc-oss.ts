import { fetchJson } from "../../utils/http.js";
import { cacheAgeMs, readCache, writeCache } from "../cache.js";
import { domainFromWebsite, normalizeName } from "../normalize.js";
import type { ExtractedFact } from "../types.js";

export type YcOssCompany = {
  id: number;
  name: string;
  slug: string;
  website?: string | null;
  all_locations?: string | null;
  one_liner?: string | null;
  team_size?: number | null;
  industry?: string | null;
  industries?: string[];
  tags?: string[];
  batch?: string | null;
  url?: string | null;
  api?: string | null;
  long_description?: string | null;
  launched_at?: number | null;
  partners?: string | null;
};

const YC_ALL = "https://yc-oss.github.io/api/companies/all.json";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

let memoryIndex: {
  byDomain: Map<string, YcOssCompany>;
  byName: Map<string, YcOssCompany>;
} | null = null;

export async function loadYcOssIndex(): Promise<{
  byDomain: Map<string, YcOssCompany>;
  byName: Map<string, YcOssCompany>;
}> {
  if (memoryIndex) return memoryIndex;
  const cached = readCache<YcOssCompany[]>("yc-oss", "all");
  let rows: YcOssCompany[];
  if (cached && cacheAgeMs(cached) < TTL_MS) {
    rows = cached.value;
  } else {
    rows = await fetchJson<YcOssCompany[]>(YC_ALL);
    writeCache("yc-oss", "all", rows);
  }
  const byDomain = new Map<string, YcOssCompany>();
  const byName = new Map<string, YcOssCompany>();
  for (const r of rows) {
    byName.set(normalizeName(r.name), r);
    const d = domainFromWebsite(r.website ?? undefined);
    if (d) byDomain.set(d, r);
  }
  memoryIndex = { byDomain, byName };
  return memoryIndex;
}

export function matchYcOss(
  index: Awaited<ReturnType<typeof loadYcOssIndex>>,
  company: { name: string; website: string },
): YcOssCompany | null {
  const d = domainFromWebsite(company.website);
  if (d && index.byDomain.has(d)) return index.byDomain.get(d)!;
  const n = normalizeName(company.name);
  return index.byName.get(n) ?? null;
}

/** yc-oss structured fields → facts with quote = field value (source is the API URL). */
export function factsFromYcOss(yc: YcOssCompany): ExtractedFact[] {
  const sourceUrl = yc.url || yc.api || `https://www.ycombinator.com/companies/${yc.slug}`;
  const blob = [
    yc.name,
    yc.one_liner,
    yc.long_description,
    yc.all_locations,
    yc.batch,
    yc.industry,
    ...(yc.industries ?? []),
    ...(yc.tags ?? []),
    yc.team_size != null ? String(yc.team_size) : "",
  ]
    .filter(Boolean)
    .join("\n");
  writeCache("yc-oss-text", yc.slug, blob);

  const out: ExtractedFact[] = [];
  const push = (f: ExtractedFact) => {
    // For structured API fields, quote is the field itself present in blob
    if (blob.includes(f.quote) || blob.includes(f.value)) out.push(f);
  };

  if (yc.batch) {
    push({
      factType: "batch",
      value: yc.batch,
      sourceUrl,
      quote: yc.batch,
      sourceKind: "yc_oss",
      confidence: 1,
    });
  }
  if (yc.team_size != null && yc.team_size > 0) {
    push({
      factType: "team_size",
      value: String(yc.team_size),
      sourceUrl,
      quote: String(yc.team_size),
      sourceKind: "yc_oss",
      confidence: 1,
    });
  }
  if (yc.one_liner?.trim()) {
    push({
      factType: "one_liner",
      value: yc.one_liner.trim().slice(0, 300),
      sourceUrl,
      quote: yc.one_liner.trim().slice(0, 280),
      sourceKind: "yc_oss",
      confidence: 1,
    });
  }
  if (yc.all_locations?.trim()) {
    // Multi-HQ strings are semicolon/pipe separated; use the first location only.
    const firstLoc = yc.all_locations
      .trim()
      .split(/\s*[;|]\s*/)[0]!
      .trim();
    const parts = firstLoc.split(",").map((s) => s.trim()).filter(Boolean);
    const city = parts[0] ?? firstLoc;
    // Prefer last token as country (handles "San Francisco, CA, USA")
    const country = parts.length >= 2 ? parts[parts.length - 1]! : parts[0]!;
    push({
      factType: "hq",
      value: firstLoc,
      sourceUrl,
      quote: firstLoc,
      sourceKind: "yc_oss",
      confidence: 0.95,
      city,
      country,
    });
  }
  // Use singular `industry` only. The `industries` array mixes the real
  // industry with YC directory groups like "Engineering, Product and Design".
  if (yc.industry?.trim()) {
    push({
      factType: "industry",
      value: yc.industry.trim(),
      sourceUrl,
      quote: yc.industry.trim(),
      sourceKind: "yc_oss",
      confidence: 1,
    });
  }
  for (const tag of yc.tags ?? []) {
    push({
      factType: "tag",
      value: tag,
      sourceUrl,
      quote: tag,
      sourceKind: "yc_oss",
      confidence: 1,
    });
  }
  if (yc.launched_at && yc.launched_at > 0) {
    const year = new Date(yc.launched_at * 1000).getUTCFullYear().toString();
    push({
      factType: "founded_year",
      value: year,
      sourceUrl,
      quote: year,
      sourceKind: "yc_oss",
      confidence: 0.7,
    });
  }
  return out;
}
