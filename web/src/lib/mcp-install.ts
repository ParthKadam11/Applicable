import { MCP_URL } from "./constants";

/** Base64 of a single mcp.json server entry (ASCII-safe on server + browser). */
export function encodeMcpConfig(config: Record<string, unknown>): string {
  const json = JSON.stringify(config);
  if (typeof btoa === "function") return btoa(json);
  return Buffer.from(json, "utf8").toString("base64");
}

const remoteConfig = { url: MCP_URL } as const;
const SERVER = "applicable";

/** One-click Cursor install (https handoff → app deeplink). */
export function cursorInstallHref(name = SERVER): string {
  const config = encodeURIComponent(encodeMcpConfig(remoteConfig));
  return `https://cursor.com/install-mcp?name=${encodeURIComponent(name)}&config=${config}`;
}

/** Prefills Claude’s “Add custom connector” dialog. */
export function claudeConnectorHref(name = "Applicable"): string {
  const params = new URLSearchParams({
    modal: "add-custom-connector",
    connectorName: name,
    connectorUrl: MCP_URL,
  });
  return `https://claude.ai/customize/connectors?${params.toString()}`;
}

/** One-click VS Code / Copilot agent MCP install (also useful for Cline users in VS Code). */
export function vscodeInstallHref(name = SERVER): string {
  const config = encodeURIComponent(
    JSON.stringify({ type: "http", url: MCP_URL }),
  );
  return `https://vscode.dev/redirect/mcp/install?name=${encodeURIComponent(name)}&config=${config}`;
}

/** ChatGPT / Codex - Plugins page (no official prefill deeplink). */
export function chatgptPluginsHref(): string {
  return "https://chatgpt.com/plugins";
}

/** Windsurf / Devin Cascade MCP docs (opens settings guidance). */
export function windsurfMcpHref(): string {
  return "https://docs.devin.ai/windsurf/plugins/cascade/mcp";
}

/** Grok web app. */
export function grokHref(): string {
  return "https://grok.x.ai/";
}

/** Instinct personal assistant (MCP connections in settings). */
export function instinctHref(): string {
  return "https://app.instinct.com/";
}

export { MCP_URL };
