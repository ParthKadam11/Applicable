"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { ByokKeysPanel } from "@/components/byok-keys-panel";
import { CompanyLogo } from "@/components/company-logo";
import { SaveJobButton } from "@/components/save-job-button";
import { SignInPrompt } from "@/components/sign-in-prompt";
import {
  clearRecentSearches,
  filtersFromSearchParams,
  filtersToJobsQuery,
  loadByokKey,
  loadRecentSearches,
  nlToFilters,
  pushRecentSearch,
  type JobsFilterFields,
  type RecentSearch,
} from "@/lib/ai-search";
import type { ApiJob, ApiJobDetail } from "@/lib/jobs-api";
import { ELIGIBILITY_LABELS } from "@/lib/constants";
import { formatIst } from "@/lib/format";

type ListResponse = {
  items: ApiJob[];
  nextCursor: string | null;
  total: number;
  lastIngestionAt: string | null;
};

function Chip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex items-center gap-1.5 rounded-full bg-mark-soft/45 px-2.5 py-1.5 text-[12px] font-semibold tracking-[-0.01em] text-mark-deep transition hover:bg-mark-soft/70"
      title="Remove filter"
    >
      {label}
      <span className="text-[11px] font-normal text-mute" aria-hidden>
        ×
      </span>
    </button>
  );
}

function labelText(label: string | null | undefined) {
  if (!label) return "—";
  return ELIGIBILITY_LABELS[label] ?? label;
}

export function DashboardSearch() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [nl, setNl] = useState(searchParams.get("nl") ?? "");
  const [hasKey, setHasKey] = useState(false);
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [recent, setRecent] = useState<RecentSearch[]>([]);

  const [items, setItems] = useState<ApiJob[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ApiJobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const qsKey = searchParams.toString();
  const jobId = searchParams.get("job");
  const filters = useMemo(
    () => filtersFromSearchParams(searchParams),
    [qsKey],
  );
  const hasFilterParams = useMemo(() => {
    return Boolean(
      searchParams.get("q") ||
        searchParams.get("labels") ||
        searchParams.get("role") ||
        searchParams.get("ats") ||
        searchParams.get("posted") ||
        searchParams.get("has_salary") ||
        searchParams.get("sort") ||
        searchParams.get("nl"),
    );
  }, [qsKey]);

  const refreshKeyState = useCallback(() => {
    const store = loadByokKey();
    setHasKey(!!store);
    setShowKeySetup(!store);
    setRecent(loadRecentSearches());
  }, []);

  useEffect(() => {
    refreshKeyState();
  }, [refreshKeyState]);

  useEffect(() => {
    setNl(searchParams.get("nl") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (authStatus === "unauthenticated") setSignInOpen(true);
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    void (async () => {
      try {
        const res = await fetch("/api/me/saved?ids=1");
        if (!res.ok) return;
        const body = (await res.json()) as { ids?: string[] };
        setSavedIds(new Set(body.ids ?? []));
      } catch {
        /* ignore */
      }
    })();
  }, [authStatus]);

  const applyFiltersToUrl = useCallback(
    (next: JobsFilterFields, nlText: string | null, job?: string | null) => {
      const qs = filtersToJobsQuery(next, {
        nl: nlText || undefined,
        job: job === undefined ? jobId : job,
      });
      startTransition(() => {
        router.replace(`/dashboard/search?${qs}`, { scroll: false });
      });
    },
    [router, jobId],
  );

  const patchFilter = useCallback(
    (patch: Partial<JobsFilterFields> | { clear: keyof JobsFilterFields }) => {
      const next: JobsFilterFields = { ...filters };
      if ("clear" in patch) {
        const key = patch.clear;
        if (key === "labels") next.labels = ["open", "india_remote"];
        else if (key === "posted") next.posted = "all";
        else if (key === "sort") next.sort = "newest";
        else if (key === "has_salary") delete next.has_salary;
        else if (key === "q") delete next.q;
        else if (key === "role") delete next.role;
        else if (key === "ats") delete next.ats;
      } else {
        Object.assign(next, patch);
      }
      applyFiltersToUrl(next, searchParams.get("nl"));
    },
    [filters, applyFiltersToUrl, searchParams],
  );

  // Fetch jobs whenever filter URL changes (no LLM)
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    if (!hasFilterParams) {
      setItems([]);
      setTotal(0);
      setNextCursor(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setFailed(false);
      setLoading(true);
      try {
        const qs = filtersToJobsQuery(filters);
        const res = await fetch(`/api/jobs?${qs}`);
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const body = (await res.json()) as ListResponse;
        if (cancelled) return;
        setItems(body.items);
        setTotal(body.total);
        setNextCursor(body.nextCursor);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [qsKey, authStatus, hasFilterParams, filters]);

  useEffect(() => {
    if (!jobId || authStatus !== "authenticated") {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) {
          if (!cancelled) setDetail(null);
          return;
        }
        const body = (await res.json()) as ApiJobDetail;
        if (!cancelled) setDetail(body);
      } catch {
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, authStatus]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = filtersToJobsQuery(filters);
      const sp = new URLSearchParams(qs);
      sp.set("cursor", nextCursor);
      const res = await fetch(`/api/jobs?${sp.toString()}`);
      if (!res.ok) return;
      const body = (await res.json()) as ListResponse;
      setItems((prev) => {
        const seen = new Set(prev.map((j) => j.id));
        return [...prev, ...body.items.filter((j) => !seen.has(j.id))];
      });
      setNextCursor(body.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !nextCursor) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, items.length]);

  async function runSearch(nlText: string) {
    if (authStatus !== "authenticated") {
      setSignInOpen(true);
      return;
    }
    const store = loadByokKey();
    if (!store) {
      setShowKeySetup(true);
      setError("Add your API key to run AI search.");
      return;
    }
    if (!nlText.trim()) return;
    setBusy(true);
    setError(null);
    const result = await nlToFilters(nlText.trim(), store);
    setBusy(false);
    if (!result.ok) {
      setError(result.userMessage);
      return;
    }
    pushRecentSearch(nlText.trim(), result.filters);
    setRecent(loadRecentSearches());
    applyFiltersToUrl(result.filters, nlText.trim(), null);
  }

  function applyRecent(r: RecentSearch) {
    setNl(r.nl);
    applyFiltersToUrl(r.filters, r.nl, null);
  }

  const openInJobsHref = `/dashboard/jobs?${filtersToJobsQuery(filters)}`;

  if (authStatus === "loading") {
    return <p className="py-16 text-center text-sm text-mute">Loading…</p>;
  }

  if (!session?.user) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            AI Search
          </h1>
          <p className="mt-1.5 text-[13px] text-mute sm:text-[14px]">
            Sign in to search with your own API key.
          </p>
        </header>
        <SignInPrompt
          open={signInOpen}
          message="Sign in to use AI search"
          onClose={() => setSignInOpen(false)}
        />
        {!signInOpen ? (
          <p className="text-sm text-mute">
            <button
              type="button"
              className="text-mark-deep underline-offset-2 hover:underline"
              onClick={() => setSignInOpen(true)}
            >
              Sign in
            </button>{" "}
            to continue.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            AI Search
          </h1>
          <p className="mt-1.5 text-[13px] text-mute sm:text-[14px]">
            {hasFilterParams
              ? `Showing ${total} jobs`
              : "Natural-language search with your own key"}
          </p>
        </div>
        {hasKey ? (
          <button
            type="button"
            className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute hover:text-ink"
            onClick={() => setShowKeySetup((v) => !v)}
          >
            Change key
          </button>
        ) : null}
      </header>

      {showKeySetup || !hasKey ? (
        <ByokKeysPanel
          title={hasKey ? "Change/remove key" : "Add your API key"}
          defaultOpen
          onKeyChange={refreshKeyState}
        />
      ) : null}

      <div className="space-y-3 border-b border-line/80 pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input
            type="search"
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            placeholder="backend node from India, this week, with salary…"
            className="w-full flex-1 border-0 border-b border-line bg-transparent pb-2.5 text-[15px] text-ink outline-none placeholder:text-mute/70 focus:border-mark"
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch(nl);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void runSearch(nl)}
            className="shrink-0 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep transition hover:text-ink disabled:opacity-40"
          >
            {busy ? "Searching…" : "Search"}
          </button>
        </div>
        {error ? <p className="text-[13px] text-sun">{error}</p> : null}

        {hasFilterParams ? (
          <div className="-mx-1 flex flex-wrap items-center gap-0.5">
            {filters.q ? (
              <Chip
                label={`q · ${filters.q}`}
                onClear={() => patchFilter({ clear: "q" })}
              />
            ) : null}
            {filters.labels?.length ? (
              <Chip
                label={`labels · ${filters.labels.join(" + ")}`}
                onClear={() => patchFilter({ clear: "labels" })}
              />
            ) : null}
            {filters.role ? (
              <Chip
                label={`role · ${filters.role}`}
                onClear={() => patchFilter({ clear: "role" })}
              />
            ) : null}
            {filters.ats ? (
              <Chip
                label={`ats · ${filters.ats}`}
                onClear={() => patchFilter({ clear: "ats" })}
              />
            ) : null}
            {filters.posted && filters.posted !== "all" ? (
              <Chip
                label={`posted · ${filters.posted}`}
                onClear={() => patchFilter({ clear: "posted" })}
              />
            ) : null}
            {filters.has_salary === true ? (
              <Chip
                label="has salary"
                onClear={() => patchFilter({ clear: "has_salary" })}
              />
            ) : null}
            {filters.has_salary === false ? (
              <Chip
                label="no salary"
                onClear={() => patchFilter({ clear: "has_salary" })}
              />
            ) : null}
            {filters.sort && filters.sort !== "newest" ? (
              <Chip
                label={`sort · ${filters.sort}`}
                onClear={() => patchFilter({ clear: "sort" })}
              />
            ) : null}
            <Link
              href={openInJobsHref}
              className="ml-auto px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute transition hover:text-mark-deep"
            >
              Open in Jobs
            </Link>
          </div>
        ) : null}
      </div>

      {recent.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
              Recent
            </p>
            <button
              type="button"
              className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute transition hover:text-ink"
              onClick={() => {
                clearRecentSearches();
                setRecent([]);
              }}
            >
              Clear
            </button>
          </div>
          <ul className="-mx-1 flex flex-wrap gap-0.5">
            {recent.map((r) => (
              <li key={`${r.at}-${r.nl}`}>
                <button
                  type="button"
                  onClick={() => applyRecent(r)}
                  className="max-w-xs truncate rounded-full px-2.5 py-1.5 text-left text-[13px] text-mute transition hover:bg-mark-soft/50 hover:text-ink"
                  title={r.nl}
                >
                  {r.nl}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        className={`grid gap-8 lg:gap-10 ${
          jobId
            ? "lg:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)]"
            : "grid-cols-1"
        }`}
      >
        <div className="min-w-0">
          {!hasFilterParams ? (
            <p className="py-12 text-center text-sm text-mute">
              Describe the roles you want. Filters are parsed with your key,
              then results come from our job database.
            </p>
          ) : failed ? (
            <p className="py-16 text-center text-sm text-mute">
              Couldn’t load jobs.{" "}
              <button
                type="button"
                className="text-mark-deep underline-offset-2 hover:underline"
                onClick={() => router.refresh()}
              >
                Retry
              </button>
            </p>
          ) : loading ? (
            <ul className="divide-y divide-line/50">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="flex gap-3.5 py-4">
                  <div className="skel size-9 shrink-0 rounded-[0.7rem]" />
                  <div className="flex-1 space-y-2 pt-0.5">
                    <div className="skel h-4 w-2/3 rounded" />
                    <div className="skel h-3 w-1/3 rounded" />
                  </div>
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <p className="py-16 text-center text-sm text-mute">
              No jobs match. Try removing a filter.
            </p>
          ) : (
            <ul>
              {items.map((job, i) => {
                const quote = job.evidence[0] ?? null;
                const selected = jobId === job.id;
                const isIndia = job.label === "india_remote";
                return (
                  <li
                    key={job.id}
                    className="auth-job-row border-b border-line/50 last:border-b-0"
                    style={{ animationDelay: `${Math.min(i, 10) * 28}ms` }}
                  >
                    <div
                      className={`group flex items-start gap-3.5 py-4 transition-colors sm:gap-4 ${
                        selected ? "bg-mark-soft/35" : "hover:bg-mark-soft/25"
                      }`}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-3.5 text-left sm:gap-4"
                        onClick={() => {
                          const qs = filtersToJobsQuery(filters, {
                            nl: searchParams.get("nl") || undefined,
                            job: job.id,
                          });
                          startTransition(() => {
                            router.replace(`/dashboard/search?${qs}`, {
                              scroll: false,
                            });
                          });
                        }}
                      >
                        <CompanyLogo
                          company={job.company.name}
                          size={36}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[14.5px] font-semibold leading-snug tracking-[-0.01em] text-ink sm:text-[15px]">
                              {job.title}
                              {job.isNew ? (
                                <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-[0.06em] text-sun">
                                  New
                                </span>
                              ) : null}
                            </p>
                            <span
                              className={`mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em] ${
                                isIndia ? "text-mark-deep" : "text-mute"
                              }`}
                            >
                              {isIndia ? "India" : labelText(job.label)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[12.5px] text-mute">
                            {job.company.name}
                            {job.locationText ? ` · ${job.locationText}` : ""}
                            {job.salaryText ? ` · ${job.salaryText}` : ""}
                          </p>
                          {quote ? (
                            <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-mute/90">
                              <span className="text-mark-deep/80">“</span>
                              {quote}
                              <span className="text-mark-deep/80">”</span>
                            </p>
                          ) : null}
                          <p className="mt-1.5 text-[11px] text-mute/80">
                            {job.postedAt
                              ? formatIst(job.postedAt)
                              : formatIst(job.firstSeenAt)}
                          </p>
                        </div>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
                        <SaveJobButton
                          jobId={job.id}
                          saved={savedIds.has(job.id)}
                          onSavedChange={(s) => {
                            setSavedIds((prev) => {
                              const n = new Set(prev);
                              if (s) n.add(job.id);
                              else n.delete(job.id);
                              return n;
                            });
                          }}
                        />
                        <a
                          href={job.applyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-semibold uppercase tracking-[0.04em] text-mark-deep opacity-80 transition hover:opacity-100"
                        >
                          Apply
                        </a>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {nextCursor ? (
            <div ref={loadMoreRef} className="py-6 text-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                className="text-[12px] font-semibold uppercase tracking-[0.06em] text-mute transition hover:text-mark-deep disabled:opacity-40"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>

        {jobId ? (
          <aside className="dash-job-detail lg:sticky lg:top-6 lg:self-start lg:border-l lg:border-line/70 lg:pl-8">
            {detailLoading ? (
              <p className="text-sm text-mute">Loading…</p>
            ) : !detail ? (
              <p className="py-8 text-sm text-mute">Job not found.</p>
            ) : (
              <div className="space-y-6 pb-8">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-xl leading-snug tracking-tight text-ink">
                      {detail.title}
                    </h2>
                    <p className="mt-1.5 text-[13px] text-mute">
                      {detail.company.name}
                      {detail.locationText ? ` · ${detail.locationText}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute transition hover:text-ink"
                    onClick={() =>
                      applyFiltersToUrl(filters, searchParams.get("nl"), null)
                    }
                  >
                    Close
                  </button>
                </div>
                <p className="text-[12px] leading-relaxed text-mute">
                  Decided by {detail.decidedBy}
                  <span className="mx-1.5 text-line">·</span>
                  First {formatIst(detail.firstSeenAt)}
                  <span className="mx-1.5 text-line">·</span>
                  Last {formatIst(detail.lastSeenAt)}
                </p>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
                    Evidence
                  </p>
                  <ul className="mt-2.5 space-y-2.5">
                    {detail.evidence.length === 0 ? (
                      <li className="text-[13px] text-mute">—</li>
                    ) : (
                      detail.evidence.map((q) => (
                        <li
                          key={q}
                          className="text-[13px] leading-relaxed text-mute"
                        >
                          <span className="text-mark-deep/80">“</span>
                          {q}
                          <span className="text-mark-deep/80">”</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
                    Description
                  </p>
                  <p className="mt-2.5 max-h-52 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-mute">
                    {detail.description || "—"}
                  </p>
                </div>
                <a
                  href={detail.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ink inline-flex w-full"
                >
                  Apply
                </a>
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
