"use client";

import { useState } from "react";
import { copyText } from "@/lib/copy-text";

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className={`inline-flex h-9 min-w-[4.75rem] items-center justify-center rounded-full px-3 font-mono text-[11px] uppercase transition ${
        copied
          ? "bg-mark text-ink shadow-[0_4px_12px_color-mix(in_srgb,var(--mark)_30%,transparent)]"
          : "border border-line bg-white text-ink hover:border-mark hover:bg-mark-soft"
      }`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
