/** Hostname from a company website URL. */
export function hostnameFromWebsite(website: string | null | undefined): string | null {
  if (!website?.trim()) return null;
  try {
    const raw = website.includes("://") ? website : `https://${website}`;
    const host = new URL(raw).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Well-known name → domain when website is missing (fallbacks / old API). */
const KNOWN_DOMAINS: Record<string, string> = {
  linear: "linear.app",
  vercel: "vercel.com",
  notion: "notion.so",
  stripe: "stripe.com",
  figma: "figma.com",
  cloudflare: "cloudflare.com",
  github: "github.com",
  gitlab: "gitlab.com",
  shopify: "shopify.com",
  airbnb: "airbnb.com",
  dropbox: "dropbox.com",
  slack: "slack.com",
  discord: "discord.com",
  spotify: "spotify.com",
  netflix: "netflix.com",
  uber: "uber.com",
  lyft: "lyft.com",
  twilio: "twilio.com",
  datadog: "datadoghq.com",
  snowflake: "snowflake.com",
  databricks: "databricks.com",
  openai: "openai.com",
  anthropic: "anthropic.com",
  google: "google.com",
  meta: "meta.com",
  microsoft: "microsoft.com",
  amazon: "amazon.com",
  apple: "apple.com",
  adobe: "adobe.com",
  atlassian: "atlassian.com",
  asana: "asana.com",
  canva: "canva.com",
  coinbase: "coinbase.com",
  robinhood: "robinhood.com",
  plaid: "plaid.com",
  ramp: "ramp.com",
  brex: "brex.com",
  rippling: "rippling.com",
  "scale ai": "scale.com",
  scale: "scale.com",
  gusto: "gusto.com",
  airtable: "airtable.com",
  segment: "segment.com",
  mixpanel: "mixpanel.com",
  amplitude: "amplitude.com",
  webflow: "webflow.com",
  retool: "retool.com",
  zapier: "zapier.com",
  loom: "loom.com",
  instacart: "instacart.com",
  doordash: "doordash.com",
  reddit: "reddit.com",
  docker: "docker.com",
  huggingface: "huggingface.co",
  "hugging face": "huggingface.co",
  hashicorp: "hashicorp.com",
  mongodb: "mongodb.com",
  elastic: "elastic.co",
  redis: "redis.io",
  supabase: "supabase.com",
  neon: "neon.tech",
  planetscale: "planetscale.com",
  replit: "replit.com",
  cursor: "cursor.com",
};

/** Resolve a logo hostname from website and/or company name. */
export function companyLogoDomain(
  company: string,
  website?: string | null,
): string | null {
  const fromSite = hostnameFromWebsite(website);
  if (fromSite) return fromSite;

  const key = company.trim().toLowerCase();
  if (!key) return null;
  if (KNOWN_DOMAINS[key]) return KNOWN_DOMAINS[key];

  const slug = key.replace(/[^a-z0-9]+/g, "");
  if (slug.length >= 2) return `${slug}.com`;
  return null;
}

/** High-res company mark via unavatar (Clearbit + others). */
export function companyLogoUrl(domain: string): string {
  return `https://unavatar.io/${encodeURIComponent(domain)}?fallback=false`;
}
