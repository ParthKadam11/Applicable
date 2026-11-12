"use client";

import { useState } from "react";
import { CopyButton } from "./copy-button";
import { MCP_URL } from "@/lib/constants";

const TABS = [
  { id: "claude", label: "Claude" },
  { id: "cursor", label: "Cursor" },
  { id: "chatgpt", label: "ChatGPT" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SNIPPETS: Record<TabId, string> = {
  claude: `{
  "mcpServers": {
    "caniapply": {
      "url": "${MCP_URL}"
    }
  }
}`,
  cursor: `{
  "mcpServers": {
    "caniapply": {
      "url": "${MCP_URL}"
    }
  }
}`,
  chatgpt: `Add a custom MCP connector with:
URL: ${MCP_URL}

Or via mcp-remote:
npx -y mcp-remote ${MCP_URL}`,
};

const HINTS: Record<TabId, string> = {
  claude:
    "Paste into Claude Desktop → Settings → Developer → Edit Config (claude_desktop_config.json).",
  cursor:
    "Cursor Settings → MCP → Add new global MCP server, or put this in ~/.cursor/mcp.json.",
  chatgpt:
    "ChatGPT custom GPTs / connectors that support remote MCP — use the URL directly.",
};

export function McpSetup() {
  const [tab, setTab] = useState<TabId>("claude");

  return (
    <section id="mcp" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-400/80">
          Use it in your AI
        </p>
        <h2 className="mt-3 max-w-xl font-display text-3xl tracking-tight text-zinc-50 sm:text-4xl">
          One URL. Ask your assistant who is hiring from India.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-400">
          Point Claude, Cursor, or ChatGPT at the MCP endpoint. Search live
          boards with quoted proof from the posting — no scraping in the chat.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="flex-1 overflow-x-auto rounded-lg border border-white/[0.08] bg-black/40 px-4 py-3 font-mono text-sm text-emerald-200/90">
            {MCP_URL}
          </code>
          <CopyButton text={MCP_URL} label="Copy URL" className="self-start sm:self-auto" />
        </div>

        <div className="mt-10 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0c0c0e]">
          <div className="flex items-center gap-1 border-b border-white/[0.06] px-2 pt-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`relative rounded-t-md px-4 py-2.5 text-sm transition ${
                  tab === t.id
                    ? "bg-white/[0.04] text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t.label}
                {tab === t.id ? (
                  <span className="absolute inset-x-3 -bottom-px h-px bg-emerald-400/70" />
                ) : null}
              </button>
            ))}
            <div className="ml-auto pr-2 pb-2">
              <CopyButton text={SNIPPETS[tab]} label="Copy snippet" />
            </div>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-zinc-300">
            <code>{SNIPPETS[tab]}</code>
          </pre>
          <p className="border-t border-white/[0.06] px-5 py-3 text-xs text-zinc-500">
            {HINTS[tab]}
          </p>
        </div>
      </div>
    </section>
  );
}
