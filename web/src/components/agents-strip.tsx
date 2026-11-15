"use client";

import { LogosWithBlurFlip, type LogoItem } from "@/components/ui/logos-with-blur-flip";
import { AgentLogo } from "./agent-logo";

const SETS: LogoItem[][] = [
  [
    { name: "Claude", node: <AgentLogo id="claude" label="Claude" size="sm" /> },
    { name: "Codex", node: <AgentLogo id="codex" label="Codex" size="sm" /> },
    { name: "Cursor", node: <AgentLogo id="cursor" label="Cursor" size="sm" /> },
    {
      name: "Grokbot",
      node: <AgentLogo id="grok" label="Grokbot" size="sm" />,
    },
    {
      name: "Instinct",
      node: <AgentLogo id="instinct" label="Instinct" size="sm" />,
    },
    { name: "MCP", node: <AgentLogo id="mcp" label="MCP" size="sm" /> },
  ],
  [
    { name: "Claude", node: <AgentLogo id="claude" label="Claude" size="sm" /> },
    {
      name: "ChatGPT",
      node: <AgentLogo id="chatgpt" label="ChatGPT" size="sm" />,
    },
    {
      name: "Windsurf",
      node: <AgentLogo id="windsurf" label="Windsurf" size="sm" />,
    },
    { name: "Cline", node: <AgentLogo id="cline" label="Cline" size="sm" /> },
    {
      name: "Instinct",
      node: <AgentLogo id="instinct" label="Instinct" size="sm" />,
    },
    { name: "MCP", node: <AgentLogo id="mcp" label="MCP" size="sm" /> },
  ],
];

/** Quiet “works wherever your agents work” strip - blur-flip logo cloud. */
export function AgentsStrip() {
  return (
    <section className="border-t border-line bg-soft">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-10 sm:px-8 sm:pb-10 sm:pt-14">
        <p className="mx-auto max-w-lg text-center text-pretty text-sm leading-relaxed text-mute sm:text-[15px]">
          One India-eligibility corpus, available through MCP wherever your
          agents work.
        </p>
        <div className="mt-6 sm:mt-7">
          <LogosWithBlurFlip
            sets={SETS}
            className="gap-x-4 gap-y-3 sm:gap-x-10 md:gap-x-12"
          />
        </div>
      </div>
    </section>
  );
}
