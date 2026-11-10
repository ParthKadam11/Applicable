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
  return {
    name: hit.name.trim(),
    domain: domainFromUrl(hit.website),
    source: "yc",
    evidenceUrl: hit.website ?? null,
    industries: hit.industries ?? [],
    tags: hit.tags ?? [],
    subindustry: hit.subindustry ?? null,
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

async function fetchFromYcOss(): Promise<DiscoveredCompany[]> {
  const data = await fetchJson<YcHit[]>(
    "https://yc-oss.github.io/api/companies/hiring.json",
  );

  let skippedHardware = 0;
  const out: DiscoveredCompany[] = [];
  for (const c of Array.isArray(data) ? data : []) {
    const row = toDiscovered({ ...c, isHiring: true });
    if (!row) {
      if (c.name?.trim()) skippedHardware += 1;
      continue;
    }
    out.push(row);
  }
  if (skippedHardware > 0) {
    console.log(`[discover:yc] skipped hardware/manufacturing: ${skippedHardware}`);
  }
  return out;
}

/** YC directory companies currently marked hiring (Algolia, OSS fallback). */
export async function discoverYc(): Promise<DiscoveredCompany[]> {
  try {
    const hits = await fetchFromAlgolia();
    if (hits.length > 0) {
      console.log(`[discover:yc] Algolia hiring companies: ${hits.length}`);
      return hits;
    }
  } catch (err) {
    console.warn(
      `[discover:yc] Algolia failed, falling back to yc-oss:`,
      err instanceof Error ? err.message.slice(0, 160) : err,
    );
  }

  const fallback = await fetchFromYcOss();
  console.log(`[discover:yc] yc-oss hiring companies: ${fallback.length}`);
  return fallback;
}

/** Pure parser for tests. */
export function parseYcHits(hits: YcHit[]): DiscoveredCompany[] {
  return hits
    .filter((h) => h.name?.trim() && h.isHiring !== false)
    .map((h) => toDiscovered(h))
    .filter((d): d is DiscoveredCompany => d != null);
}
