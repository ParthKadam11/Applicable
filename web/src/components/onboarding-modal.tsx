"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AgentLogo } from "@/components/agent-logo";
import { BrandLogo } from "@/components/brand-logo";
import { copyText } from "@/lib/copy-text";
import {
  MCP_ONBOARDING_URL,
  ONBOARDING_CLIENTS,
  ONBOARDING_OPEN_EVENT,
  SAMPLE_PROMPT,
  readOnboardingLocal,
  writeOnboardingLocal,
  type OnboardingClientId,
} from "@/lib/onboarding";

function StepIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-mark-soft text-mark-deep">
      {children}
    </span>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function BoxArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
      <path
        d="M12 3v10m0 0 3.5-3.5M12 13 8.5 9.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BracketsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
      <path
        d="M8 5H6v14h2M16 5h2v14h-2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
      <path
        d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-4 3.5V15H7.5A2.5 2.5 0 0 1 5 12.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden>
      <rect
        x="9"
        y="9"
        width="10"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
  );
  return [...nodes].filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      el.getAttribute("aria-hidden") !== "true" &&
      el.tabIndex !== -1,
  );
}

type Props = {
  open: boolean;
  skills: string[];
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
};

export function OnboardingModal({
  open,
  skills,
  onClose,
  returnFocusRef,
}: Props) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState<OnboardingClientId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const reduceMotion = usePrefersReducedMotion();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1600);
  }, []);

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      if (ok) showToast("Copied");
    },
    [showToast],
  );

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => closeBtnRef.current?.focus(), 20);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      const el = returnFocusRef?.current;
      if (el && typeof el.focus === "function") el.focus();
    };
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = getFocusable(dialogRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const free = ONBOARDING_CLIENTS.filter((c) => c.tier === "free");
  const pro = ONBOARDING_CLIENTS.filter((c) => c.tier === "pro");

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Dismiss onboarding"
        className={`absolute inset-0 bg-ink/40 ${reduceMotion ? "" : "animate-[fadeIn_180ms_ease-out]"}`}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-[1] flex max-h-[min(92dvh,52rem)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-[0_28px_80px_-32px_color-mix(in_srgb,var(--ink)_55%,transparent)] sm:rounded-2xl ${
          reduceMotion ? "" : "animate-[fadeIn_200ms_ease-out]"
        }`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2">
                <BrandLogo size={28} className="rounded-[7px]" />
                <span className="font-display text-[15px] tracking-tight text-ink">
                  Applicable
                </span>
              </div>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-mark-deep">
                Quick start
              </p>
              <h2
                id={titleId}
                className="mt-1.5 max-w-xl font-hero text-[1.55rem] leading-[1.15] tracking-[-0.02em] text-ink sm:text-[1.85rem]"
              >
                Get jobs into your AI in 4 steps
                <span
                  className="ml-1.5 inline-block size-2 translate-y-[-0.15em] rounded-full bg-sun align-middle"
                  aria-hidden
                />
              </h2>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line text-mute transition hover:border-mark hover:bg-mark-soft hover:text-ink"
            >
              ✕
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:gap-4 md:grid-cols-2">
            {/* 01 */}
            <section className="rounded-2xl border border-line bg-paper/60 p-4 sm:p-5">
              <div className="flex items-center gap-2.5">
                <StepIcon>
                  <PersonIcon />
                </StepIcon>
                <span className="font-mono text-[11px] font-semibold tracking-wide text-mute">
                  01
                </span>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-ink">
                <span className="font-semibold">You’re in.</span> Set your
                skills (optional) so matches are better.
              </p>
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">
                Your skills
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skills.length === 0 ? (
                  <span className="text-[12px] text-mute">None yet —</span>
                ) : (
                  skills.slice(0, 12).map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-line bg-white px-2.5 py-1 text-[12px] font-medium text-ink"
                    >
                      {s}
                    </span>
                  ))
                )}
                <Link
                  href="/dashboard/settings#skills"
                  onClick={onClose}
                  className="rounded-full border border-dashed border-mark/60 bg-mark-soft/40 px-2.5 py-1 text-[12px] font-semibold text-mark-deep transition hover:bg-mark-soft"
                >
                  + Add
                </Link>
              </div>
            </section>

            {/* 02 */}
            <section className="rounded-2xl border border-line bg-paper/60 p-4 sm:p-5">
              <div className="flex items-center gap-2.5">
                <StepIcon>
                  <BoxArrowIcon />
                </StepIcon>
                <span className="font-mono text-[11px] font-semibold tracking-wide text-mute">
                  02
                </span>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-ink">
                <span className="font-semibold">Copy your MCP link.</span> Paste
                this into the AI tool you already use.
              </p>
              <div className="mt-4 flex items-stretch overflow-hidden rounded-xl bg-ink">
                <code className="min-w-0 flex-1 truncate px-3 py-2.5 font-mono text-[12px] text-white/95 sm:text-[13px]">
                  {MCP_ONBOARDING_URL}
                </code>
                <button
                  type="button"
                  onClick={() => void copy(MCP_ONBOARDING_URL)}
                  className="inline-flex shrink-0 items-center gap-1.5 bg-mark px-3.5 text-[11px] font-semibold uppercase tracking-wide text-ink transition hover:bg-mark-deep hover:text-white"
                >
                  <CopyGlyph />
                  Copy
                </button>
              </div>
            </section>

            {/* 03 */}
            <section className="rounded-2xl border border-line bg-paper/60 p-4 sm:p-5">
              <div className="flex items-center gap-2.5">
                <StepIcon>
                  <BracketsIcon />
                </StepIcon>
                <span className="font-mono text-[11px] font-semibold tracking-wide text-mute">
                  03
                </span>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-ink">
                <span className="font-semibold">Add it to your AI.</span> Use a
                free client, or a pro tool you already pay for.
              </p>

              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">
                    Free
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {free.map((c) => (
                      <ClientTile
                        key={c.id}
                        id={c.id}
                        label={c.label}
                        active={expanded === c.id}
                        onClick={() =>
                          setExpanded((v) => (v === c.id ? null : c.id))
                        }
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-mute">
                    Pro tools
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {pro.map((c) => (
                      <ClientTile
                        key={c.id}
                        id={c.id}
                        label={c.label}
                        active={expanded === c.id}
                        onClick={() =>
                          setExpanded((v) => (v === c.id ? null : c.id))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              {expanded ? (
                <ol className="mt-3 list-decimal space-y-1 rounded-xl border border-line bg-white px-4 py-3 pl-7 text-[12.5px] leading-relaxed text-mute">
                  {ONBOARDING_CLIENTS.find((c) => c.id === expanded)?.howTo.map(
                    (line) => (
                      <li key={line}>{line}</li>
                    ),
                  )}
                </ol>
              ) : null}

              <p className="mt-3 text-[11px] leading-relaxed text-mute">
                ChatGPT only in developer mode on paid plans. Instinct is free
                in beta (invite).
              </p>
            </section>

            {/* 04 */}
            <section className="rounded-2xl border border-line bg-paper/60 p-4 sm:p-5">
              <div className="flex items-center gap-2.5">
                <StepIcon>
                  <ChatIcon />
                </StepIcon>
                <span className="font-mono text-[11px] font-semibold tracking-wide text-mute">
                  04
                </span>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-ink">
                <span className="font-semibold">Just ask.</span> Try a question
                like this.
              </p>
              <div className="mt-4 flex items-start gap-2 rounded-2xl rounded-bl-md bg-mark-soft px-3.5 py-3">
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
                  {SAMPLE_PROMPT}
                </p>
                <button
                  type="button"
                  aria-label="Copy sample question"
                  onClick={() => void copy(SAMPLE_PROMPT)}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-mark-deep transition hover:bg-white/70"
                >
                  <CopyGlyph />
                </button>
              </div>
              <div className="mt-3 rounded-xl border border-line bg-white px-3.5 py-3">
                <span className="inline-flex rounded-full bg-mark-soft px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-mark-deep">
                  Remote from India
                </span>
                <p className="mt-2 text-[14px] font-semibold tracking-[-0.01em] text-ink">
                  Backend Engineer
                </p>
                <p className="mt-1 text-[12.5px] italic leading-snug text-mute">
                  “Remote — open to candidates in India”
                </p>
              </div>
            </section>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-line bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-[12.5px] leading-relaxed text-mute">
            <span
              className="mr-1.5 inline-block size-1.5 rounded-full bg-sun align-middle"
              aria-hidden
            />
            You can reopen this anytime from{" "}
            <span className="font-semibold text-ink">Connect your AI</span>.
          </p>
          <button type="button" onClick={onClose} className="btn-ink shrink-0">
            Got it
          </button>
        </div>

        {toast ? (
          <div
            role="status"
            className="pointer-events-none absolute bottom-20 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-medium text-white shadow-lg"
          >
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClientTile({
  id,
  label,
  active,
  onClick,
}: {
  id: OnboardingClientId;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`flex w-[4.75rem] flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2 transition ${
        active
          ? "border-mark bg-mark-soft"
          : "border-line bg-white hover:border-mark hover:bg-mark-soft/40"
      }`}
    >
      <span className="inline-flex size-9 overflow-hidden rounded-lg shadow-sm ring-1 ring-black/5">
        <AgentLogo id={id} label={label} fill />
      </span>
      <span className="text-[10px] font-medium text-ink">{label}</span>
    </button>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Host: first-visit gate + reopen via custom event. */
export function OnboardingHost() {
  const [open, setOpen] = useState(false);
  const [skills, setSkills] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  const dismiss = useCallback(() => {
    setOpen(false);
    writeOnboardingLocal();
    void fetch("/api/me/onboarding", { method: "POST" }).catch(() => {});
  }, []);

  const openModal = useCallback((fromEl?: HTMLElement | null) => {
    if (fromEl) triggerRef.current = fromEl;
    setOpen(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const localSeen = readOnboardingLocal();
      try {
        const res = await fetch("/api/me/onboarding");
        if (!res.ok) {
          if (!cancelled) {
            setReady(true);
            if (!localSeen) setOpen(true);
          }
          return;
        }
        const body = (await res.json()) as {
          seen?: boolean;
          skills?: string[];
        };
        if (cancelled) return;
        setSkills(Array.isArray(body.skills) ? body.skills : []);
        setReady(true);
        if (body.seen) {
          writeOnboardingLocal();
          return;
        }
        if (localSeen) {
          void fetch("/api/me/onboarding", { method: "POST" }).catch(() => {});
          return;
        }
        setOpen(true);
      } catch {
        if (!cancelled) {
          setReady(true);
          if (!localSeen) setOpen(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<{ trigger?: HTMLElement | null }>)
        .detail;
      void fetch("/api/me/onboarding")
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { skills?: string[] } | null) => {
          if (body && Array.isArray(body.skills)) setSkills(body.skills);
        })
        .catch(() => {})
        .finally(() => openModal(detail?.trigger ?? null));
    }
    window.addEventListener(ONBOARDING_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, onOpen);
  }, [openModal]);

  if (!ready && !open) return null;

  return (
    <OnboardingModal
      open={open}
      skills={skills}
      onClose={dismiss}
      returnFocusRef={triggerRef}
    />
  );
}
