import { MCP_URL } from "./constants";

/** Base64 of a single mcp.json server entry (ASCII-safe on server + browser). */
export function encodeMcpConfig(config: Record<string, unknown>): string {
  const json = JSON.stringify(config);
  if (typeof btoa === "function") return btoa(json);
  return Buffer.from(json, "utf8").toString("base64");
}

const remoteConfig = { url: MCP_URL } as const;
const SERVER = "applicable";

/** Cursor desktop install handoff (does nothing useful in mobile browsers). */
export function cursorInstallHref(name = SERVER): string {
  const config = encodeURIComponent(encodeMcpConfig(remoteConfig));
  return `https://cursor.com/install-mcp?name=${encodeURIComponent(name)}&config=${config}`;
}

/**
 * Prefills Claude’s Add custom connector dialog.
 * Works in mobile Safari/Chrome when signed in; native Claude app cannot add connectors.
 */
export function claudeConnectorHref(name = "Applicable"): string {
  const params = new URLSearchParams({
    modal: "add-custom-connector",
    connectorName: name,
    connectorUrl: MCP_URL,
  });
  return `https://claude.ai/customize/connectors?${params.toString()}`;
}

/** VS Code / Cline MCP install (desktop). */
export function vscodeInstallHref(name = SERVER): string {
  const config = encodeURIComponent(
    JSON.stringify({ type: "http", url: MCP_URL }),
  );
  return `https://vscode.dev/redirect/mcp/install?name=${encodeURIComponent(name)}&config=${config}`;
}

/** ChatGPT Plugins — Add custom MCP server (web, including phone browsers). */
export function chatgptPluginsHref(): string {
  return "https://chatgpt.com/plugins";
}

/** Windsurf Cascade MCP docs. */
export function windsurfMcpHref(): string {
  return "https://docs.devin.ai/windsurf/plugins/cascade/mcp";
}

/** Grok web. */
export function grokHref(): string {
  return "https://grok.x.ai/";
}

/** Instinct web workspace. */
export function instinctHref(): string {
  return "https://app.instinct.com/";
}

export { MCP_URL };
