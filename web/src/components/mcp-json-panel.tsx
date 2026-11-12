"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MCP_URL } from "@/lib/constants";
import { CopyButton } from "@/components/copy-button";

function highlightJson(src: string): ReactNode[] {
  const re =
    /("(?:\\.|[^"\\])*")\s*:|("(?:\\.|[^"\\])*")|(\{|\}|\[|\])|(:|,)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) {
      out.push(
        <span key={key++} className="text-mute/80">
          {src.slice(last, m.index)}
        </span>,
      );
    }
    if (m[1]) {
      out.push(
        <span key={key++} className="text-mark-deep">
          {m[1]}
        </span>,
      );
      out.push(
        <span key={key++} className="text-mute">
          :
        </span>,
      );
    } else if (m[2]) {
      out.push(
        <span key={key++} className="text-ink">
          {m[2]}
        </span>,
      );
    } else {
      out.push(
        <span key={key++} className="text-mute">
          {m[0]}
        </span>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) {
    out.push(
      <span key={key++} className="text-mute/80">
        {src.slice(last)}
      </span>,
    );
  }
  return out;
}

/** Expandable mcp.json snippet - light coastal code panel. */
export function McpJsonPanel({ snippet }: { snippet: string }) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <div className="mt-10">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] uppercase tracking-wide text-mute transition hover:text-ink"
      >
        {open ? "Hide advanced config" : "Advanced · JSON config"}
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="mcp-json"
            initial={
              reduceMotion
                ? { opacity: 1, height: "auto" }
                : { opacity: 0, height: 0 }
            }
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="relative mt-4 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_18px_40px_-28px_rgba(12,36,56,0.35)]">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-mark to-transparent"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-mark/15 blur-2xl"
                aria-hidden
              />

              <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-line bg-soft/70 px-4 py-3 backdrop-blur-sm">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-mute">
                    mcp.json
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-ink/70">
                    {MCP_URL}
                  </p>
                </div>
                <CopyButton text={snippet} label="Copy" />
              </div>

              <pre className="relative overflow-x-auto px-4 py-4 text-[12.5px] leading-[1.7] sm:px-5">
                <code>{highlightJson(snippet)}</code>
              </pre>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
