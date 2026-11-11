import { gunzipSync } from "node:zlib";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Ats } from "../../ats/types.js";
import { HttpError } from "../../utils/http.js";
import type { DiscoveredCompany } from "../types.js";

const COLLINFO_URL = "https://index.commoncrawl.org/collinfo.json";
const CC_DATA = "https://data.commoncrawl.org";
const CACHE_DIR = join(process.cwd(), ".cache", "cc");

/** Host patterns required by discover:cc. */
export const CC_ATS_URL_PATTERNS: Array<{ ats: Ats; url: string }> = [
  { ats: "greenhouse", url: "boards.greenhouse.io/*" },
  { ats: "greenhouse", url: "job-boards.greenhouse.io/*" },
  { ats: "lever", url: "jobs.lever.co/*" },
  { ats: "ashby", url: "jobs.ashbyhq.com/*" },
];

/**
 * Known CDX byte-ranges from cluster.idx (CC-MAIN-2026-43).
 * Avoids re-downloading the 100MB cluster.idx on every run.
 */
const KNOWN_RANGES: Array<{
  crawlId: string;
  file: string;
  offset: number;
  length: number;
  label: string;
}> = [
  // boards + job-boards greenhouse (merged contiguous blocks)
  {
    crawlId: "CC-MAIN-2026-43",
    file: "cdx-00201.gz",
    offset: 507614066,
    length: 6_349_310,
    label: "gh",
  },
  {
    crawlId: "CC-MAIN-2026-43",
    file: "cdx-00027.gz",
    offset: 164839536,
    length: 282551,
    label: "lever",
  },
  {
    crawlId: "CC-MAIN-2026-43",
    file: "cdx-00037.gz",
    offset: 576524178,
    length: 306984,
    label: "ashby",
  },
];

const FALLBACK_CRAWLS = ["CC-MAIN-2026-43", "CC-MAIN-2026-39"];

const JUNK_SLUGS = new Set(
  [
    "embed", "embeddable", "api", "assets", "static", "www", "jobs", "job",
    "board", "boards", "graphql", "v1", "v2", "v3", "admin", "login", "auth",
    "oauth", "callback", "null", "undefined", "test", "demo", "example",
    "sandbox", "staging", "dev", "cdn", "img", "images", "css", "js", "fonts",
    "favicon", "robots", "sitemap", "health", "status", "docs", "help",
    "support", "careers", "apply",
  ].map((s) => s.toLowerCase()),
);

export interface CcSlugHit {
  ats: Ats;
  slug: string;
  evidenceUrl: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOk(
  url: string,
  opts?: { headers?: Record<string, string>; maxRetries?: number },
): Promise<Response> {
  const maxRetries = opts?.maxRetries ?? 3;
  let attempt = 0;
  while (true) {
    attempt += 1;
    await sleep(150);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "CaniApply/0.1 (+https://github.com/ParthKadam11/CaniApply; research bot)",
          ...(opts?.headers ?? {}),
        },
        signal: AbortSignal.timeout(120_000),
      });
      if (res.status === 503 || res.status === 429 || res.status === 504) {
        if (attempt > maxRetries) {
          throw new HttpError(`CC ${res.status} for ${url}`, res.status);
        }
        await sleep(Math.min(8_000, 1_000 * 2 ** (attempt - 1)));
        continue;
      }
      if (!res.ok) {
        throw new HttpError(
          `CC HTTP ${res.status} for ${url}`,
          res.status,
          (await res.text()).slice(0, 200),
        );
      }
      return res;
    } catch (err) {
      if (attempt > maxRetries) throw err;
      await sleep(Math.min(8_000, 1_000 * 2 ** (attempt - 1)));
    }
  }
}

export async function latestCrawlIds(n = 2): Promise<
  Array<{ id: string; cdxApi: string }>
> {
  try {
    const res = await fetchOk(COLLINFO_URL, { maxRetries: 1 });
    const list = (await res.json()) as Array<{ id?: string; "cdx-api"?: string }>;
    const out: Array<{ id: string; cdxApi: string }> = [];
    for (const row of list ?? []) {
      if (!row.id || !row["cdx-api"]) continue;
      out.push({ id: row.id, cdxApi: row["cdx-api"] });
      if (out.length >= n) break;
    }
    if (out.length > 0) return out;
  } catch (err) {
    console.warn(
      `[discover:cc] collinfo failed, using fallback:`,
      err instanceof Error ? err.message.slice(0, 80) : err,
    );
  }
  return FALLBACK_CRAWLS.slice(0, n).map((id) => ({
    id,
    cdxApi: `https://index.commoncrawl.org/${id}-index`,
  }));
}

export function extractSlugFromAtsUrl(ats: Ats, rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  if (ats === "greenhouse") {
    if (host !== "boards.greenhouse.io" && host !== "job-boards.greenhouse.io") {
      return null;
    }
    return parts[0] ?? null;
  }
  if (ats === "lever") {
    if (host !== "jobs.lever.co") return null;
    return parts[0] ?? null;
  }
  if (ats === "ashby") {
    if (host !== "jobs.ashbyhq.com") return null;
    return parts[0] ?? null;
  }
  return null;
}

export function isJunkSlug(slug: string): boolean {
  const s = slug.trim().toLowerCase();
  if (!s || s.length < 2 || s.length > 80) return true;
  if (JUNK_SLUGS.has(s)) return true;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(s)) return true;
  if (/^\d+$/.test(s)) return true;
  return false;
}

export function humanizeSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 180);
}

export function evidenceUrlFor(ats: Ats, slug: string): string {
  if (ats === "ashby") return `https://jobs.ashbyhq.com/${slug}`;
  if (ats === "lever") return `https://jobs.lever.co/${slug}`;
  return `https://boards.greenhouse.io/${slug}`;
}

export function cdxShardPatterns(): Array<{ ats: Ats; url: string }> {
  return CC_ATS_URL_PATTERNS.flatMap(({ ats, url }) => {
    const host = url.replace(/\/\*$/, "");
    return "abcdefghijklmnopqrstuvwxyz0123456789"
      .split("")
      .map((ch) => ({ ats, url: `${host}/${ch}*` }));
  });
}

/** Inflate concatenated gzip members (multi-block CDX ranges). */
function gunzipMembers(buf: Buffer): string {
  const out: Buffer[] = [];
  let i = 0;
  while (i < buf.length - 1) {
    if (buf[i] !== 0x1f || buf[i + 1] !== 0x8b) {
      i += 1;
      continue;
    }
    try {
      const chunk = gunzipSync(buf.subarray(i));
      out.push(chunk);
      // Advance to next member: try successive magic headers
      let next = -1;
      for (let j = i + 2; j < buf.length - 1; j += 1) {
        if (buf[j] === 0x1f && buf[j + 1] === 0x8b) {
          try {
            gunzipSync(buf.subarray(j));
            next = j;
            break;
          } catch {
            /* keep scanning */
          }
        }
      }
      if (next < 0) break;
      i = next;
    } catch {
      i += 1;
    }
  }
  if (out.length === 0) {
    try {
      return gunzipSync(buf).toString("utf8");
    } catch {
      return "";
    }
  }
  return Buffer.concat(out).toString("utf8");
}

function ingestText(
  text: string,
  into: Map<string, CcSlugHit>,
  stopAt?: number,
): number {
  let added = 0;
  for (const line of text.split("\n")) {
    if (!line) continue;
    const jsonStart = line.indexOf("{");
    if (jsonStart < 0) continue;
    let rawUrl: string | null = null;
    try {
      rawUrl = (JSON.parse(line.slice(jsonStart)) as { url?: string }).url ?? null;
    } catch {
      continue;
    }
    if (!rawUrl) continue;

    let ats: Ats | null = null;
    if (/boards\.greenhouse\.io|job-boards\.greenhouse\.io/i.test(rawUrl)) {
      ats = "greenhouse";
    } else if (/jobs\.lever\.co/i.test(rawUrl)) ats = "lever";
    else if (/jobs\.ashbyhq\.com/i.test(rawUrl)) ats = "ashby";
    if (!ats) continue;

    const slug = extractSlugFromAtsUrl(ats, rawUrl);
    if (!slug || isJunkSlug(slug)) continue;
    const key = `${ats}:${slug.toLowerCase()}`;
    if (into.has(key)) continue;
    into.set(key, {
      ats,
      slug: slug.toLowerCase(),
      evidenceUrl: evidenceUrlFor(ats, slug.toLowerCase()),
    });
    added += 1;
    if (stopAt != null && into.size >= stopAt) break;
  }
  return added;
}

async function loadRange(
  crawlId: string,
  file: string,
  offset: number,
  length: number,
  cacheName: string,
): Promise<Buffer> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, cacheName);
  if (existsSync(cachePath)) {
    console.log(`[discover:cc] cache hit ${cacheName}`);
    return readFileSync(cachePath);
  }
  const url = `${CC_DATA}/cc-index/collections/${crawlId}/indexes/${file}`;
  const end = offset + length - 1;
  console.log(
    `[discover:cc] GET ${file} bytes=${offset}-${end} (${(length / 1e6).toFixed(1)}MB)`,
  );
  const res = await fetchOk(url, {
    headers: { Range: `bytes=${offset}-${end}` },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(cachePath, buf);
  return buf;
}

/**
 * Discover ATS board slugs from Common Crawl (latest crawls via CDX index files).
 * Uses byte-range downloads from data.commoncrawl.org — the public CDX query API
 * is too flaky for bulk wildcard discovery.
 */
export async function discoverCommonCrawlSlugs(options?: {
  crawlCount?: number;
  limit?: number;
  maxPagesPerPattern?: number;
}): Promise<CcSlugHit[]> {
  const limit = options?.limit;
  const crawls = await latestCrawlIds(options?.crawlCount ?? 2);
  console.log(
    `[discover:cc] crawls: ${crawls.map((c) => c.id).join(", ")} (index-file path)`,
  );
  console.log(
    `[discover:cc] patterns: ${CC_ATS_URL_PATTERNS.map((p) => p.url).join(", ")}`,
  );

  const into = new Map<string, CcSlugHit>();

  for (const range of KNOWN_RANGES) {
    if (limit != null && into.size >= limit) break;
    try {
      const buf = await loadRange(
        range.crawlId,
        range.file,
        range.offset,
        range.length,
        `${range.label}.slice.gz`,
      );
      // greenhouse multi-block range needs member-wise inflate; singles too
      let text: string;
      try {
        text = gunzipSync(buf).toString("utf8");
      } catch {
        text = gunzipMembers(buf);
      }
      const added = ingestText(text, into, limit);
      console.log(
        `[discover:cc] ${range.label}: +${added} (total ${into.size})`,
      );
    } catch (err) {
      console.warn(
        `[discover:cc] ${range.label} failed:`,
        err instanceof Error ? err.message.slice(0, 120) : err,
      );
    }
  }

  // Second crawl: only if still under limit (same known offsets often N/A — skip quietly)
  if (limit != null && into.size < limit && crawls.length > 1) {
    console.log(
      `[discover:cc] have ${into.size}/${limit}; primary crawl ranges exhausted`,
    );
  }

  const hits = [...into.values()];
  console.log(`[discover:cc] unique slugs after junk filter: ${hits.length}`);
  return limit != null ? hits.slice(0, limit) : hits;
}

export function hitsToDiscovered(hits: CcSlugHit[]): DiscoveredCompany[] {
  return hits.map((h) => ({
    name: humanizeSlug(h.slug).slice(0, 200),
    domain: null,
    source: "common_crawl" as const,
    evidenceUrl: h.evidenceUrl,
    ats: h.ats,
    atsSlug: h.slug,
  }));
}
