"use client";

/**
 * Legacy embed used by JobsTable. Prefer DashboardSearch for the full AI Search tab.
 * Keys stay in localStorage only — never posted to Applicable APIs.
 */
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { SignInPrompt } from "@/components/sign-in-prompt";
import {
  type ByokProvider,
  type JobsFilterFields,
  clearByokKey,
  filtersToJobsQuery,
  loadByokKey,
  nlToFilters,
  saveByokKey,
} from "@/lib/ai-search";

type Props = {
  onFilters: (filters: JobsFilterFields, queryString: string) => void;
};

export function AiSearchBar({ onFilters }: Props) {
  const { data } = useSession();
  const [promptOpen, setPromptOpen] = useState(false);
  const [nl, setNl] = useState("");
  const [filters, setFilters] = useState<JobsFilterFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [provider, setProvider] = useState<ByokProvider>("gemini");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    setHasKey(!!loadByokKey());
  }, []);

  function persistKey() {
    if (!apiKey.trim()) return;
    saveByokKey({ provider, apiKey: apiKey.trim() });
    setHasKey(true);
    setShowKeyForm(false);
    setApiKey("");
  }

  async function runAi() {
    if (!data?.user) {
      setPromptOpen(true);
      return;
    }
    const store = loadByokKey();
    if (!store) {
      setShowKeyForm(true);
      return;
    }
    if (!nl.trim()) return;
    setBusy(true);
    setError(null);
    const result = await nlToFilters(nl.trim(), store);
    setBusy(false);
    if (!result.ok) {
      setError(result.userMessage);
      return;
    }
    setFilters(result.filters);
    onFilters(result.filters, filtersToJobsQuery(result.filters));
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-ink">AI search (BYOK)</p>
        <button
          type="button"
          className="text-[11px] uppercase tracking-wide text-mute hover:text-ink"
          onClick={() => {
            if (!data?.user) {
              setPromptOpen(true);
              return;
            }
            setShowKeyForm((v) => !v);
          }}
        >
          {hasKey ? "Change key" : "Add your key for AI search"}
        </button>
      </div>

      {showKeyForm ? (
        <div className="space-y-2 rounded-xl border border-line bg-paper p-3">
          <p className="text-[12px] text-mute">
            Key stays in this browser only. Never sent to Applicable servers.
          </p>
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
          {hasKey ? (
            <button
              type="button"
              onClick={() => {
                clearByokKey();
                setHasKey(false);
              }}
              className="text-[11px] uppercase text-mute hover:text-ink"
            >
              Remove key
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          placeholder="e.g. backend roles posted this week"
          className="w-full flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-mark"
          onKeyDown={(e) => {
            if (e.key === "Enter") void runAi();
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAi()}
          className="rounded-full border border-line bg-white px-4 py-2 text-[11px] uppercase tracking-wide text-ink disabled:opacity-40"
        >
          {busy ? "…" : "AI search"}
        </button>
      </div>

      {error ? <p className="text-[12px] text-sun">{error}</p> : null}

      {filters ? (
        <div className="flex flex-wrap gap-2 text-[11px] text-mute">
          {filters.q ? <span>q: {filters.q}</span> : null}
          {filters.role ? <span>role: {filters.role}</span> : null}
          <span>{(filters.labels ?? []).join(" + ")}</span>
        </div>
      ) : null}

      <SignInPrompt
        open={promptOpen}
        message="Sign in to use AI search"
        onClose={() => setPromptOpen(false)}
      />
    </div>
  );
}
