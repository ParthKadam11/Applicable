"use client";

import { useEffect, useId, useState } from "react";
import { AgentLogo } from "@/components/agent-logo";
import { MCP_URL } from "@/lib/constants";
import { copyText } from "@/lib/copy-text";

export type ConnectGuide = {
  id: string;
  label: string;
  steps: string[];
  tip?: string;
  /** Safe to open in a phone browser (not a native-app dead end). */
  browserUrl?: string;
  browserLabel?: string;
  /** Warn that the native app will break the flow. */
  preferSafari?: boolean;
  /** Desktop-only finish. */
  desktopOnly?: boolean;
};

type Props = {
  open: boolean;
  guide: ConnectGuide | null;
  onClose: () => void;
};

/** Mobile connect guide: always copies first, never dumps into a dead app screen. */
export function ConnectSheet({ open, guide, onClose }: Props) {
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (!open || !guide) return;
    let alive = true;
    void (async () => {
      const ok = await copyText(MCP_URL);
      if (!alive) return;
      setCopied(ok);
      setCopyFailed(!ok);
    })();
    return () => {
      alive = false;
    };
  }, [open, guide]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !guide) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-ink/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-[1] flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-line bg-white shadow-[0_-12px_40px_-20px_color-mix(in_srgb,var(--ink)_45%,transparent)] sm:rounded-3xl">
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden" />

        <div className="flex items-start gap-3 px-5 pb-3 pt-4">
          <span className="overflow-hidden rounded-xl ring-1 ring-black/5">
            <AgentLogo id={guide.id} label={guide.label} size="md" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="font-display text-lg tracking-tight text-ink"
            >
              Connect {guide.label}
            </h2>
            <p className="mt-0.5 text-[13px] text-mute">
              {copied
                ? "Endpoint copied — paste it in the next step."
                : copyFailed
                  ? "Copy failed — select the URL below and copy manually."
                  : "Copying endpoint…"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-mute hover:bg-soft hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          <div className="rounded-2xl border border-line bg-soft/80 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">
              MCP endpoint
            </p>
            <p className="mt-1 break-all font-mono text-[12.5px] leading-relaxed text-ink">
              {MCP_URL}
            </p>
            <button
              type="button"
              className="btn-ink mt-3 w-full touch-manipulation"
              onClick={() => {
                void (async () => {
                  const ok = await copyText(MCP_URL);
                  setCopied(ok);
                  setCopyFailed(!ok);
                })();
              }}
            >
              {copied ? "Copied" : "Copy endpoint again"}
            </button>
          </div>

          {guide.desktopOnly ? (
            <p className="mt-4 rounded-2xl bg-sun-soft px-3 py-2.5 text-[13px] leading-snug text-ink">
              {guide.label} finishes on a computer. Keep this URL, then paste it
              in {guide.label} on desktop.
            </p>
          ) : null}

          {guide.preferSafari ? (
            <p className="mt-4 rounded-2xl bg-mark-soft px-3 py-2.5 text-[13px] leading-snug text-ink">
              Open the next page in <strong>Safari or Chrome</strong> — not the{" "}
              {guide.label} app. The app usually can’t add custom MCP connectors.
            </p>
          ) : null}

          <ol className="mt-4 space-y-2.5">
            {guide.steps.map((step, i) => (
              <li
                key={step}
                className="flex gap-2.5 text-[14px] leading-snug text-ink"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-mark-soft text-[11px] font-semibold text-mark-deep">
                  {i + 1}
                </span>
                <span className="min-w-0 pt-0.5 text-mute">{step}</span>
              </li>
            ))}
          </ol>

          {guide.tip ? (
            <p className="mt-4 text-[12px] leading-relaxed text-mute">
              {guide.tip}
            </p>
          ) : null}

          <div className="mt-5 flex flex-col gap-2.5">
            {guide.browserUrl ? (
              <a
                href={guide.browserUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ink w-full touch-manipulation text-center"
              >
                {guide.browserLabel ?? `Open ${guide.label} in browser`}
              </a>
            ) : null}
            <button
              type="button"
              className="btn-ghost w-full touch-manipulation"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
