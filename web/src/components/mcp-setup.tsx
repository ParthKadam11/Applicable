"use client";

import { useEffect, useRef, useState } from "react";
import { BrowseJobsLink } from "@/components/browse-jobs-link";
import { ConnectSheet } from "@/components/connect-sheet";
import { CopyButton } from "@/components/copy-button";
import { CONNECTORS, MCP_URL, type ConnectorDef } from "@/lib/mcp-connectors";
import { copyText, isLikelyMobile } from "@/lib/copy-text";
import { AnimatedBeam } from "@/components/ui/animated-beam";
import { McpJsonPanel } from "@/components/mcp-json-panel";
import { AgentLogo } from "./agent-logo";
import { BrandLogo } from "./brand-logo";

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

function DesktopCta({ connector }: { connector: ConnectorDef }) {
  const [copied, setCopied] = useState(false);
  const cta = connector.cta;

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
      >
        {cta.label}
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
  const [sheetOpen, setSheetOpen] = useState(false);
  const c = CONNECTORS.find((x) => x.id === active) ?? CONNECTORS[0]!;

  useEffect(() => {
    setMobile(isLikelyMobile());
  }, []);

  const steps = mobile ? c.mobile.steps : c.stepsDesktop;

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
          <h2 className="mt-3 text-balance font-display text-[1.65rem] leading-[1.15] text-ink xs:text-[1.75rem] sm:text-4xl">
            Plug into the agent you already use
          </h2>
          <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-mute sm:text-[15px]">
            On phones we copy the endpoint and guide you — native apps often
            open and do nothing. Desktop still gets install links where they
            work.
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
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[13px] transition touch-manipulation xs:gap-2 xs:px-3.5 xs:py-2 xs:text-sm ${
                  on
                    ? "border-mark bg-mark text-ink shadow-[0_4px_14px_color-mix(in_srgb,var(--mark)_35%,transparent)]"
                    : "border-line bg-white text-mute hover:border-mark hover:bg-mark-soft hover:text-ink"
                }`}
              >
                <span className="inline-flex size-5 shrink-0 overflow-hidden rounded-md">
                  <AgentLogo id={item.id} label={item.label} fill />
                </span>
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-10 grid items-center gap-10 border-t border-line pt-10 sm:mt-12 sm:pt-12 lg:grid-cols-2 lg:gap-14">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex size-11 shrink-0 overflow-hidden rounded-xl shadow-sm ring-1 ring-black/5 sm:size-12">
                <AgentLogo id={c.id} label={c.label} fill />
              </span>
              <span className="rounded-full bg-mark-soft px-2.5 py-1 text-[10px] uppercase leading-none text-mark-deep">
                {c.tag}
              </span>
            </div>
            <h3 className="mt-5 text-balance font-display text-xl leading-snug text-ink sm:text-3xl">
              {c.headline}
            </h3>
            <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-mute sm:text-[15px]">
              {c.body}
            </p>

            {c.id === "mcp" ? (
              <div className="mt-5">
                <EndpointChip />
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {mobile ? (
                <button
                  type="button"
                  className="btn-ink w-full touch-manipulation sm:w-auto"
                  onClick={() => setSheetOpen(true)}
                >
                  Connect {c.label}
                </button>
              ) : (
                <DesktopCta connector={c} />
              )}
              <BrowseJobsLink className="btn-ghost w-full touch-manipulation sm:w-auto" />
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-sm flex-col items-center justify-center gap-4 lg:mx-0 lg:justify-self-center">
            <IntegrationBeams agentId={c.id} agentLabel={c.label} />
            <p className="text-center text-sm text-mute">
              Applicable ↔ {c.label}
            </p>
            <ol className="w-full space-y-2 pt-1">
              {steps.map((step, i) => (
                <li
                  key={`${c.id}-${i}`}
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

      <ConnectSheet
        open={sheetOpen}
        guide={c.mobile}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}
