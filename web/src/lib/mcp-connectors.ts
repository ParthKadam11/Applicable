import { MCP_URL } from "./constants";
import {
  chatgptPluginsHref,
  claudeConnectorHref,
  cursorInstallHref,
  grokHref,
  instinctHref,
  vscodeInstallHref,
  windsurfMcpHref,
} from "./mcp-install";
import type { ConnectGuide } from "@/components/connect-sheet";

export type ConnectorCta =
  | {
      kind: "deeplink";
      label: string;
      href: string;
    }
  | {
      kind: "copy-then-open";
      label: string;
      openUrl: string;
      openLabel: string;
    }
  | { kind: "copy-only"; label: string };

export type ConnectorDef = {
  id: string;
  label: string;
  headline: string;
  body: string;
  tag: string;
  /** Desktop primary action */
  cta: ConnectorCta;
  stepsDesktop: string[];
  /** Mobile sheet content — always copy-first */
  mobile: ConnectGuide;
};

export const CONNECTORS: ConnectorDef[] = [
  {
    id: "claude",
    label: "Claude",
    headline: "Add Applicable to Claude",
    body: "On desktop, opens Claude’s connector dialog prefilled. On phones, we copy the endpoint and walk you through Safari — the Claude app can’t add custom connectors.",
    tag: "Web + iOS",
    cta: {
      kind: "deeplink",
      label: "Add to Claude",
      href: claudeConnectorHref(),
    },
    stepsDesktop: [
      "Click Add to Claude (prefilled).",
      "Confirm the connector.",
      "Ask for India-remote roles.",
    ],
    mobile: {
      id: "claude",
      label: "Claude",
      preferSafari: true,
      browserUrl: claudeConnectorHref(),
      browserLabel: "Open Claude in Safari / Chrome",
      steps: [
        "Endpoint is copied. Keep this sheet open.",
        "Tap Open Claude in Safari / Chrome (not the Claude app).",
        "If prompted, Add custom connector → confirm Applicable.",
        "Then open the Claude app — the connector syncs under Connectors.",
      ],
      tip: "If the Claude app steals the link, leave the app, reopen Safari, and paste claude.ai/customize/connectors in the address bar.",
    },
  },
  {
    id: "codex",
    label: "Codex",
    headline: "Wire Applicable into Codex",
    body: "Copy the endpoint, open ChatGPT Plugins, add a custom MCP server, paste. Same flow on phone browsers.",
    tag: "Copy + paste",
    cta: {
      kind: "copy-then-open",
      label: "Copy endpoint",
      openUrl: chatgptPluginsHref(),
      openLabel: "Open Plugins",
    },
    stepsDesktop: [
      "Copy the endpoint.",
      "Open Plugins → Add custom MCP server.",
      "Paste the URL and create the plugin.",
    ],
    mobile: {
      id: "codex",
      label: "Codex",
      preferSafari: true,
      browserUrl: chatgptPluginsHref(),
      browserLabel: "Open ChatGPT Plugins in browser",
      steps: [
        "Endpoint is copied.",
        "Open Plugins in Safari/Chrome (signed into the same account).",
        "Add custom MCP server → paste → create.",
        "Use @Applicable (or your plugin name) in chat / Codex.",
      ],
    },
  },
  {
    id: "cursor",
    label: "Cursor",
    headline: "Install Applicable in Cursor",
    body: "Desktop one-click install. On phones we only copy the URL — finish in Cursor on your computer.",
    tag: "Desktop",
    cta: {
      kind: "deeplink",
      label: "Add to Cursor",
      href: cursorInstallHref(),
    },
    stepsDesktop: [
      "Click Add to Cursor.",
      "Confirm Install in Cursor.",
      "Ask for india_remote jobs.",
    ],
    mobile: {
      id: "cursor",
      label: "Cursor",
      desktopOnly: true,
      steps: [
        "Endpoint is copied to your clipboard.",
        "Open Cursor on your computer.",
        "Settings → MCP → Add server → paste this URL.",
        "Ask for india_remote jobs.",
      ],
      tip: "AirDrop / Messages the copied URL to yourself if this phone isn’t near your laptop.",
    },
  },
  {
    id: "grok",
    label: "Grokbot",
    headline: "Hook Grokbot into Applicable",
    body: "Copy the endpoint, open Grok, paste into MCP / connectors.",
    tag: "Copy + paste",
    cta: {
      kind: "copy-then-open",
      label: "Copy endpoint",
      openUrl: grokHref(),
      openLabel: "Open Grok",
    },
    stepsDesktop: [
      "Copy the endpoint.",
      "Open Grok → MCP / connectors.",
      "Paste and save.",
    ],
    mobile: {
      id: "grok",
      label: "Grokbot",
      browserUrl: grokHref(),
      browserLabel: "Open Grok in browser",
      steps: [
        "Endpoint is copied.",
        "Open Grok in the browser (or app settings if available).",
        "Paste into MCP / connectors and save.",
        "Ask for open + india_remote roles.",
      ],
    },
  },
  {
    id: "instinct",
    label: "Instinct",
    headline: "Connect Instinct to Applicable",
    body: "Copy the endpoint, open Instinct, add a remote MCP connection in settings.",
    tag: "Copy + paste",
    cta: {
      kind: "copy-then-open",
      label: "Copy endpoint",
      openUrl: instinctHref(),
      openLabel: "Open Instinct",
    },
    stepsDesktop: [
      "Copy the endpoint.",
      "Instinct settings → add MCP connection → paste.",
      "Ask by text or call.",
    ],
    mobile: {
      id: "instinct",
      label: "Instinct",
      browserUrl: instinctHref(),
      browserLabel: "Open Instinct",
      steps: [
        "Endpoint is copied.",
        "Open Instinct → settings → MCP connections.",
        "Paste the URL and save.",
        "Text or call Instinct for India-remote roles.",
      ],
    },
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    headline: "Connect ChatGPT to live India checks",
    body: "Add a custom MCP server on chatgpt.com in a browser (including iPhone). It then syncs to the ChatGPT app.",
    tag: "Web + iOS",
    cta: {
      kind: "copy-then-open",
      label: "Copy endpoint",
      openUrl: chatgptPluginsHref(),
      openLabel: "Open Plugins",
    },
    stepsDesktop: [
      "Copy the endpoint.",
      "Plugins → Add custom MCP server → paste.",
      "Create and install, then @ in chat.",
    ],
    mobile: {
      id: "chatgpt",
      label: "ChatGPT",
      preferSafari: true,
      browserUrl: chatgptPluginsHref(),
      browserLabel: "Open Plugins in Safari / Chrome",
      steps: [
        "Endpoint is copied.",
        "Open Plugins in Safari/Chrome — not only the ChatGPT app.",
        "Add custom MCP server → paste → create.",
        "Back in the ChatGPT app, use the plugin with @.",
      ],
      tip: "Custom MCP is created on the website, then appears in the iOS app.",
    },
  },
  {
    id: "windsurf",
    label: "Windsurf",
    headline: "Connect Windsurf to Applicable",
    body: "Desktop Cascade MCP setup. On phones we copy the URL for you to paste later on desktop.",
    tag: "Desktop",
    cta: {
      kind: "copy-then-open",
      label: "Copy endpoint",
      openUrl: windsurfMcpHref(),
      openLabel: "Open docs",
    },
    stepsDesktop: [
      "Copy the endpoint.",
      "Paste as serverUrl in Cascade MCP.",
      "Ask who’s hiring from India.",
    ],
    mobile: {
      id: "windsurf",
      label: "Windsurf",
      desktopOnly: true,
      steps: [
        "Endpoint is copied.",
        "Open Windsurf on your computer.",
        "Cascade MCP → paste as serverUrl.",
        "Ask who’s hiring from India.",
      ],
    },
  },
  {
    id: "cline",
    label: "Cline",
    headline: "Use Applicable inside Cline",
    body: "Desktop VS Code / Cline install. On phones we copy the URL only.",
    tag: "Desktop",
    cta: {
      kind: "deeplink",
      label: "Add to Cline",
      href: vscodeInstallHref(),
    },
    stepsDesktop: [
      "Click Add to Cline.",
      "Confirm in VS Code / enable in Cline MCP.",
      "Ask for India-eligible roles.",
    ],
    mobile: {
      id: "cline",
      label: "Cline",
      desktopOnly: true,
      steps: [
        "Endpoint is copied.",
        "Open VS Code + Cline on your computer.",
        "Add remote MCP with this URL.",
        "Ask for India-eligible roles.",
      ],
    },
  },
  {
    id: "mcp",
    label: "Any MCP",
    headline: "Any MCP-capable client",
    body: "Copy this Streamable HTTP endpoint into any client that speaks MCP.",
    tag: "URL",
    cta: { kind: "copy-only", label: "Copy MCP endpoint" },
    stepsDesktop: [
      "Copy the endpoint URL.",
      "Add remote server applicable.",
      "Query search_jobs / stats.",
    ],
    mobile: {
      id: "mcp",
      label: "Any MCP",
      steps: [
        "Endpoint is copied.",
        "Open your MCP client’s remote server settings.",
        "Paste this URL as a Streamable HTTP server named applicable.",
        "Call search_jobs / stats.",
      ],
    },
  },
];

export { MCP_URL };
