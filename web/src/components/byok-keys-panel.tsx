"use client";

import { useEffect, useState } from "react";
import {
  type ByokProvider,
  clearByokKey,
  loadByokKey,
  saveByokKey,
  testByokKey,
} from "@/lib/ai-search";

type Props = {
  /** Compact embed under AI Search / Settings */
  title?: string;
  defaultOpen?: boolean;
  onKeyChange?: () => void;
};

/**
 * Client-only AI search keys (localStorage).
 * Keys are NEVER posted to Applicable API routes — only used in-browser
 * against Gemini / Groq / OpenAI.
 */
export function ByokKeysPanel({
  title = "Change/remove key",
  defaultOpen = false,
  onKeyChange,
}: Props) {
  const [hasKey, setHasKey] = useState(false);
  const [provider, setProvider] = useState<ByokProvider>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [open, setOpen] = useState(defaultOpen);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

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
    setTestMsg(null);
    setOpen(false);
    onKeyChange?.();
  }

  async function runTest() {
    const store = loadByokKey();
    const key = apiKey.trim() || store?.apiKey;
    const prov = apiKey.trim() ? provider : (store?.provider ?? provider);
    if (!key) {
      setTestMsg("Paste a key first.");
      return;
    }
    setTesting(true);
    setTestMsg(null);
    const result = await testByokKey({ provider: prov, apiKey: key });
    setTesting(false);
    if (result.ok) setTestMsg("Key ok");
    else setTestMsg(result.error.message);
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
                autoComplete="off"
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
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={testing}
                onClick={() => void runTest()}
                className="text-[11px] uppercase tracking-wide text-mark-deep hover:text-ink disabled:opacity-40"
              >
                {testing ? "Testing…" : "Test key"}
              </button>
              {hasKey ? (
                <button
                  type="button"
                  onClick={() => {
                    clearByokKey();
                    setHasKey(false);
                    setTestMsg(null);
                    onKeyChange?.();
                  }}
                  className="text-[11px] uppercase text-mute hover:text-ink"
                >
                  Remove key
                </button>
              ) : null}
            </div>
            {testMsg ? (
              <p className="text-[12px] text-mute">{testMsg}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
