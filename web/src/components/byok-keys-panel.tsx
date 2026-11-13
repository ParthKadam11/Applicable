"use client";

import { useEffect, useState } from "react";
import {
  type ByokProvider,
  clearByokKey,
  loadByokKey,
  saveByokKey,
} from "@/lib/ai-search";

type Props = {
  /** Compact embed under AI Search / Settings */
  title?: string;
  defaultOpen?: boolean;
};

/** Client-only AI search keys (localStorage). Shown on AI Search + Settings. */
export function ByokKeysPanel({
  title = "AI search keys (BYOK)",
  defaultOpen = false,
}: Props) {
  const [hasKey, setHasKey] = useState(false);
  const [provider, setProvider] = useState<ByokProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const store = loadByokKey();
    setHasKey(!!store);
    if (store) setProvider(store.provider);
  }, []);

  function persistKey() {
    if (!apiKey.trim()) return;
    saveByokKey({ provider, apiKey: apiKey.trim() });
    setHasKey(true);
    setApiKey("");
    setOpen(false);
  }

  return (
    <section className="rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-ink">{title}</h2>
          <p className="mt-0.5 text-[13px] text-mute">
            Keys stay in this browser only. Never sent to Applicable servers.
          </p>
        </div>
        <button
          type="button"
          className="text-[11px] uppercase tracking-wide text-mute hover:text-ink"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : hasKey ? "Change key" : "Add key"}
        </button>
      </div>

      <div className="px-4 py-3 sm:px-5">
        <p className="text-[13px] text-mute">
          Status:{" "}
          <span className="font-medium text-ink">
            {hasKey ? `Saved (${provider})` : "No key"}
          </span>
        </p>

        {open ? (
          <div className="mt-3 space-y-2 rounded-xl border border-line bg-paper p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ByokProvider)}
                className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
              >
                <option value="gemini">Gemini</option>
                <option value="groq">Groq</option>
                <option value="openai">OpenAI</option>
              </select>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste API key"
                className="w-full flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-mark"
              />
              <button
                type="button"
                onClick={persistKey}
                className="rounded-full bg-mark px-4 py-2 text-[11px] font-semibold uppercase text-ink"
              >
                Save key
              </button>
            </div>
            {hasKey ? (
              <button
                type="button"
                onClick={() => {
                  clearByokKey();
                  setHasKey(false);
                }}
                className="text-[11px] uppercase text-mute hover:text-ink"
              >
                Clear key
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
