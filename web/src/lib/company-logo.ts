/** Hostname from a company website URL. */
export function hostnameFromWebsite(website: string | null | undefined): string | null {
  if (!website?.trim()) return null;
  try {
    const raw = website.includes("://") ? website : `https://${website}`;
    const host = new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    if (!host || isPlaceholderHost(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function isPlaceholderHost(host: string): boolean {
  return (
    host === "example.com" ||
    host === "example.invalid" ||
    host.endsWith(".example") ||
    host === "localhost" ||
    host === "invalid"
  );
}

/**
 * Well-known name → domain when website is missing / placeholder.
 * Keep lowercase keys; multi-word names included.
 */
export const KNOWN_DOMAINS: Record<string, string> = {
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
  scaleai: "scale.com",
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
  // Recently promoted / discovery fills with example.com
  tailscale: "tailscale.com",
  cresta: "cresta.com",
  jamf: "jamf.com",
  quince: "quince.com",
  salesloft: "salesloft.com",
  mento: "mento.co",
  pragmatike: "pragmatike.com",
  alten: "alten.com",
  beigene: "beigene.com",
  berlitz: "berlitz.com",
  roadrunner: "roadrunner.ai",
  thoughtworks: "thoughtworks.com",
  harvey: "harvey.ai",
  "lemon.io": "lemon.io",
  "lemon io": "lemon.io",
  lemonio: "lemon.io",
  posthog: "posthog.com",
  grafana: "grafana.com",
  metabase: "metabase.com",
  sourcegraph: "sourcegraph.com",
  modal: "modal.com",
  diagrid: "diagrid.io",
  razorpay: "razorpay.com",
  postman: "postman.com",
  freshworks: "freshworks.com",
  browserstack: "browserstack.com",
  chargebee: "chargebee.com",
  hasura: "hasura.io",
  clevertap: "clevertap.com",
  whatfix: "whatfix.com",
  cashfree: "cashfree.com",
  "cashfree payments": "cashfree.com",
  swiggy: "swiggy.com",
  cred: "cred.club",
  phonepe: "phonepe.com",
  juspay: "juspay.in",
  dukaan: "dukaan.io",
  smallcase: "smallcase.com",
  plum: "plumhq.com",
  wrapbook: "wrapbook.com",
  voltus: "voltus.co",
  pebl: "pebl.com",
  pencil: "pencil.dev",
  onebrief: "onebrief.com",
  freedompay: "freedompay.com",
  certik: "certik.com",
  apryse: "apryse.com",
  deuna: "deuna.com",
  yuno: "yuno.com",
  rain: "rain.xyz",
  wagmo: "wagmo.io",
  magiceden: "magiceden.io",
  "tessera labs": "tesseralabs.com",
  tessera: "tesseralabs.com",
};

/** Resolve a logo hostname from website and/or company name. */
export function companyLogoDomain(
  company: string,
  website?: string | null,
): string | null {
  const key = company.trim().toLowerCase();
  const known = key ? KNOWN_DOMAINS[key] : null;

  const fromSite = hostnameFromWebsite(website);
  // Prefer a known real domain over placeholder / wrong example.com sites.
  if (fromSite && !isPlaceholderHost(fromSite)) {
    // If website is a generic CDN/ATS host, still prefer known brand domain.
    if (known && isAtsOrGenericHost(fromSite)) return known;
    return fromSite;
  }

  if (known) return known;

  if (!key) return null;
  const slug = key.replace(/[^a-z0-9]+/g, "");
  if (slug.length >= 2) return `${slug}.com`;
  return null;
}

function isAtsOrGenericHost(host: string): boolean {
  return (
    host.includes("ashbyhq.com") ||
    host.includes("greenhouse.io") ||
    host.includes("lever.co") ||
    host.includes("smartrecruiters.com") ||
    host.includes("workable.com") ||
    host === "example.com"
  );
}

/** Ordered logo CDN candidates — first that loads wins in the UI. */
export function companyLogoCandidates(domain: string): string[] {
  const d = encodeURIComponent(domain);
  return [
    `https://unavatar.io/${d}?fallback=false`,
    `https://www.google.com/s2/favicons?domain=${d}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${d}.ico`,
  ];
}

/** High-res company mark via unavatar (Clearbit + others). */
export function companyLogoUrl(domain: string): string {
  return companyLogoCandidates(domain)[0]!;
}
