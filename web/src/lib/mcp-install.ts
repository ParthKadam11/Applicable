import { MCP_URL } from "./constants";

/** Base64 of a single mcp.json server entry (ASCII-safe on server + browser). */
export function encodeMcpConfig(config: Record<string, unknown>): string {
  const json = JSON.stringify(config);
  if (typeof btoa === "function") return btoa(json);
  return Buffer.from(json, "utf8").toString("base64");
}

const remoteConfig = { url: MCP_URL } as const;

/** One-click Cursor install (https handoff → app deeplink). */
export function cursorInstallHref(name = "caniapply"): string {
  const config = encodeURIComponent(encodeMcpConfig(remoteConfig));
  return `https://cursor.com/install-mcp?name=${encodeURIComponent(name)}&config=${config}`;
}

/** Prefills Claude’s “Add custom connector” dialog. */
export function claudeConnectorHref(name = "CanIApply"): string {
  const params = new URLSearchParams({
    modal: "add-custom-connector",
    connectorName: name,
    connectorUrl: MCP_URL,
  });
  return `https://claude.ai/customize/connectors?${params.toString()}`;
}

export { MCP_URL };
