import type { Ats } from "../../ats/types.js";
import { isBlocked, loadBlocklist } from "../blocklist.js";
import { evaluateIndustryFilter } from "../industry-filter.js";
import { countOpenJobs } from "../probe-ats.js";
import type { DiscoveredCompany } from "../types.js";

/**
 * Companies known for intern / new-grad / junior hiring with public ATS boards.
 * Probe verifies each board before upsert; blocklist + industry filter apply.
 */
const SEED: Array<{
  name: string;
  website?: string;
  ats?: Ats;
  slug: string;
}> = [
  // Remote-first / well-known early-career boards
  { name: "Stripe", website: "https://stripe.com", ats: "greenhouse", slug: "stripe" },
  { name: "Cloudflare", website: "https://www.cloudflare.com", ats: "greenhouse", slug: "cloudflare" },
  { name: "Datadog", website: "https://www.datadoghq.com", ats: "greenhouse", slug: "datadog" },
  { name: "Notion", website: "https://www.notion.so", ats: "ashby", slug: "notion" },
  { name: "Figma", website: "https://www.figma.com", ats: "greenhouse", slug: "figma" },
  { name: "Vercel", website: "https://vercel.com", ats: "ashby", slug: "vercel" },
  { name: "Linear", website: "https://linear.app", ats: "ashby", slug: "linear" },
  { name: "Ramp", website: "https://ramp.com", ats: "ashby", slug: "ramp" },
  { name: "Rippling", website: "https://www.rippling.com", ats: "ashby", slug: "rippling" },
  { name: "Scale AI", website: "https://scale.com", ats: "greenhouse", slug: "scaleai" },
  { name: "Anthropic", website: "https://www.anthropic.com", ats: "ashby", slug: "anthropic" },
  { name: "OpenAI", website: "https://openai.com", ats: "ashby", slug: "openai" },
  { name: "Shopify", website: "https://www.shopify.com", ats: "greenhouse", slug: "shopify" },
  { name: "GitLab", website: "https://about.gitlab.com", ats: "greenhouse", slug: "gitlab" },
  { name: "HashiCorp", website: "https://www.hashicorp.com", ats: "greenhouse", slug: "hashicorp" },
  // India / APAC-heavy tech
  { name: "Razorpay", website: "https://razorpay.com", ats: "greenhouse", slug: "razorpay" },
  { name: "Postman", website: "https://www.postman.com", ats: "greenhouse", slug: "postman" },
  { name: "Freshworks", website: "https://www.freshworks.com", ats: "greenhouse", slug: "freshworks" },
  { name: "BrowserStack", website: "https://www.browserstack.com", ats: "greenhouse", slug: "browserstack" },
  { name: "Chargebee", website: "https://www.chargebee.com", ats: "greenhouse", slug: "chargebee" },
  { name: "Hasura", website: "https://hasura.io", ats: "ashby", slug: "hasura" },
  { name: "Zoho", website: "https://www.zoho.com", ats: "smartrecruiters", slug: "Zoho" },
  { name: "Thoughtworks", website: "https://www.thoughtworks.com", ats: "greenhouse", slug: "thoughtworks" },
  { name: "Atlassian", website: "https://www.atlassian.com", ats: "greenhouse", slug: "atlassian" },
  { name: "Grab", website: "https://www.grab.com", ats: "greenhouse", slug: "grab" },
  { name: "GoTo", website: "https://www.goto.com", ats: "greenhouse", slug: "goto" },
  { name: "CRED", website: "https://cred.club", ats: "lever", slug: "cred" },
  { name: "PhonePe", website: "https://www.phonepe.com", ats: "lever", slug: "phonepe" },
  { name: "Swiggy", website: "https://www.swiggy.com", ats: "smartrecruiters", slug: "Swiggy" },
  { name: "Juspay", website: "https://juspay.in", ats: "lever", slug: "juspay" },
  { name: "Cashfree Payments", website: "https://www.cashfree.com", ats: "greenhouse", slug: "cashfree" },
  { name: "Plum", website: "https://www.plumhq.com", ats: "lever", slug: "plum" },
  { name: "Dukaan", website: "https://dukaan.io", ats: "lever", slug: "dukaan" },
  { name: "Smallcase", website: "https://www.smallcase.com", ats: "lever", slug: "smallcase" },
  { name: "Whatfix", website: "https://whatfix.com", ats: "greenhouse", slug: "whatfix" },
  { name: "CleverTap", website: "https://clevertap.com", ats: "greenhouse", slug: "clevertap" },
];

function careersUrl(ats: Ats, slug: string): string {
  if (ats === "ashby") return `https://jobs.ashbyhq.com/${slug}`;
  if (ats === "greenhouse") return `https://boards.greenhouse.io/${slug}`;
  if (ats === "lever") return `https://jobs.lever.co/${slug}`;
  return `https://jobs.smartrecruiters.com/${slug}`;
}

export type SeedProbeResult = {
  name: string;
  slug: string;
  ats: Ats;
  ok: boolean;
  jobCount: number | null;
  reason?: string;
};

/** Probe seed boards; return verified discoveries + rejection report. */
export async function probeEarlyCareerSeed(): Promise<{
  discovered: DiscoveredCompany[];
  report: SeedProbeResult[];
}> {
  const blocklist = loadBlocklist();
  const discovered: DiscoveredCompany[] = [];
  const report: SeedProbeResult[] = [];

  for (const row of SEED) {
    const ats = row.ats ?? "greenhouse";
    const industry = evaluateIndustryFilter({
      name: row.name,
      domain: row.website?.replace(/^https?:\/\//, ""),
      atsSlug: row.slug,
    });
    if (!industry.ok) {
      report.push({
        name: row.name,
        slug: row.slug,
        ats,
        ok: false,
        jobCount: null,
        reason: industry.reason,
      });
      continue;
    }
    if (
      isBlocked(blocklist, {
        name: row.name,
        domain: row.website,
        atsSlug: row.slug,
      })
    ) {
      report.push({
        name: row.name,
        slug: row.slug,
        ats,
        ok: false,
        jobCount: null,
        reason: "blocklisted",
      });
      continue;
    }

    let jobCount: number | null = null;
    try {
      jobCount = await countOpenJobs(ats, row.slug);
    } catch (err) {
      report.push({
        name: row.name,
        slug: row.slug,
        ats,
        ok: false,
        jobCount: null,
        reason: `probe error: ${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`,
      });
      continue;
    }

    if (jobCount == null || jobCount < 1) {
      report.push({
        name: row.name,
        slug: row.slug,
        ats,
        ok: false,
        jobCount,
        reason: jobCount == null ? "board unreachable" : "0 open jobs",
      });
      continue;
    }

    report.push({
      name: row.name,
      slug: row.slug,
      ats,
      ok: true,
      jobCount,
    });
    discovered.push({
      name: row.name,
      domain: row.website
        ? row.website.replace(/^https?:\/\//, "").replace(/\/$/, "")
        : null,
      source: "early_career_seed",
      evidenceUrl: careersUrl(ats, row.slug),
      ats,
      atsSlug: row.slug,
      earlyCareer: true,
      priorityGeo: /india|razorpay|postman|freshworks|browserstack|chargebee|hasura|zoho|cred|phonepe|swiggy|juspay|cashfree|plum|dukaan|smallcase|whatfix|clevertap|thoughtworks|grab/i.test(
        row.name,
      ),
    });
  }

  return { discovered, report };
}

export async function discoverEarlyCareerSeed(): Promise<DiscoveredCompany[]> {
  const { discovered, report } = await probeEarlyCareerSeed();
  const ok = report.filter((r) => r.ok).length;
  const bad = report.filter((r) => !r.ok);
  console.log(
    `[discover:early_career_seed] verified=${ok} rejected=${bad.length}`,
  );
  for (const r of bad.slice(0, 20)) {
    console.log(`  reject ${r.name} (${r.ats}/${r.slug}): ${r.reason}`);
  }
  return discovered;
}
