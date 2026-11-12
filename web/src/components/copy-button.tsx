"use client";

import { useState } from "react";

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
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
      className={`inline-flex h-9 min-w-[4.75rem] items-center justify-center rounded-full px-3 font-mono text-[11px] uppercase transition ${
        copied
          ? "bg-mark text-ink shadow-[0_4px_12px_rgba(76,201,240,0.3)]"
          : "border border-line bg-white text-ink hover:border-mark hover:bg-[#eaf4ff]"
      }`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
