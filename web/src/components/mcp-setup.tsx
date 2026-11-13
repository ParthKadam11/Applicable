"use client";

import { useEffect, useRef, useState } from "react";
import { BrowseJobsLink } from "@/components/browse-jobs-link";
import { CopyButton } from "@/components/copy-button";
import { MCP_URL } from "@/lib/constants";
import { copyText, isLikelyMobile } from "@/lib/copy-text";
import {
  chatgptPluginsHref,
  claudeConnectorHref,
  cursorInstallHref,
  grokHref,
  instinctHref,
  vscodeInstallHref,
  windsurfMcpHref,
} from "@/lib/mcp-install";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { McpJsonPanel } from "@/components/mcp-json-panel";
import { AgentLogo } from "./agent-logo";
import { BrandLogo } from "./brand-logo";

type Cta =
  | {
      kind: "deeplink";
      label: string;
      href: string;
      /** Also copy endpoint on tap (helps mobile paste if prefill fails). */
      copyOnClick?: boolean;
    }
  | {
      kind: "copy-then-open";
      label: string;
      openUrl: string;
      openLabel: string;
    }
  | { kind: "copy-only"; label: string };

type Connector = {
  id: string;
  label: string;
  headline: string;
  body: string;
  tag: string;
  cta: Cta;
  stepsDesktop: string[];
  stepsMobile: string[];
  /** Tip shown under CTAs on phones */
  mobileTip?: string;
};

const CONNECTORS: Connector[] = [
  {
    id: "claude",
    label: "Claude",
    headline: "Add Applicable to Claude",
    body: "Opens Claude’s connector dialog with our URL filled in. On iPhone, use Safari (not the Claude app) so the connector can be added, then it syncs to the app.",
    tag: "Web + iOS",
    cta: {
      kind: "deeplink",
      label: "Add to Claude",
      href: claudeConnectorHref(),
      copyOnClick: true,
    },
    stepsDesktop: [
      "Click Add to Claude (prefilled).",
      "Confirm the connector.",
      "Ask for India-remote roles.",
    ],
    stepsMobile: [
      "Tap Add to Claude in Safari or Chrome.",
      "Sign in if asked, then confirm the connector.",
      "Open the Claude app — Applicable is under Connectors.",
    ],
    mobileTip:
      "If the Claude app opens instead, switch to Safari and tap Add to Claude again.",
  },
  {
    id: "codex",
    label: "Codex",
    headline: "Wire Applicable into Codex",
    body: "Copies the endpoint, then opens ChatGPT Plugins. Create a custom MCP server and paste. Works in a phone browser too.",
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
    stepsMobile: [
      "Tap Copy endpoint.",
      "Open Plugins in Safari/Chrome (same Apple/Google account).",
      "Add custom MCP server → paste → create.",
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    headline: "Install Applicable in Cursor",
    body: "On desktop, one click hands off to Cursor and installs the server. On phones, copy the endpoint and finish in Cursor on your computer.",
    tag: "Desktop",
    cta: {
      kind: "deeplink",
      label: "Add to Cursor",
      href: cursorInstallHref(),
      copyOnClick: true,
    },
    stepsDesktop: [
      "Click Add to Cursor.",
      "Confirm Install in the Cursor app.",
      "Ask for india_remote jobs.",
    ],
    stepsMobile: [
      "Tap Copy endpoint below (or Add to Cursor to copy).",
      "Open Cursor on your computer.",
      "Add MCP server → paste the URL → ask for india_remote jobs.",
    ],
    mobileTip: "Cursor install links only complete on desktop.",
  },
  {
    id: "grok",
    label: "Grokbot",
    headline: "Hook Grokbot into Applicable",
    body: "Copies the endpoint and opens Grok. Paste into MCP / connectors settings.",
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
      "Paste and save, then ask for open + india_remote roles.",
    ],
    stepsMobile: [
      "Tap Copy endpoint, then Open Grok.",
      "Paste into MCP / connectors settings.",
      "Ask for open + india_remote roles.",
    ],
  },
  {
    id: "instinct",
    label: "Instinct",
    headline: "Connect Instinct to Applicable",
    body: "Copies the endpoint and opens Instinct. Add a remote MCP connection in settings, then text or call Instinct.",
    tag: "Copy + paste",
    cta: {
      kind: "copy-then-open",
      label: "Copy endpoint",
      openUrl: instinctHref(),
      openLabel: "Open Instinct",
    },
    stepsDesktop: [
      "Copy the endpoint.",
      "In Instinct settings, add an MCP connection and paste.",
      "Ask for India-remote roles by text or call.",
    ],
    stepsMobile: [
      "Tap Copy endpoint, then Open Instinct.",
      "Add an MCP connection and paste the URL.",
      "Text or call Instinct for India-remote roles.",
    ],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    headline: "Connect ChatGPT to live India checks",
    body: "Copies the endpoint and opens ChatGPT Plugins. Add a custom MCP server on web (including iPhone Safari), then use it in the app.",
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
      "Create, install, then @Applicable in chat.",
    ],
    stepsMobile: [
      "Tap Copy endpoint.",
      "Open Plugins in Safari/Chrome (not only the app).",
      "Add custom MCP server → paste → create. It syncs to the ChatGPT app.",
    ],
    mobileTip:
      "Custom MCP is added on chatgpt.com in a browser, then available in the iOS app.",
  },
  {
    id: "windsurf",
    label: "Windsurf",
    headline: "Connect Windsurf to Applicable",
    body: "Copies the endpoint and opens Windsurf MCP docs. Paste as serverUrl in Cascade MCP settings on desktop.",
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
    stepsMobile: [
      "Tap Copy endpoint.",
      "Finish in Windsurf on your computer (Cascade MCP).",
      "Paste as serverUrl, then ask who’s hiring from India.",
    ],
    mobileTip: "Windsurf MCP setup is desktop-only.",
  },
  {
    id: "cline",
    label: "Cline",
    headline: "Use Applicable inside Cline",
    body: "On desktop, opens VS Code’s MCP install flow. On phones, copy the endpoint and enable it in Cline on your computer.",
    tag: "Desktop",
    cta: {
      kind: "deeplink",
      label: "Add to Cline",
      href: vscodeInstallHref(),
      copyOnClick: true,
    },
    stepsDesktop: [
      "Click Add to Cline.",
      "Confirm in VS Code, enable in Cline MCP if needed.",
      "Ask for India-eligible roles.",
    ],
    stepsMobile: [
      "Tap Copy endpoint below.",
      "Open VS Code / Cline on your computer.",
      "Add remote MCP URL → ask for India-eligible roles.",
    ],
    mobileTip: "Cline / VS Code install completes on desktop.",
  },
  {
    id: "mcp",
    label: "Any MCP",
    headline: "Any MCP-capable client",
    body: "Copy this Streamable HTTP endpoint into any client that speaks MCP. Same corpus everywhere.",
    tag: "URL",
    cta: { kind: "copy-only", label: "Copy MCP endpoint" },
    stepsDesktop: [
      "Copy the endpoint URL.",
      "Add remote server applicable.",
      "Query search_jobs / stats.",
    ],
    stepsMobile: [
      "Tap Copy MCP endpoint.",
      "Paste into your client’s remote MCP settings.",
      "Query search_jobs / stats.",
    ],
  },
];

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

      <div
        ref={toRef}
        className="relative z-[1] size-14 overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:size-16"
      >
        <AgentLogo id={agentId} label={agentLabel} fill />
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

function EndpointChip() {
  return (
    <div className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-line bg-soft/80 px-3 py-2.5">
      <code className="min-w-0 flex-1 truncate text-[12px] text-ink sm:text-[13px]">
        {MCP_URL}
      </code>
      <CopyButton text={MCP_URL} label="Copy" />
    </div>
  );
}

function ConnectCta({ cta }: { cta: Cta }) {
  const [copied, setCopied] = useState(false);

  async function doCopy() {
    const ok = await copyText(MCP_URL);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (cta.kind === "deeplink") {
    return (
      <a
        href={cta.href}
        className="btn-ink touch-manipulation"
        rel="noopener noreferrer"
        target="_blank"
        onClick={() => {
          if (cta.copyOnClick) void doCopy();
        }}
      >
        {copied ? "Copied · opening…" : cta.label}
      </a>
    );
  }

  if (cta.kind === "copy-only") {
    return (
      <button
        type="button"
        className="btn-ink touch-manipulation"
        onClick={() => void doCopy()}
      >
        {copied ? "Copied" : cta.label}
      </button>
    );
  }

  // copy-then-open: never window.open after await (iOS blocks it).
  // Copy is a button; Open is a real <a> so Safari allows navigation.
  return (
    <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap">
      <button
        type="button"
        className="btn-ink touch-manipulation"
        onClick={() => void doCopy()}
      >
        {copied ? "Copied" : cta.label}
      </button>
      <a
        href={cta.openUrl}
        className="btn-ghost touch-manipulation"
        rel="noopener noreferrer"
        target="_blank"
      >
        {cta.openLabel}
      </a>
    </div>
  );
}

export function McpSetup() {
  const [active, setActive] = useState<ConnectorId>("claude");
  const [mobile, setMobile] = useState(false);
  const c = CONNECTORS.find((x) => x.id === active) ?? CONNECTORS[0]!;

  useEffect(() => {
    setMobile(isLikelyMobile());
  }, []);

  const steps = mobile ? c.stepsMobile : c.stepsDesktop;

  const snippet = `{
  "mcpServers": {
    "applicable": {
      "url": "${MCP_URL}"
    }
  }
}`;

  return (
    <section id="mcp" className="cv-auto scroll-mt-24 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-8 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-wide text-mute">
            Integrations
          </p>
          <h2 className="mt-3 text-balance font-display text-[1.75rem] leading-[1.15] text-ink sm:text-4xl">
            Plug into the agent you already use
          </h2>
          <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-mute sm:text-[15px]">
            Same corpus everywhere. Copy the endpoint, or use a client that can
            open a prefilled install link. Mobile steps use Safari/Chrome where
            apps block custom MCP setup.
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
                className={`flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition touch-manipulation ${
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

        <div className="mt-10 grid items-center gap-10 border-t border-line pt-10 sm:mt-12 sm:pt-12 lg:grid-cols-2 lg:gap-14">
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

            <div className="mt-5">
              <EndpointChip />
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <ConnectCta cta={c.cta} />
              <BrowseJobsLink className="btn-ghost w-full touch-manipulation sm:w-auto" />
            </div>

            {mobile && c.mobileTip ? (
              <p className="mt-4 max-w-md text-[12px] leading-relaxed text-mute">
                {c.mobileTip}
              </p>
            ) : null}
          </div>

          <div className="mx-auto flex w-full max-w-sm flex-col items-center justify-center gap-4 lg:mx-0 lg:justify-self-center">
            <IntegrationBeams agentId={c.id} agentLabel={c.label} />
            <p className="text-center text-sm text-mute">
              Applicable ↔ {c.label}
            </p>
            <ol className="w-full space-y-2 pt-1">
              {steps.map((step, i) => (
                <li
                  key={step}
                  className="flex gap-2 text-sm leading-snug text-mute"
                >
                  <span className="shrink-0 tabular-nums">{i + 1}.</span>
                  <span className="min-w-0">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <McpJsonPanel snippet={snippet} />
      </div>
    </section>
  );
}
