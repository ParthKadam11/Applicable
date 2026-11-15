import { fetchText, HttpError } from "../../utils/http.js";
import { readCache, writeCache, cacheAgeMs } from "../cache.js";
import { extractAboutSections, extractFactsFromText } from "../extract-rules.js";
import type { ExtractedFact } from "../types.js";

const PATHS = ["/", "/about", "/about-us", "/company", "/team", "/careers"];
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type RobotsRules = { disallow: string[] };

function parseRobots(text: string): RobotsRules {
  const disallow: string[] = [];
  let applies = false;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (/^user-agent:\s*\*/i.test(t)) {
      applies = true;
      continue;
    }
    if (/^user-agent:/i.test(t)) {
      applies = false;
      continue;
    }
    if (applies) {
      const m = t.match(/^disallow:\s*(.*)$/i);
      if (m) disallow.push((m[1] ?? "").trim());
    }
  }
  return { disallow };
}

function allowed(path: string, rules: RobotsRules): boolean {
  for (const d of rules.disallow) {
    if (!d) continue;
    if (d === "/") return false;
    if (path.startsWith(d)) return false;
  }
  return true;
}

async function loadRobots(origin: string): Promise<RobotsRules> {
  const key = `${origin}/robots.txt`;
  const cached = readCache<RobotsRules>("robots", key);
  if (cached && cacheAgeMs(cached) < TTL_MS) return cached.value;
  try {
    const text = await fetchText(`${origin}/robots.txt`);
    const rules = parseRobots(text);
    writeCache("robots", key, rules);
    return rules;
  } catch {
    const empty = { disallow: [] };
    writeCache("robots", key, empty);
    return empty;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function enrichFromWebsite(website: string): Promise<{
  facts: ExtractedFact[];
  pagesFetched: number;
  error?: string;
}> {
  let origin: string;
  try {
    const u = new URL(website.startsWith("http") ? website : `https://${website}`);
    origin = u.origin;
  } catch {
    return { facts: [], pagesFetched: 0, error: "invalid_website" };
  }

  const robots = await loadRobots(origin);
  const facts: ExtractedFact[] = [];
  let pagesFetched = 0;

  for (const path of PATHS) {
    if (!allowed(path, robots)) continue;
    const url = `${origin}${path === "/" ? "" : path}`;
    const cacheKey = url;
    const cached = readCache<string>("website", cacheKey);
    let html: string;
    if (cached && cacheAgeMs(cached) < TTL_MS) {
      html = cached.value;
    } else {
      try {
        // Enrichment budget: ≥1s between live host hits (http util also delays).
        await new Promise((r) => setTimeout(r, 500));
        html = await fetchText(url);
        writeCache("website", cacheKey, html);
        pagesFetched += 1;
      } catch (err) {
        if (err instanceof HttpError && err.status === 404) continue;
        continue;
      }
    }
    const text = extractAboutSections(stripHtml(html));
    facts.push(
      ...extractFactsFromText({
        text,
        sourceUrl: url,
        sourceKind: "website",
      }),
    );
  }

  return { facts, pagesFetched };
}
