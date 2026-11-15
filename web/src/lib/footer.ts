import { GITHUB_PUBLIC, LINKS, MCP_ENDPOINT, SITE_URL } from "./constants";
import { claudeConnectorHref, cursorInstallHref } from "./mcp-install";

export type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

export const FOOTER_TAGLINE =
  "Remote jobs that actually hire from India, with proof from every posting.";

export const FOOTER_PRODUCT: FooterLink[] = [
  { label: "Browse jobs", href: "/dashboard/jobs" },
  { label: "Companies", href: "/dashboard/companies" },
  { label: "Add to your AI", href: "/#mcp" },
  { label: "Early access", href: LINKS.earlyAccess, external: true },
];

export const FOOTER_AGENTS: FooterLink[] = [
  { label: "Claude", href: claudeConnectorHref(), external: true },
  { label: "Cursor", href: cursorInstallHref(), external: true },
  {
    label: "ChatGPT (developer mode)",
    href: LINKS.chatgpt,
    external: true,
  },
  { label: "Any MCP client", href: "/#mcp" },
];

export function footerResources(): FooterLink[] {
  const links: FooterLink[] = [
    { label: "How it works", href: "/#how" },
    { label: "Labels explained", href: "/labels" },
  ];
  if (GITHUB_PUBLIC) {
    links.push({ label: "GitHub", href: LINKS.github, external: true });
  }
  links.push({ label: "Blog", href: "/blog" });
  return links;
}

export function footerConnect(): FooterLink[] {
  const links: FooterLink[] = [];
  if (LINKS.socialX) {
    links.push({ label: "X", href: LINKS.socialX, external: true });
  }
  if (LINKS.socialLinkedIn) {
    links.push({
      label: "LinkedIn",
      href: LINKS.socialLinkedIn,
      external: true,
    });
  }
  if (links.length === 0) {
    links.push({ label: "Feedback", href: LINKS.feedback });
  }
  return links;
}

export const FOOTER_MCP_ENDPOINT = MCP_ENDPOINT;

export const FOOTER_ATS_LINE =
  "Jobs sourced live from public ATS boards (Ashby, Greenhouse, Lever, SmartRecruiters)";

/** Relative “Last updated X min ago” from an ISO timestamp; null if unknown. */
export function formatLastUpdatedAgo(
  iso: string | null | undefined,
  nowMs = Date.now(),
): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.round((nowMs - t) / 60_000));
  if (mins < 1) return "Last updated just now";
  if (mins === 1) return "Last updated 1 min ago";
  if (mins < 60) return `Last updated ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs === 1) return "Last updated 1 hr ago";
  if (hrs < 48) return `Last updated ${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "Last updated 1 day ago" : `Last updated ${days} days ago`;
}

export const FOOTER_SITE = SITE_URL;
