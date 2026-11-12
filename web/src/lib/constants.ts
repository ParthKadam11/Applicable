export const SITE_URL = "https://caniapply.parthkadam.tech";
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ||
  "https://mcp.parthkadam.tech";
export const MCP_URL = `${API_BASE}/mcp`;

export const REVALIDATE_SECONDS = 300;

export const LINKS = {
  github: "https://github.com/ParthKadam11/CaniApply",
  githubProfile: "https://github.com/ParthKadam11",
  x: "https://x.com/parthdot404",
  portfolio: "https://www.parthkadam.tech/",
} as const;

export const ELIGIBILITY_LABELS: Record<string, string> = {
  open: "Worldwide open",
  india_remote: "India remote",
  india_onsite: "India onsite",
  region_locked: "Region locked",
  unclear: "Unclear",
};

export const ELIGIBILITY_COLORS: Record<string, string> = {
  open: "#34d399",
  india_remote: "#2dd4bf",
  india_onsite: "#a3e635",
  region_locked: "#fb7185",
  unclear: "#a1a1aa",
};
