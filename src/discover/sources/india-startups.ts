import type { Ats } from "../../ats/types.js";
import { fetchJson } from "../../utils/http.js";
import { domainFromUrl } from "../ats-urls.js";
import { isIndiaLocationText } from "../india-location.js";
import { countOpenJobs } from "../probe-ats.js";
import type { DiscoveredCompany } from "../types.js";

/**
 * Well-known Indian / India-HQ startups that commonly use Ashby/Greenhouse/Lever.
 * Names + optional preferred slug; probe fills ATS.
 */
const KNOWN_INDIA: Array<{
  name: string;
  website?: string;
  slugHints?: string[];
}> = [
  { name: "Razorpay", website: "https://razorpay.com", slugHints: ["razorpay"] },
  { name: "Postman", website: "https://www.postman.com", slugHints: ["postman"] },
  { name: "Freshworks", website: "https://www.freshworks.com", slugHints: ["freshworks"] },
  { name: "BrowserStack", website: "https://www.browserstack.com", slugHints: ["browserstack"] },
  { name: "Chargebee", website: "https://www.chargebee.com", slugHints: ["chargebee"] },
  { name: "Hasura", website: "https://hasura.io", slugHints: ["hasura"] },
  { name: "CleverTap", website: "https://clevertap.com", slugHints: ["clevertap"] },
  { name: "Yellow.ai", website: "https://yellow.ai", slugHints: ["yellowai", "yellow"] },
  { name: "Slice", website: "https://sliceit.com", slugHints: ["slice", "sliceit"] },
  { name: "CRED", website: "https://cred.club", slugHints: ["cred"] },
  { name: "PhonePe", website: "https://www.phonepe.com", slugHints: ["phonepe"] },
  { name: "Swiggy", website: "https://www.swiggy.com", slugHints: ["swiggy"] },
  { name: "Zomato", website: "https://www.zomato.com", slugHints: ["zomato"] },
  { name: "Flipkart", website: "https://www.flipkart.com", slugHints: ["flipkart"] },
  { name: "ShareChat", website: "https://sharechat.com", slugHints: ["sharechat"] },
  { name: "Dream11", website: "https://www.dream11.com", slugHints: ["dream11"] },
  { name: "Unacademy", website: "https://unacademy.com", slugHints: ["unacademy"] },
  { name: "Urban Company", website: "https://www.urbancompany.com", slugHints: ["urbancompany", "urbanclap"] },
  { name: "NoBroker", website: "https://www.nobroker.in", slugHints: ["nobroker"] },
  { name: "Livspace", website: "https://www.livspace.com", slugHints: ["livspace"] },
  { name: "Whatfix", website: "https://whatfix.com", slugHints: ["whatfix"] },
  { name: "Delhivery", website: "https://www.delhivery.com", slugHints: ["delhivery"] },
  { name: "Pine Labs", website: "https://www.pinelabs.com", slugHints: ["pinelabs"] },
  { name: "Juspay", website: "https://juspay.in", slugHints: ["juspay"] },
  { name: "Cashfree Payments", website: "https://www.cashfree.com", slugHints: ["cashfree"] },
  { name: "Drip Capital", website: "https://dripcapital.com", slugHints: ["dripcapital"] },
  { name: "Leena AI", website: "https://www.leena.ai", slugHints: ["leenaai", "leena"] },
  { name: "Weekday", website: "https://weekday.works", slugHints: ["weekday"] },
  { name: "Zuddl", website: "https://www.zuddl.com", slugHints: ["zuddl"] },
  { name: "Inito", website: "https://www.inito.com", slugHints: ["inito"] },
  { name: "PrimeVault", website: "https://www.primevault.com", slugHints: ["primevault"] },
  { name: "ShortLoop", website: "https://shortloop.dev", slugHints: ["shortloop"] },
  { name: "Bolna AI", website: "https://bolna.ai", slugHints: ["bolna", "bolnaai"] },
  { name: "Landeed", website: "https://www.landeed.com", slugHints: ["landeed"] },
  { name: "Vahan", website: "https://vahan.ai", slugHints: ["vahan"] },
  { name: "Adalat AI", website: "https://adalat.ai", slugHints: ["adalat", "adalatai"] },
  { name: "AlgoTest", website: "https://algotest.in", slugHints: ["algotest"] },
  { name: "Plum", website: "https://www.plumhq.com", slugHints: ["plum", "plumhq"] },
  { name: "Dukaan", website: "https://dukaan.io", slugHints: ["dukaan"] },
  { name: "Setu", website: "https://setu.co", slugHints: ["setu"] },
  { name: "Smallcase", website: "https://www.smallcase.com", slugHints: ["smallcase"] },
];

const PROBE_ORDER: Ats[] = [
  "ashby",
  "greenhouse",
  "lever",
  "smartrecruiters",
  "workable",
];

function careersUrl(ats: Ats, slug: string): string {
  if (ats === "ashby") return `https://jobs.ashbyhq.com/${slug}`;
  if (ats === "greenhouse") return `https://boards.greenhouse.io/${slug}`;
  if (ats === "lever") return `https://jobs.lever.co/${slug}`;
  if (ats === "workable") return `https://apply.workable.com/${slug}`;
  return `https://jobs.smartrecruiters.com/${slug}`;
}

interface YcOssCompany {
  name?: string;
  website?: string;
  slug?: string;
  all_locations?: string;
  regions?: string[];
  isHiring?: boolean;
  industries?: string[];
  tags?: string[];
  subindustry?: string;
  industry?: string;
}

/** YC OSS hiring companies with India locations/regions. */
export async function discoverYcIndia(): Promise<DiscoveredCompany[]> {
  const data = await fetchJson<YcOssCompany[]>(
    "https://yc-oss.github.io/api/companies/hiring.json",
  );
  const out: DiscoveredCompany[] = [];
  for (const c of Array.isArray(data) ? data : []) {
    if (!c.name?.trim()) continue;
    const locs = c.all_locations ?? "";
    const regions = (c.regions ?? []).join(", ");
    if (!isIndiaLocationText(locs, regions)) continue;
    out.push({
      name: c.name.trim(),
      domain: domainFromUrl(c.website),
      source: "yc_india",
      evidenceUrl: c.website ?? null,
      industries: c.industries ?? [],
      tags: c.tags ?? [],
      subindustry: c.subindustry ?? null,
    });
  }
  console.log(`[discover:yc_india] India-located YC hiring: ${out.length}`);
  return out;
}

async function resolveBoard(
  slugHints: string[],
): Promise<{ ats: Ats; atsSlug: string; url: string; jobCount: number } | null> {
  for (const slug of slugHints) {
    for (const ats of PROBE_ORDER) {
      try {
        const n = await countOpenJobs(ats, slug);
        if (n == null) continue;
        return { ats, atsSlug: slug, url: careersUrl(ats, slug), jobCount: n };
      } catch {
        // keep probing
      }
    }
  }
  return null;
}

/** Probe known India startups against Ashby/GH/Lever/SR/Workable boards. */
export async function discoverIndiaStartups(): Promise<DiscoveredCompany[]> {
  const out: DiscoveredCompany[] = [];
  let resolved = 0;
  for (const co of KNOWN_INDIA) {
    const hints = co.slugHints ?? [
      co.name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
    ];
    const hit = await resolveBoard(hints);
    if (hit) {
      out.push({
        name: co.name,
        domain: domainFromUrl(co.website ?? null),
        source: "india_startups",
        evidenceUrl: hit.url,
        ats: hit.ats,
        atsSlug: hit.atsSlug,
      });
      resolved += 1;
    } else {
      out.push({
        name: co.name,
        domain: domainFromUrl(co.website ?? null),
        source: "india_startups",
        evidenceUrl: co.website ?? null,
      });
    }
  }
  console.log(
    `[discover:india_startups] probed ${KNOWN_INDIA.length}, boards resolved ${resolved}`,
  );
  return out;
}
