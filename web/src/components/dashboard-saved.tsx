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
import { CompanyLogo } from "@/components/company-logo";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { SoftSelect } from "@/components/ui/soft-select";
import type { ApiJobDetail } from "@/lib/jobs-api";
import type { SavedApiJob } from "@/lib/saved-api";
import { ELIGIBILITY_LABELS } from "@/lib/constants";
import { formatIst } from "@/lib/format";

type ListResponse = {
  items: SavedApiJob[];
  nextCursor: string | null;
  total: number;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
] as const;

const APPLIED_OPTIONS = [
  { value: "all", label: "Any" },
  { value: "yes", label: "Applied" },
  { value: "no", label: "Not applied" },
] as const;

const LABEL_OPTIONS = [
  { value: "", label: "All labels" },
  { value: "open", label: "Worldwide open" },
  { value: "india_remote", label: "India remote" },
  { value: "india_onsite", label: "India onsite" },
  { value: "region_locked", label: "Region locked" },
  { value: "unclear", label: "Unclear" },
] as const;

const SORT_OPTIONS = [
  { value: "saved_newest", label: "Saved newest" },
  { value: "posted_newest", label: "Posted newest" },
  { value: "company", label: "Company A–Z" },
] as const;

function buildQuery(sp: URLSearchParams): string {
  const next = new URLSearchParams();
  for (const key of [
    "q",
    "labels",
    "status",
    "applied",
    "sort",
    "job",
  ]) {
    const v = sp.get(key);
    if (v) next.set(key, v);
  }
  return next.toString();
}

function labelText(label: string | null | undefined) {
  if (!label) return "—";
  return ELIGIBILITY_LABELS[label] ?? label;
}

export function DashboardSaved() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<SavedApiJob[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detail, setDetail] = useState<ApiJobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [undo, setUndo] = useState<{
    job: SavedApiJob;
    index: number;
    timer: number;
  } | null>(null);
  const debounceRef = useRef<number | null>(null);
  const [qDraft, setQDraft] = useState(searchParams.get("q") ?? "");
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const qsKey = searchParams.toString();

  const status = searchParams.get("status") ?? "all";
  const applied = searchParams.get("applied") ?? "all";
  const labels = searchParams.get("labels") ?? "";
  const sort = searchParams.get("sort") ?? "saved_newest";
  const jobId = searchParams.get("job");

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      startTransition(() => {
        router.replace(`/dashboard/saved?${sp.toString()}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  useEffect(() => {
    setQDraft(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      setSignInOpen(true);
      setLoading(false);
      setItems([]);
      setTotal(0);
      return;
    }
    if (authStatus !== "authenticated") return;

    let cancelled = false;
    async function load() {
      setFailed(false);
      setLoading(true);
      try {
        const sp = new URLSearchParams(buildQuery(searchParams));
        sp.delete("job");
        const res = await fetch(`/api/me/saved?${sp.toString()}`);
        if (res.status === 401) {
          if (!cancelled) {
            setSignInOpen(true);
            setItems([]);
            setTotal(0);
          }
          return;
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qsKey, authStatus]);

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
      const sp = new URLSearchParams(buildQuery(searchParams));
      sp.delete("job");
      sp.set("cursor", nextCursor);
      const res = await fetch(`/api/me/saved?${sp.toString()}`);
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

  function scheduleUnsave(job: SavedApiJob, index: number) {
    if (undo?.timer) window.clearTimeout(undo.timer);
    setItems((prev) => prev.filter((j) => j.id !== job.id));
    setTotal((t) => Math.max(0, t - 1));
    if (jobId === job.id) patchParams({ job: null });

    const timer = window.setTimeout(() => {
      void fetch(`/api/me/saved/${job.id}`, { method: "DELETE" });
      setUndo(null);
    }, 5000);

    setUndo({ job, index, timer });
  }

  function undoUnsave() {
    if (!undo) return;
    window.clearTimeout(undo.timer);
    setItems((prev) => {
      const next = [...prev];
      next.splice(Math.min(undo.index, next.length), 0, undo.job);
      return next;
    });
    setTotal((t) => t + 1);
    setUndo(null);
  }

  async function toggleApplied(job: SavedApiJob) {
    const next = !job.appliedAt;
    setItems((prev) =>
      prev.map((j) =>
        j.id === job.id
          ? {
              ...j,
              appliedAt: next ? new Date().toISOString() : null,
            }
          : j,
      ),
    );
    const res = await fetch(`/api/me/saved/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applied: next }),
    });
    if (!res.ok) {
      setItems((prev) =>
        prev.map((j) => (j.id === job.id ? job : j)),
      );
    } else {
      const body = (await res.json()) as { appliedAt?: string | null };
      setItems((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? { ...j, appliedAt: body.appliedAt ?? null }
            : j,
        ),
      );
    }
  }

  const exportHref = useMemo(() => {
    const sp = new URLSearchParams(buildQuery(searchParams));
    sp.delete("job");
    sp.set("format", "csv");
    return `/api/me/saved/export?${sp.toString()}`;
  }, [searchParams]);

  if (authStatus === "loading") {
    return (
      <p className="py-16 text-center text-sm text-mute">Loading…</p>
    );
  }

  if (!session?.user) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            Saved
          </h1>
          <p className="mt-1.5 text-[13px] text-mute sm:text-[14px]">
            Sign in to see jobs you’ve bookmarked.
          </p>
        </header>
        <SignInPrompt
          open={signInOpen}
          message="Sign in to view saved jobs"
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
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            Saved
          </h1>
          <p className="mt-1.5 text-[13px] text-mute sm:text-[14px]">
            {total} saved
            {pending ? " · Updating…" : ""}
          </p>
        </div>
        <a
          href={exportHref}
          className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep transition hover:text-ink"
        >
          Export CSV
        </a>
      </header>

      <div className="space-y-3 border-b border-line/80 pb-4">
        <input
          type="search"
          placeholder="Search saved jobs…"
          value={qDraft}
          onChange={(e) => {
            const v = e.target.value;
            setQDraft(v);
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
            debounceRef.current = window.setTimeout(() => {
              patchParams({ q: v.trim() || null });
            }, 300);
          }}
          className="w-full border-0 border-b border-line bg-transparent pb-2.5 text-[15px] text-ink outline-none placeholder:text-mute/70 focus:border-mark"
        />
        <div className="-mx-1 flex flex-wrap items-center gap-0.5">
          <SoftSelect
            label="Status"
            value={status}
            defaultValue="all"
            options={[...STATUS_OPTIONS]}
            onChange={(v) => patchParams({ status: v === "all" ? null : v })}
          />
          <SoftSelect
            label="Applied"
            value={applied}
            defaultValue="all"
            options={[...APPLIED_OPTIONS]}
            onChange={(v) => patchParams({ applied: v === "all" ? null : v })}
          />
          <SoftSelect
            label="Label"
            value={labels}
            defaultValue=""
            options={[...LABEL_OPTIONS]}
            onChange={(v) => patchParams({ labels: v || null })}
          />
          <SoftSelect
            label="Sort"
            value={sort}
            defaultValue="saved_newest"
            options={[...SORT_OPTIONS]}
            onChange={(v) => patchParams({ sort: v })}
          />
        </div>
      </div>

      {undo ? (
        <div className="flex items-center justify-between gap-3 rounded-full bg-ink px-4 py-2 text-[13px] text-white">
          <span>Removed from saved</span>
          <button
            type="button"
            className="font-semibold uppercase tracking-[0.06em] text-mark"
            onClick={undoUnsave}
          >
            Undo
          </button>
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
          {failed ? (
            <p className="py-16 text-center text-sm text-mute">
              Couldn’t load saved jobs.{" "}
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
              No saved jobs yet. Save jobs from the{" "}
              <Link
                href="/dashboard/jobs"
                className="text-mark-deep underline-offset-2 hover:underline"
              >
                Jobs tab
              </Link>
              .
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
                        onClick={() => patchParams({ job: job.id })}
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
                              {job.appliedAt ? (
                                <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-[0.06em] text-mark-deep">
                                  Applied
                                </span>
                              ) : null}
                              {job.isClosed ? (
                                <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-[0.06em] text-mute">
                                  Closed
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
                          {job.labelChanged ? (
                            <p className="mt-1 text-[11px] text-sun">
                              Label changed: {labelText(job.labelAtSave)} →{" "}
                              {labelText(job.label)}
                            </p>
                          ) : null}
                          {quote ? (
                            <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-mute/90">
                              <span className="text-mark-deep/80">“</span>
                              {quote}
                              <span className="text-mark-deep/80">”</span>
                            </p>
                          ) : null}
                          <p className="mt-1.5 text-[11px] text-mute/80">
                            Saved {formatIst(job.savedAt)}
                          </p>
                        </div>
                      </button>
                      <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5 pr-1 sm:pr-0">
                        <button
                          type="button"
                          className="font-mono text-[11px] uppercase text-mute hover:text-ink"
                          onClick={() => scheduleUnsave(job, i)}
                        >
                          Unsave
                        </button>
                        <button
                          type="button"
                          className={`text-[11px] font-semibold uppercase tracking-[0.04em] ${
                            job.appliedAt
                              ? "text-mark-deep"
                              : "text-mute hover:text-ink"
                          }`}
                          onClick={() => void toggleApplied(job)}
                        >
                          {job.appliedAt ? "Applied" : "Mark applied"}
                        </button>
                        {job.isClosed ? (
                          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-mute/50">
                            Apply
                          </span>
                        ) : (
                          <a
                            href={job.applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-semibold uppercase tracking-[0.04em] text-mark-deep opacity-80 transition hover:opacity-100"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Apply
                          </a>
                        )}
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
                    onClick={() => patchParams({ job: null })}
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

                {items.find((j) => j.id === jobId)?.isClosed ? (
                  <span className="btn-ghost inline-flex w-full cursor-not-allowed opacity-50">
                    Closed
                  </span>
                ) : (
                  <a
                    href={detail.applyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ink inline-flex w-full"
                  >
                    Apply
                  </a>
                )}

                {detail.related.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
                      More from {detail.company.name}
                    </p>
                    <ul className="mt-2.5 space-y-2">
                      {detail.related.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            className="text-left text-[13px] text-mark-deep transition hover:underline"
                            onClick={() => patchParams({ job: r.id })}
                          >
                            {r.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
