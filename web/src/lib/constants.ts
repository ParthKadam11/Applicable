export const SITE_URL = "https://applicable.click";
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ||
  "https://mcp.applicable.click";
/** MCP Streamable HTTP base (https://mcp.applicable.click). */
export const MCP_URL = API_BASE;
/** Full Streamable HTTP path for clients that require `/mcp`. */
export const MCP_ENDPOINT = `${API_BASE}/mcp`;

export const REVALIDATE_SECONDS = 300;

/** Show GitHub links only when the public repo is intentionally exposed. */
export const GITHUB_PUBLIC =
  process.env.GITHUB_PUBLIC === "1" ||
  process.env.NEXT_PUBLIC_GITHUB_PUBLIC === "1";

export const LINKS = {
  github: "https://github.com/ParthKadam11/Applicable",
  githubProfile: "https://github.com/ParthKadam11",
  x: "https://x.com/parthdot404",
  portfolio: "https://www.parthkadam.tech/",
  earlyAccess: "https://joinwaitlist.parthkadam.tech",
  feedback: "mailto:hello@applicable.click",
  hydradb: "https://www.hydradb.ai",
  chatgpt: "https://chatgpt.com/plugins",
  /** Applicable product socials — only render when set. */
  socialX: process.env.NEXT_PUBLIC_APPLICABLE_X?.trim() || "",
  socialLinkedIn: process.env.NEXT_PUBLIC_APPLICABLE_LINKEDIN?.trim() || "",
} as const;

export const ELIGIBILITY_LABELS: Record<string, string> = {
  open: "Worldwide open",
  india_remote: "India remote",
  india_onsite: "India onsite",
  region_locked: "Region locked",
  unclear: "Unclear",
};

/** Semantic colors - same blue family for “good”, warm/cool contrast for rest */
export const ELIGIBILITY_COLORS: Record<string, string> = {
  open: "#4cc9f0",
  india_remote: "#3d8fd4",
  india_onsite: "#f0b429",
  region_locked: "#e86a6a",
  unclear: "#8fa3b5",
};
