"use client";

/**
 * Legacy embed used by JobsTable. Prefer DashboardSearch for the full AI Search tab.
 * Keys stay in localStorage only — never posted to Applicable APIs.
 */
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { SoftSelect } from "@/components/ui/soft-select";
import {
  type ByokProvider,
  type JobsFilterFields,
  BYOK_PROVIDER_OPTIONS,
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
    <div className="space-y-3 border-b border-line/80 pb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] text-mute">AI search (BYOK)</p>
        <button
          type="button"
          className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute transition hover:text-ink"
          onClick={() => {
            if (!data?.user) {
              setPromptOpen(true);
              return;
            }
            setShowKeyForm((v) => !v);
          }}
        >
          {hasKey ? "Change key" : "Add key"}
        </button>
      </div>

      {showKeyForm ? (
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
              className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep"
            >
              Save
            </button>
          </div>
          {hasKey ? (
            <button
              type="button"
              onClick={() => {
                clearByokKey();
                setHasKey(false);
              }}
              className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute hover:text-ink"
            >
              Remove key
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input
          type="search"
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          placeholder="e.g. backend roles posted this week"
          className="w-full flex-1 border-0 border-b border-line bg-transparent pb-2.5 text-[15px] text-ink outline-none placeholder:text-mute/70 focus:border-mark"
          onKeyDown={(e) => {
            if (e.key === "Enter") void runAi();
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAi()}
          className="shrink-0 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep disabled:opacity-40"
        >
          {busy ? "…" : "Search"}
        </button>
      </div>

      {error ? <p className="text-[12px] text-sun">{error}</p> : null}

      {filters ? (
        <p className="text-[12px] text-mute">
          {[
            filters.q ? `q · ${filters.q}` : null,
            filters.role ? `role · ${filters.role}` : null,
            (filters.labels ?? []).join(" + "),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}

      <SignInPrompt
        open={promptOpen}
        message="Sign in to use AI search"
        onClose={() => setPromptOpen(false)}
      />
    </div>
  );
}
