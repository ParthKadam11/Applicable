/** Real brand assets in /public - paths for next/image */

export const AGENT_LOGOS = {
  claude: "/claudecode.jpg",
  codex: "/Codex.jpg",
  cursor: "/cursor.png",
  windsurf: "/windsurf.png",
  cline: "/cline.png",
  chatgpt: "/chatgpt.jpg",
  grok: "/grokbot.webp",
  mcp: "/mcp.png",
} as const;

export type AgentLogoId = keyof typeof AGENT_LOGOS;
