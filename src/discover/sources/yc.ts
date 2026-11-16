import { config } from "../../config.js";
import { fetchJson } from "../../utils/http.js";
import { domainFromUrl } from "../ats-urls.js";
import { isHardwareManufacturing } from "../hardware.js";
import type { DiscoveredCompany } from "../types.js";

interface YcHit {
  name?: string;
  website?: string;
  slug?: string;
  isHiring?: boolean;
  industry?: string;
  subindustry?: string;
  industries?: string[];
  tags?: string[];
  batch?: string;
  all_locations?: string;
  regions?: string[];
}

interface AlgoliaResponse {
  hits?: YcHit[];
  nbPages?: number;
  page?: number;
}

const ALGOLIA_URL =
  "https://45bwzj1sgc-dsn.algolia.net/1/indexes/YCCompany_production/query";

/** Public search-only key embedded in YC's frontend (rotates occasionally). */
const DEFAULT_ALGOLIA_KEY =
  "Zjk5ZmFjMzg2NmQxNTA0NGM5OGNiNWY4MzQ0NDUyNTg0MDZjMzdmMWY1NTU2YzZkZGVmYjg1ZGZjMGJlYjhkN3Jlc3RyaWN0SW5kaWNlcz1ZQ0NvbXBhbnlfcHJvZHVjdGlvbiZ0YWdGaWx0ZXJzPSU1QiUyMnljZGNfcHVibGljJTIyJTVEJmFuYWx5dGljc1RhZ3M9JTVCJTIyeWNkYyUyMiU1RA==";

/** Approximate chronological batch order (newest first). */
const BATCH_RANK: Record<string, number> = {
  "Spring 2026": 100,
  "Winter 2026": 99,
  "Summer 2025": 98,
  "Spring 2025": 97,
  "Winter 2025": 96,
  "Fall 2024": 95,
  "Summer 2024": 94,
  "Spring 2024": 93,
  "Winter 2024": 92,
  "Summer 2023": 91,
  "Winter 2023": 90,
};

const AI_ML_RE =
  /\b(?:AI|A\.I\.|artificial intelligence|machine learning|\bML\b|LLM|deep learning|generative)\b/i;

const REMOTE_INDIA_RE =
  /\b(?:remote|worldwide|anywhere|india|indian|asia|apac)\b/i;

function batchRank(batch: string | undefined): number {
  if (!batch) return 0;
  if (BATCH_RANK[batch] != null) return BATCH_RANK[batch]!;
  const m = batch.match(/(Winter|Summer|Spring|Fall)\s+(\d{4})/i);
  if (!m) return 0;
  const season = { winter: 1, spring: 2, summer: 3, fall: 4 }[
    m[1]!.toLowerCase()
  ] ?? 0;
  return Number(m[2]) * 10 + season;
}

function isAiMl(hit: YcHit): boolean {
  const blob = [
    hit.industry,
    hit.subindustry,
    ...(hit.industries ?? []),
    ...(hit.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  return AI_ML_RE.test(blob);
}

function isRemoteOrIndia(hit: YcHit): boolean {
  const blob = [hit.all_locations, ...(hit.regions ?? [])]
    .filter(Boolean)
    .join(" ");
  return REMOTE_INDIA_RE.test(blob);
}

function toDiscovered(hit: YcHit): DiscoveredCompany | null {
  if (!hit.name?.trim()) return null;
  if (
    isHardwareManufacturing({
      industries: hit.industries,
      tags: hit.tags,
      subindustry: hit.subindustry,
      industry: hit.industry,
    })
  ) {
    return null;
  }
  const ai = isAiMl(hit);
  const geo = isRemoteOrIndia(hit);
  return {
    name: hit.name.trim(),
    domain: domainFromUrl(hit.website),
    source: "yc",
    evidenceUrl: hit.website ?? null,
    industries: hit.industries ?? [],
    tags: hit.tags ?? [],
    subindustry: hit.subindustry ?? null,
    earlyCareer: false,
    priorityGeo: geo || ai,
  };
}

async function fetchFromAlgolia(maxPages = 5): Promise<DiscoveredCompany[]> {
  const apiKey = config.YC_ALGOLIA_API_KEY || DEFAULT_ALGOLIA_KEY;
  const out: DiscoveredCompany[] = [];
  let skippedHardware = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const data = await fetchJson<AlgoliaResponse>(ALGOLIA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-Application-Id": "45BWZJ1SGC",
        "X-Algolia-API-Key": apiKey,
      },
      body: JSON.stringify({
        query: "",
        hitsPerPage: 100,
        page,
        facetFilters: [["isHiring:true"]],
      }),
    });

    const hits = data.hits ?? [];
    for (const hit of hits) {
      const row = toDiscovered(hit);
      if (!row) {
        if (hit.name?.trim()) skippedHardware += 1;
        continue;
      }
      out.push(row);
    }

    const nbPages = data.nbPages ?? 1;
    if (page + 1 >= nbPages || hits.length === 0) break;
  }

  if (skippedHardware > 0) {
    console.log(`[discover:yc] skipped hardware/manufacturing: ${skippedHardware}`);
  }
  return out;
}

interface YcOssCompany extends YcHit {
  batch?: string;
}

/**
 * yc-oss hiring.json — prefer last 4 batches, AI/ML + remote/India first.
 */
async function fetchFromYcOss(): Promise<DiscoveredCompany[]> {
  const data = await fetchJson<YcOssCompany[]>(
    "https://yc-oss.github.io/api/companies/hiring.json",
  );

  const rows = Array.isArray(data) ? data : [];
  const batchScores = new Map<string, number>();
  for (const c of rows) {
    if (!c.batch) continue;
    batchScores.set(c.batch, batchRank(c.batch));
  }
  const topBatches = [...batchScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([b]) => b);
  const topSet = new Set(topBatches);
  console.log(`[discover:yc] last 4 batches: ${topBatches.join(", ") || "(none)"}`);

  let skippedHardware = 0;
  const preferred: DiscoveredCompany[] = [];
  const rest: DiscoveredCompany[] = [];

  for (const c of rows) {
    const row = toDiscovered({ ...c, isHiring: true });
    if (!row) {
      if (c.name?.trim()) skippedHardware += 1;
      continue;
    }
    const inTop = c.batch ? topSet.has(c.batch) : false;
    const ai = isAiMl(c);
    const geo = isRemoteOrIndia(c);
    if (inTop && (ai || geo)) {
      preferred.push({ ...row, priorityGeo: true });
    } else if (inTop) {
      preferred.push(row);
    } else if (ai || geo) {
      rest.push({ ...row, priorityGeo: true });
    } else {
      rest.push(row);
    }
  }

  if (skippedHardware > 0) {
    console.log(`[discover:yc] skipped hardware/manufacturing: ${skippedHardware}`);
  }
  // AI/ML + remote/India from recent batches first, then other recent, then rest.
  return [...preferred, ...rest];
}

/** YC directory companies currently marked hiring (yc-oss preferred for batch filter). */
export async function discoverYc(): Promise<DiscoveredCompany[]> {
  try {
    const fromOss = await fetchFromYcOss();
    if (fromOss.length > 0) {
      console.log(`[discover:yc] yc-oss hiring companies: ${fromOss.length}`);
      return fromOss;
    }
  } catch (err) {
    console.warn(
      `[discover:yc] yc-oss failed, falling back to Algolia:`,
      err instanceof Error ? err.message.slice(0, 160) : err,
    );
  }

  const hits = await fetchFromAlgolia();
  console.log(`[discover:yc] Algolia hiring companies: ${hits.length}`);
  return hits;
}

/** Pure parser for tests. */
export function parseYcHits(hits: YcHit[]): DiscoveredCompany[] {
  return hits
    .filter((h) => h.name?.trim() && h.isHiring !== false)
    .map((h) => toDiscovered(h))
    .filter((d): d is DiscoveredCompany => d != null);
}
