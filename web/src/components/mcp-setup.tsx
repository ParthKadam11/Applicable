"use client";

import { useRef, useState } from "react";
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
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { McpJsonPanel } from "@/components/mcp-json-panel";
import { AgentLogo } from "./agent-logo";
import { BrandLogo } from "./brand-logo";

type Cta =
  | { kind: "link"; label: string; href: string }
  | { kind: "copy-open"; label: string; openUrl: string }
  | { kind: "copy-url"; label: string };

const CONNECTORS = [
  {
    id: "claude",
    label: "Claude",
    headline: "Add Applicable to Claude",
    body: "One click opens Claude’s connector dialog with our URL filled in. Ask in plain English and get live roles with the quote that proves you can apply from India.",
    tag: "1-click",
    cta: {
      kind: "link",
      label: "Add to Claude",
      href: claudeConnectorHref(),
    } satisfies Cta,
    steps: [
      "Click Add to Claude. The connector dialog opens prefilled.",
      "Sign in if needed, then confirm Add / Connect.",
      "Ask: “Show me open India-remote engineering roles.”",
    ],
  },
  {
    id: "codex",
    label: "Codex",
    headline: "Wire Applicable into Codex",
    body: "One click copies the endpoint and opens ChatGPT Plugins. Create a custom MCP server for Codex / ChatGPT with Applicable.",
    tag: "1-click",
    cta: {
      kind: "copy-open",
      label: "Add to Codex",
      openUrl: chatgptPluginsHref(),
    } satisfies Cta,
    steps: [
      "Click Add to Codex. We copy the URL and open Plugins.",
      "Add → Create custom MCP server, paste the URL, save.",
      "Ask for india_remote roles with evidence quotes.",
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    headline: "Install Applicable in Cursor",
    body: "One click hands off to Cursor and installs the server globally. Search the corpus while you code. No JSON editing, no terminal.",
    tag: "1-click",
    cta: {
      kind: "link",
      label: "Add to Cursor",
      href: cursorInstallHref(),
    } satisfies Cta,
    steps: [
      "Click Add to Cursor. The browser opens the Cursor install prompt.",
      "Confirm Install. You’re done.",
      "In chat: “Find india_remote jobs with evidence quotes.”",
    ],
  },
  {
    id: "windsurf",
    label: "Windsurf",
    headline: "Connect Windsurf to Applicable",
    body: "One click copies the endpoint and opens Windsurf’s MCP docs. Paste as serverUrl in Cascade MCP settings.",
    tag: "1-click",
    cta: {
      kind: "copy-open",
      label: "Add to Windsurf",
      openUrl: windsurfMcpHref(),
    } satisfies Cta,
    steps: [
      "Click Add to Windsurf. We copy the URL and open MCP setup.",
      "In Cascade → MCP, add a remote server with serverUrl set to the copied link.",
      "Ask who is hiring from India.",
    ],
  },
  {
    id: "cline",
    label: "Cline",
    headline: "Use Applicable inside Cline",
    body: "One click opens VS Code’s MCP install flow. Confirm, then enable the same remote URL in Cline’s MCP panel if you use Cline specifically.",
    tag: "1-click",
    cta: {
      kind: "link",
      label: "Add to Cline",
      href: vscodeInstallHref(),
    } satisfies Cta,
    steps: [
      "Click Add to Cline. VS Code opens the MCP install prompt.",
      "Confirm install. In Cline → MCP Servers, ensure the remote URL is enabled (Streamable HTTP).",
      "Ask for India-eligible roles with evidence.",
    ],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    headline: "Connect ChatGPT to live India checks",
    body: "One click copies the endpoint and opens ChatGPT Plugins. Add a custom MCP server and paste.",
    tag: "1-click",
    cta: {
      kind: "copy-open",
      label: "Add to ChatGPT",
      openUrl: chatgptPluginsHref(),
    } satisfies Cta,
    steps: [
      "Click Add to ChatGPT. We copy the URL and open Plugins.",
      "Add → Create custom MCP server, paste, save.",
      "Ask who’s hiring from India.",
    ],
  },
  {
    id: "grok",
    label: "Grokbot",
    headline: "Hook Grokbot into Applicable",
    body: "One click copies the endpoint and opens Grok. Paste into MCP / connectors settings.",
    tag: "1-click",
    cta: {
      kind: "copy-open",
      label: "Add to Grokbot",
      openUrl: grokHref(),
    } satisfies Cta,
    steps: [
      "Click Add to Grokbot. We copy the URL and open Grok.",
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
      "In your client’s MCP config, add a remote server named applicable.",
      "Set url to the endpoint, save, then query search_jobs / stats.",
    ],
  },
] as const;

type ConnectorId = (typeof CONNECTORS)[number]["id"];

function IntegrationBeams({
  agentId,
  agentLabel,
}: {
  agentId: string;
  agentLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative flex w-full max-w-[22rem] items-center justify-center gap-10 sm:gap-14"
    >
      <div
        ref={fromRef}
        className="relative z-[1] size-14 overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:size-16"
      >
        <BrandLogo fill />
      </div>

      <div className="relative z-[1]">
        <span className="logo-orbit" aria-hidden />
        <div
          ref={toRef}
          className="relative z-[1] size-14 overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:size-16"
        >
          <AgentLogo id={agentId} label={agentLabel} fill />
        </div>
      </div>

      <AnimatedBeam
        containerRef={containerRef}
        fromRef={fromRef}
        toRef={toRef}
        curvature={-18}
        duration={3.8}
        pathWidth={2}
        pathOpacity={0.45}
        gradientStartColor="#4cc9f0"
        gradientStopColor="#0f9bc8"
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={fromRef}
        toRef={toRef}
        curvature={18}
        reverse
        duration={3.8}
        delay={1.4}
        pathWidth={2}
        pathOpacity={0.28}
        gradientStartColor="#0f9bc8"
        gradientStopColor="#4cc9f0"
      />
    </div>
  );
}

function ConnectCta({ cta }: { cta: Cta }) {
  const [copied, setCopied] = useState(false);
  const className =
    "btn-ink";

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
  const c = CONNECTORS.find((x) => x.id === active) ?? CONNECTORS[2]!;

  const snippet = `{
  "mcpServers": {
    "applicable": {
      "url": "${MCP_URL}"
    }
  }
}`;

  return (
    <section id="mcp" className="cv-auto scroll-mt-24 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8 sm:py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase text-mute">Integrations</p>
            <h2 className="mt-3 text-balance font-display text-[1.75rem] leading-[1.15] text-ink sm:text-4xl">
              Plug into the agent you already use
            </h2>
            <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-mute sm:text-[15px]">
              Same India-eligibility corpus everywhere. Pick a client and
              connect in one click.
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Agents"
            className="mt-8 flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mt-10 [&::-webkit-scrollbar]:hidden"
          >
            {CONNECTORS.map((item) => {
              const on = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setActive(item.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition ${
                    on
                      ? "border-mark bg-mark text-ink shadow-[0_4px_14px_color-mix(in_srgb,var(--mark)_35%,transparent)]"
                      : "border-line bg-white text-mute hover:border-mark hover:bg-mark-soft hover:text-ink"
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

          <div className="mt-10 grid items-center gap-10 lg:mt-12 lg:grid-cols-2 lg:gap-16">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5">
                  <AgentLogo id={c.id} label={c.label} size="md" />
                </span>
                <span className="rounded-full bg-mark-soft px-2.5 py-0.5 text-[10px] uppercase text-mark-deep">
                  {c.tag}
                </span>
              </div>
              <h3 className="mt-5 text-balance font-display text-xl leading-snug text-ink sm:text-3xl">
                {c.headline}
              </h3>
              <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-mute sm:text-[15px]">
                {c.body}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <ConnectCta cta={c.cta} />
                <Link href="/dashboard" className="btn-ghost w-full sm:w-auto">
                  Open dashboard
                </Link>
              </div>
            </div>

            <div className="flex flex-col items-center gap-6 sm:gap-8">
              <IntegrationBeams agentId={c.id} agentLabel={c.label} />
              <p className="max-w-xs px-2 text-center text-pretty text-sm text-mute">
                Applicable ↔ {c.label}
                <span className="mt-1 block text-[10px] uppercase tracking-wide text-[#8aa0b4]">
                  Streamable HTTP · 5 tools
                </span>
              </p>
            </div>
          </div>

          <ol className="mt-12 grid gap-8 border-t border-line pt-10 sm:mt-16 sm:grid-cols-3 sm:gap-10 sm:pt-12">
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

          <McpJsonPanel snippet={snippet} />
      </div>
    </section>
  );
}
