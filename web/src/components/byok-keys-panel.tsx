"use client";

import { useEffect, useState } from "react";
import { SoftSelect } from "@/components/ui/soft-select";
import {
  type ByokProvider,
  BYOK_PROVIDER_OPTIONS,
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

  const [masked, setMasked] = useState<string | null>(null);

  useEffect(() => {
    const store = loadByokKey();
    setHasKey(!!store);
    if (store) {
      setProvider(store.provider);
      const k = store.apiKey;
      setMasked(k.length <= 4 ? "••••" : `••••${k.slice(-4)}`);
    } else {
      setMasked(null);
    }
  }, []);

  function persistKey() {
    if (!apiKey.trim()) return;
    const key = apiKey.trim();
    saveByokKey({ provider, apiKey: key });
    setHasKey(true);
    setMasked(key.length <= 4 ? "••••" : `••••${key.slice(-4)}`);
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
    <section className="space-y-3 border-b border-line/80 pb-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg tracking-tight text-ink">
            {title}
          </h2>
          <p className="mt-1 text-[13px] text-mute">
            Keys stay in this browser only ·{" "}
            <span className="text-ink">
              {hasKey
                ? `Saved (${provider}${masked ? ` · ${masked}` : ""})`
                : "No key"}
            </span>
          </p>
        </div>
        <button
          type="button"
          className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute transition hover:text-ink"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : hasKey ? "Change key" : "Add key"}
        </button>
      </div>

      {open ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <SoftSelect
              label="Provider"
              value={provider}
              defaultValue="gemini"
              options={[...BYOK_PROVIDER_OPTIONS]}
              onChange={(v) => setProvider(v as ByokProvider)}
            />
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste API key"
              autoComplete="off"
              className="w-full flex-1 border-0 border-b border-line bg-transparent pb-2 text-[14px] text-ink outline-none placeholder:text-mute/70 focus:border-mark"
            />
            <button
              type="button"
              onClick={persistKey}
              className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep transition hover:text-ink"
            >
              Save
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button
              type="button"
              disabled={testing}
              onClick={() => void runTest()}
              className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute transition hover:text-mark-deep disabled:opacity-40"
            >
              {testing ? "Testing…" : "Test key"}
            </button>
            {hasKey ? (
              <button
                type="button"
                onClick={() => {
                  clearByokKey();
                  setHasKey(false);
                  setMasked(null);
                  setTestMsg(null);
                  onKeyChange?.();
                }}
                className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute transition hover:text-ink"
              >
                Remove key
              </button>
            ) : null}
            {testMsg ? (
              <span className="text-[12px] text-mute">{testMsg}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
