import { fetchText, HttpError } from "../../utils/http.js";
import { cacheAgeMs, readCache, writeCache } from "../cache.js";
import { assertFactEvidence } from "../evidence.js";
import type { ExtractedFact } from "../types.js";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const YC_ORIGIN = "https://www.ycombinator.com";

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

function pathAllowed(path: string, rules: RobotsRules): boolean {
  for (const d of rules.disallow) {
    if (!d) continue;
    if (d === "/") return false;
    if (path.startsWith(d)) return false;
  }
  return true;
}

async function ycRobotsAllowed(path: string): Promise<boolean> {
  const key = `${YC_ORIGIN}/robots.txt`;
  const cached = readCache<RobotsRules>("robots", key);
  let rules: RobotsRules;
  if (cached && cacheAgeMs(cached) < TTL_MS) {
    rules = cached.value;
  } else {
    try {
      const text = await fetchText(key);
      rules = parseRobots(text);
      writeCache("robots", key, rules);
    } catch {
      rules = { disallow: [] };
      writeCache("robots", key, rules);
    }
  }
  return pathAllowed(path, rules);
}

type YcFounder = {
  full_name?: string;
  title?: string;
  linkedin_url?: string | null;
};

type YcPageCompany = {
  slug?: string;
  name?: string;
  founders?: YcFounder[];
};

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Parse React `data-page` JSON blob from ycombinator.com/companies/<slug>. */
export function parseYcCompanyPage(html: string): YcPageCompany | null {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m?.[1]) return null;
  try {
    const json = JSON.parse(decodeHtmlEntities(m[1]!)) as {
      props?: { company?: YcPageCompany };
    };
    return json.props?.company ?? null;
  } catch {
    return null;
  }
}

export async function enrichFoundersFromYcPage(ycSlug: string): Promise<{
  facts: ExtractedFact[];
  error?: string;
}> {
  const path = `/companies/${ycSlug}`;
  const url = `${YC_ORIGIN}${path}`;
  if (!(await ycRobotsAllowed(path))) {
    return { facts: [], error: "robots_disallow" };
  }

  const cached = readCache<string>("yc-page", url);
  let html: string;
  if (cached && cacheAgeMs(cached) < TTL_MS) {
    html = cached.value;
  } else {
    try {
      // ≥1 req/s to ycombinator.com (http util also delays)
      await new Promise((r) => setTimeout(r, 1000));
      html = await fetchText(url);
      writeCache("yc-page", url, html);
    } catch (err) {
      const msg =
        err instanceof HttpError
          ? `http_${err.status}`
          : err instanceof Error
            ? err.message.slice(0, 80)
            : "fetch_failed";
      return { facts: [], error: msg };
    }
  }

  const company = parseYcCompanyPage(html);
  if (!company?.founders?.length) {
    return { facts: [], error: "no_founders_in_page" };
  }

  const facts: ExtractedFact[] = [];
  for (const f of company.founders) {
    const name = f.full_name?.trim();
    if (!name || name.split(/\s+/).length < 2) continue;
    const title = (f.title ?? "Founder").trim();
    // Quote must appear as substring of fetched HTML (name is in the page)
    if (!assertFactEvidence({ quote: name, sourceUrl: url, sourceText: html })) {
      continue;
    }
    facts.push({
      factType: "founder",
      value: name,
      sourceUrl: url,
      quote: name,
      sourceKind: "yc_page",
      confidence: 1,
      role: "founded",
      title,
      linkedin: f.linkedin_url?.trim() || undefined,
    });
  }
  return { facts };
}
