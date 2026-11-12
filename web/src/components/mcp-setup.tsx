"use client";

import { useState } from "react";
import Link from "next/link";
import { MCP_URL } from "@/lib/constants";
import {
  chatgptPluginsHref,
  claudeConnectorHref,
  cursorInstallHref,
  grokHref,
  vscodeInstallHref,
  windsurfMcpHref,
} from "@/lib/mcp-install";
import { AgentLogo } from "./agent-logo";
import { AgentsStrip } from "./agents-strip";
import { CopyButton } from "./copy-button";
import { IconCanIApply } from "./connector-icons";

type Cta =
  | { kind: "link"; label: string; href: string }
  | { kind: "copy-open"; label: string; openUrl: string }
  | { kind: "copy-url"; label: string };

const CONNECTORS = [
  {
    id: "claude",
    label: "Claude",
    headline: "Add CanIApply to Claude",
    body: "One click opens Claude’s connector dialog with our URL filled in. Ask in plain English — get live roles with the quote that proves you can apply from India.",
    tag: "1-click",
    cta: {
      kind: "link",
      label: "Add to Claude",
      href: claudeConnectorHref(),
    } satisfies Cta,
    steps: [
      "Click Add to Claude — the connector dialog opens prefilled.",
      "Sign in if needed, then confirm Add / Connect.",
      "Ask: “Show me open India-remote engineering roles.”",
    ],
  },
  {
    id: "codex",
    label: "Codex",
    headline: "Wire CanIApply into Codex",
    body: "One click copies the endpoint and opens ChatGPT Plugins — create a custom MCP server for Codex / ChatGPT with CanIApply.",
    tag: "1-click",
    cta: {
      kind: "copy-open",
      label: "Add to Codex",
      openUrl: chatgptPluginsHref(),
    } satisfies Cta,
    steps: [
      "Click Add to Codex — we copy the URL and open Plugins.",
      "Add → Create custom MCP server, paste the URL, save.",
      "Ask for india_remote roles with evidence quotes.",
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    headline: "Install CanIApply in Cursor",
    body: "One click hands off to Cursor and installs the server globally. Search the corpus while you code — no JSON editing, no terminal.",
    tag: "1-click",
    cta: {
      kind: "link",
      label: "Add to Cursor",
      href: cursorInstallHref(),
    } satisfies Cta,
    steps: [
      "Click Add to Cursor — the browser opens the Cursor install prompt.",
      "Confirm Install. You’re done.",
      "In chat: “Find india_remote jobs with evidence quotes.”",
    ],
  },
  {
    id: "windsurf",
    label: "Windsurf",
    headline: "Connect Windsurf to CanIApply",
    body: "One click copies the endpoint and opens Windsurf’s MCP docs — paste as serverUrl in Cascade MCP settings.",
    tag: "1-click",
    cta: {
      kind: "copy-open",
      label: "Add to Windsurf",
      openUrl: windsurfMcpHref(),
    } satisfies Cta,
    steps: [
      "Click Add to Windsurf — we copy the URL and open MCP setup.",
      "In Cascade → MCP, add a remote server with serverUrl set to the copied link.",
      "Ask who is hiring from India.",
    ],
  },
  {
    id: "cline",
    label: "Cline",
    headline: "Use CanIApply inside Cline",
    body: "One click opens VS Code’s MCP install flow. Confirm, then enable the same remote URL in Cline’s MCP panel if you use Cline specifically.",
    tag: "1-click",
    cta: {
      kind: "link",
      label: "Add to Cline",
      href: vscodeInstallHref(),
    } satisfies Cta,
    steps: [
      "Click Add to Cline — VS Code opens the MCP install prompt.",
      "Confirm install. In Cline → MCP Servers, ensure the remote URL is enabled (Streamable HTTP).",
      "Ask for India-eligible roles with evidence.",
    ],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    headline: "Connect ChatGPT to live India checks",
    body: "One click copies the endpoint and opens ChatGPT Plugins — add a custom MCP server and paste.",
    tag: "1-click",
    cta: {
      kind: "copy-open",
      label: "Add to ChatGPT",
      openUrl: chatgptPluginsHref(),
    } satisfies Cta,
    steps: [
      "Click Add to ChatGPT — we copy the URL and open Plugins.",
      "Add → Create custom MCP server, paste, save.",
      "Ask who’s hiring from India.",
    ],
  },
  {
    id: "grok",
    label: "Grokbot",
    headline: "Hook Grokbot into CanIApply",
    body: "One click copies the endpoint and opens Grok — paste into MCP / connectors settings.",
    tag: "1-click",
    cta: {
      kind: "copy-open",
      label: "Add to Grokbot",
      openUrl: grokHref(),
    } satisfies Cta,
    steps: [
      "Click Add to Grokbot — we copy the URL and open Grok.",
      "Open MCP / connectors and add a remote server with the pasted URL.",
      "Ask for open + india_remote roles.",
    ],
  },
  {
    id: "mcp",
    label: "Any MCP",
    headline: "Any MCP-capable client",
    body: "If your agent speaks Model Context Protocol over Streamable HTTP, point it at this URL. One corpus for every client that can connect.",
    tag: "URL",
    cta: {
      kind: "copy-url",
      label: "Copy MCP endpoint",
    } satisfies Cta,
    steps: [
      "Copy the endpoint URL.",
      "In your client’s MCP config, add a remote server named caniapply.",
      "Set url to the endpoint, save, then query search_jobs / stats.",
    ],
  },
] as const;

type ConnectorId = (typeof CONNECTORS)[number]["id"];

function Rail() {
  return (
    <div className="relative mx-1 h-px w-10 shrink-0 sm:w-14" aria-hidden>
      <div className="absolute inset-0 bg-[#d5e2ec]" />
      <div className="absolute inset-y-0 -top-px h-[2px] w-full overflow-hidden">
        <div className="rail-pulse h-full w-[40%] bg-gradient-to-r from-transparent via-white to-transparent" />
      </div>
    </div>
  );
}

function ConnectCta({ cta }: { cta: Cta }) {
  const [copied, setCopied] = useState(false);
  const className =
    "inline-flex min-h-11 items-center justify-center rounded-full bg-mark px-6 text-sm font-semibold text-ink shadow-[0_8px_20px_rgba(76,201,240,0.32)] transition hover:bg-mark-deep hover:text-white";

  if (cta.kind === "link") {
    return (
      <a href={cta.href} className={className} rel="noopener noreferrer">
        {cta.label}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void navigator.clipboard.writeText(MCP_URL).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
          if (cta.kind === "copy-open") {
            window.open(cta.openUrl, "_blank", "noopener,noreferrer");
          }
        });
      }}
    >
      {copied ? "Link copied" : cta.label}
    </button>
  );
}

export function McpSetup() {
  const [active, setActive] = useState<ConnectorId>("cursor");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const c = CONNECTORS.find((x) => x.id === active) ?? CONNECTORS[2]!;

  const snippet = `{
  "mcpServers": {
    "caniapply": {
      "url": "${MCP_URL}"
    }
  }
}`;

  return (
    <>
      <AgentsStrip />

      <section id="mcp" className="scroll-mt-24 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <p className="font-mono text-[11px] uppercase text-mute">
              Integrations
            </p>
            <h2 className="mt-3 text-balance font-display text-3xl leading-[1.15] text-ink sm:text-4xl">
              Plug into the agent you already use
            </h2>
            <p className="mt-3 max-w-xl text-pretty text-[15px] leading-relaxed text-mute">
              Same India-eligibility corpus everywhere — pick a client and
              connect in one click.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Agents"
            className="mt-10 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {CONNECTORS.map((item) => {
              const on = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setActive(item.id);
                    setShowAdvanced(false);
                  }}
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition ${
                    on
                      ? "border-mark bg-mark text-ink shadow-[0_4px_14px_rgba(76,201,240,0.35)]"
                      : "border-line bg-white text-mute hover:border-mark hover:text-ink"
                  }`}
                >
                  <span className="overflow-hidden rounded-md">
                    <AgentLogo id={item.id} label={item.label} size="sm" />
                  </span>
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-12 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <div className="flex items-center gap-3">
                <span className="overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5">
                  <AgentLogo id={c.id} label={c.label} size="md" />
                </span>
                <span className="rounded-full bg-[#f0f4f8] px-2.5 py-0.5 font-mono text-[10px] uppercase text-mute">
                  {c.tag}
                </span>
              </div>
              <h3 className="mt-5 text-balance font-display text-2xl leading-snug text-ink sm:text-3xl">
                {c.headline}
              </h3>
              <p className="mt-4 max-w-md text-pretty text-[15px] leading-relaxed text-mute">
                {c.body}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ConnectCta cta={c.cta} />
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-white px-5 text-sm font-semibold text-ink transition hover:border-mark hover:bg-[#eaf4ff]"
                >
                  Open dashboard
                </Link>
              </div>
            </div>

            <div className="flex flex-col items-center gap-8">
              <div className="flex items-center justify-center">
                <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
                  <IconCanIApply className="size-10" />
                </div>
                <Rail />
                <div className="relative">
                  <span className="logo-orbit" aria-hidden />
                  <div className="relative z-[1] size-16 overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
                    <AgentLogo id={c.id} label={c.label} fill />
                  </div>
                </div>
              </div>
              <p className="max-w-xs text-center text-pretty text-sm text-mute">
                CanIApply ↔ {c.label}
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-wide text-[#8aa0b4]">
                  Streamable HTTP · 5 tools
                </span>
              </p>
            </div>
          </div>

          <ol className="mt-16 grid gap-8 border-t border-line pt-12 sm:grid-cols-3 sm:gap-10">
            {c.steps.map((step, i) => (
              <li key={step} className="min-w-0">
                <span className="font-mono text-[11px] uppercase text-mute">
                  Step {i + 1}
                </span>
                <p className="mt-2 text-pretty text-[15px] leading-relaxed text-ink">
                  {step}
                </p>
              </li>
            ))}
          </ol>

          <div className="mt-10">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="font-mono text-[11px] uppercase text-mute transition hover:text-ink"
            >
              {showAdvanced ? "Hide advanced config" : "Advanced · JSON config"}
            </button>
            {showAdvanced ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-[#f7fafc]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3">
                  <p className="font-mono text-[10px] uppercase text-mute">
                    mcp.json · {MCP_URL}
                  </p>
                  <CopyButton text={snippet} label="Copy" />
                </div>
                <pre className="overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed text-ink">
                  <code>{snippet}</code>
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}
