"use client";

import { LogosWithBlurFlip, type LogoItem } from "@/components/ui/logos-with-blur-flip";
import {
  IconChatGPT,
  IconClaude,
  IconCline,
  IconCodex,
  IconCursor,
  IconGrok,
  IconMcp,
  IconWindsurf,
} from "./connector-icons";

const SETS: LogoItem[][] = [
  [
    { name: "Claude", node: <IconClaude className="size-5 sm:size-6" mono /> },
    { name: "Codex", node: <IconCodex className="size-5 sm:size-6" mono /> },
    { name: "Cursor", node: <IconCursor className="size-5 sm:size-6" mono /> },
    {
      name: "Windsurf",
      node: <IconWindsurf className="size-5 sm:size-6" mono />,
    },
    { name: "Cline", node: <IconCline className="size-5 sm:size-6" mono /> },
    { name: "MCP", node: <IconMcp className="size-5 sm:size-6" mono /> },
  ],
  [
    { name: "Claude", node: <IconClaude className="size-5 sm:size-6" mono /> },
    {
      name: "ChatGPT",
      node: <IconChatGPT className="size-5 sm:size-6" mono />,
    },
    { name: "Cursor", node: <IconCursor className="size-5 sm:size-6" mono /> },
    { name: "Grokbot", node: <IconGrok className="size-5 sm:size-6" mono /> },
    { name: "Cline", node: <IconCline className="size-5 sm:size-6" mono /> },
    { name: "MCP", node: <IconMcp className="size-5 sm:size-6" mono /> },
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
