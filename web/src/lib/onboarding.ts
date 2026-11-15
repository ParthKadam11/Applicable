/** localStorage fallback when DB flag isn’t available yet. */
export const ONBOARDING_LS_KEY = "applicable_onboarding_seen";

/** CustomEvent name — dashboard sidebar / avatar reopen. */
export const ONBOARDING_OPEN_EVENT = "applicable:onboarding-open";

export function readOnboardingLocal(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeOnboardingLocal(): void {
  try {
    window.localStorage.setItem(ONBOARDING_LS_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function openOnboardingModal(trigger?: HTMLElement | null): void {
  window.dispatchEvent(
    new CustomEvent(ONBOARDING_OPEN_EVENT, {
      detail: { trigger: trigger ?? null },
    }),
  );
}

export const SAMPLE_PROMPT =
  "Find entry-level backend jobs I can do remotely from India";

export const MCP_ONBOARDING_URL = "https://mcp.applicable.click";

export type OnboardingClientId =
  | "instinct"
  | "cline"
  | "cursor"
  | "claude"
  | "codex";

export const ONBOARDING_CLIENTS: Array<{
  id: OnboardingClientId;
  label: string;
  tier: "free" | "pro";
  howTo: string[];
}> = [
  {
    id: "instinct",
    label: "Instinct",
    tier: "free",
    howTo: [
      "Copy the MCP link above.",
      "Open Instinct → Settings → MCP connections.",
      "Paste the URL and save, then ask by text or call.",
    ],
  },
  {
    id: "cline",
    label: "Cline",
    tier: "free",
    howTo: [
      "Copy the MCP link.",
      "In VS Code / Cline, add a remote MCP server.",
      "Paste https://mcp.applicable.click and enable it.",
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    tier: "pro",
    howTo: [
      "Copy the MCP link.",
      "Cursor → Settings → MCP → Add server.",
      "Paste the URL, confirm, then ask for India-remote roles.",
    ],
  },
  {
    id: "claude",
    label: "Claude",
    tier: "pro",
    howTo: [
      "Copy the MCP link.",
      "Claude → Customize → Connectors → Add custom connector.",
      "Paste the URL and confirm Applicable.",
    ],
  },
  {
    id: "codex",
    label: "Codex",
    tier: "pro",
    howTo: [
      "Copy the MCP link.",
      "ChatGPT Plugins → Add custom MCP server.",
      "Paste the URL, create the plugin, then use it in Codex.",
    ],
  },
];
