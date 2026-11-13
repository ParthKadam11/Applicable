"use client";

import { useEffect, useState } from "react";
import { AgentLogo } from "@/components/agent-logo";
import { ConnectSheet } from "@/components/connect-sheet";
import { CopyButton } from "@/components/copy-button";
import type { ConnectorDef } from "@/lib/mcp-connectors";
import { MCP_URL } from "@/lib/constants";
import { copyText, isLikelyMobile } from "@/lib/copy-text";

/** Dashboard integration detail — mobile uses the same copy-first sheet. */
export function IntegrationConnectClient({
  connector,
}: {
  connector: ConnectorDef;
}) {
  const [mobile, setMobile] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMobile(isLikelyMobile());
  }, []);

  async function doCopy() {
    const ok = await copyText(MCP_URL);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  const cta = connector.cta;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="overflow-hidden rounded-xl ring-1 ring-black/5">
          <AgentLogo id={connector.id} label={connector.label} size="md" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            {connector.label}
          </h1>
          <p className="mt-1.5 max-w-xl text-pretty text-[14px] text-mute sm:text-[15px]">
            {connector.body}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2.5">
        <code className="min-w-0 flex-1 truncate text-[12px] text-ink">
          {MCP_URL}
        </code>
        <CopyButton text={MCP_URL} label="Copy" />
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        {mobile ? (
          <button
            type="button"
            className="btn-ink touch-manipulation"
            onClick={() => setSheetOpen(true)}
          >
            Connect {connector.label}
          </button>
        ) : cta.kind === "deeplink" ? (
          <a
            href={cta.href}
            className="btn-ink touch-manipulation"
            target="_blank"
            rel="noopener noreferrer"
          >
            {cta.label}
          </a>
        ) : cta.kind === "copy-only" ? (
          <button
            type="button"
            className="btn-ink touch-manipulation"
            onClick={() => void doCopy()}
          >
            {copied ? "Copied" : cta.label}
          </button>
        ) : (
          <>
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
              target="_blank"
              rel="noopener noreferrer"
            >
              {cta.openLabel}
            </a>
          </>
        )}
      </div>

      <ol className="space-y-2 rounded-2xl border border-line bg-white p-5">
        {(mobile ? connector.mobile.steps : connector.stepsDesktop).map(
          (step, i) => (
            <li
              key={`${connector.id}-${i}`}
              className="flex gap-2 text-sm leading-snug text-mute"
            >
              <span className="shrink-0 tabular-nums">{i + 1}.</span>
              <span className="min-w-0">{step}</span>
            </li>
          ),
        )}
      </ol>

      <ConnectSheet
        open={sheetOpen}
        guide={connector.mobile}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
