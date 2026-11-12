"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
        copied
          ? "bg-emerald-400/15 text-emerald-300"
          : "bg-white/[0.04] text-zinc-300 ring-1 ring-white/[0.08] hover:bg-white/[0.07] hover:text-white"
      } ${className}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
