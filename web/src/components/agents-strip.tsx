"use client";

import { LogosWithBlurFlip, type LogoItem } from "@/components/ui/logos-with-blur-flip";
import { AgentLogo } from "./agent-logo";

const SETS: LogoItem[][] = [
  [
    { name: "Claude", node: <AgentLogo id="claude" label="Claude" size="sm" /> },
    { name: "Codex", node: <AgentLogo id="codex" label="Codex" size="sm" /> },
    { name: "Cursor", node: <AgentLogo id="cursor" label="Cursor" size="sm" /> },
    {
      name: "Windsurf",
      node: <AgentLogo id="windsurf" label="Windsurf" size="sm" />,
    },
    { name: "Cline", node: <AgentLogo id="cline" label="Cline" size="sm" /> },
    { name: "MCP", node: <AgentLogo id="mcp" label="MCP" size="sm" /> },
  ],
  [
    { name: "Claude", node: <AgentLogo id="claude" label="Claude" size="sm" /> },
    {
      name: "ChatGPT",
      node: <AgentLogo id="chatgpt" label="ChatGPT" size="sm" />,
    },
    { name: "Cursor", node: <AgentLogo id="cursor" label="Cursor" size="sm" /> },
    {
      name: "Grokbot",
      node: <AgentLogo id="grok" label="Grokbot" size="sm" />,
    },
    { name: "Cline", node: <AgentLogo id="cline" label="Cline" size="sm" /> },
    { name: "MCP", node: <AgentLogo id="mcp" label="MCP" size="sm" /> },
  ],
];

/** Quiet “works wherever your agents work” strip — blur-flip logo cloud. */
export function AgentsStrip() {
  return (
    <section className="border-y border-line bg-[#f7fafc]">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
        <p className="mx-auto max-w-xl text-center text-pretty text-sm text-mute sm:text-[15px]">
          One India-eligibility corpus, available through MCP wherever your
          agents work.
        </p>
        <div className="mt-8">
          <LogosWithBlurFlip sets={SETS} />
        </div>
      </div>
    </section>
  );
}
