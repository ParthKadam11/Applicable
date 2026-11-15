"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { CompanyLogo } from "@/components/company-logo";
import { SaveJobButton } from "@/components/save-job-button";
import { SoftSelect } from "@/components/ui/soft-select";
import type { ApiJob, ApiJobDetail } from "@/lib/jobs-api";
import { ELIGIBILITY_LABELS } from "@/lib/constants";
import { formatIst } from "@/lib/format";
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/lib/preferences";

const ALL_LABELS_VALUE =
  "open,india_remote,india_onsite,region_locked,unclear";
const DEFAULT_LABELS_VALUE = "open,india_remote,india_onsite";

const LABEL_OPTIONS = [
  {
    value: DEFAULT_LABELS_VALUE,
    label: "Can apply",
    hint: "Worldwide open + India remote/onsite",
  },
  {
    value: ALL_LABELS_VALUE,
    label: "All",
    hint: "Every open tech role we track",
  },
  {
    value: "open,india_remote",
    label: "Open + India remote",
    hint: "Worldwide open and India-remote roles",
  },
  {
    value: "open",
    label: "Worldwide open",
    hint: "Can apply from anywhere",
  },
  {
    value: "india_remote",
    label: "India remote",
    hint: "Remote roles open to India",
  },
  {
    value: "india_onsite",
    label: "India onsite",
    hint: "In-office / hybrid in India",
  },
  {
    value: "region_locked",
    label: "Region locked",
    hint: "Geo-restricted postings",
  },
  {
    value: "unclear",
    label: "Unclear",
    hint: "Eligibility not clear from the posting",
  },
] as const;

const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "backend", label: "Backend" },
  { value: "frontend", label: "Frontend" },
  { value: "fullstack", label: "Fullstack" },
  { value: "devops", label: "DevOps" },
  { value: "data", label: "Data" },
  { value: "mobile", label: "Mobile" },
  { value: "other", label: "Other" },
] as const;

const ATS_OPTIONS = [
  { value: "", label: "All ATS" },
  { value: "ashby", label: "Ashby" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
] as const;

const POSTED_OPTIONS = [
  { value: "all", label: "Any time" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
] as const;

const SALARY_OPTIONS = [
  { value: "", label: "Any" },
  { value: "true", label: "Listed", hint: "Has salary in the posting" },
  { value: "false", label: "Not listed" },
] as const;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "last_seen", label: "Last seen" },
  { value: "company", label: "Company A–Z" },
] as const;

type ListResponse = {
  items: ApiJob[];
  nextCursor: string | null;
  total: number;
  lastIngestionAt: string | null;
};

function relativeTime(iso: string | null): string {
  if (!iso) return "unknown";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "unknown";
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function highlightEvidence(quote: string, q: string | null) {
  if (!q?.trim()) return quote;
  const terms = q
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (terms.length === 0) return quote;
  const re = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "ig",
  );
  const parts = quote.split(re);
  return parts.map((part, i) =>
    terms.some((t) => part.toLowerCase() === t.toLowerCase()) ? (
      <mark key={i} className="rounded-[2px] bg-sun-soft px-0.5 text-ink">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function buildQuery(
  sp: URLSearchParams,
  opts?: {
    companySlug?: string;
    companyOnly?: boolean;
    /** Effective filter values when URL omits them (prefs / UI defaults). */
    defaults?: Partial<Record<string, string>>;
  },
): string {
  const next = new URLSearchParams();
  const keys = opts?.companyOnly
    ? ["labels", "sort", "job"]
    : ["q", "labels", "role", "ats", "posted", "has_salary", "sort", "job"];
  for (const key of keys) {
    const v = sp.get(key) || opts?.defaults?.[key] || "";
    if (v) next.set(key, v);
  }
  if (opts?.companySlug) next.set("company", opts.companySlug);
  // Keep pages large enough for smooth infinite scroll.
  if (!next.get("limit")) next.set("limit", "40");
  return next.toString();
}

export function DashboardJobs({
  initial,
  companySlug,
  basePath = "/dashboard/jobs",
  hideChrome = false,
  initialPreferences,
}: {
  initial: ListResponse | null;
  /** When set, scopes list to this company slug and simplifies filters. */
  companySlug?: string;
  basePath?: string;
  /** Hide page title / non-label filters (company detail page). */
  hideChrome?: boolean;
  initialPreferences?: UserPreferences;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<ApiJob[]>(initial?.items ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initial?.nextCursor ?? null,
  );
  const [lastIngestionAt, setLastIngestionAt] = useState<string | null>(
    initial?.lastIngestionAt ?? null,
  );
  const [failed, setFailed] = useState(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ApiJobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reportNote, setReportNote] = useState("");
  const [reportMsg, setReportMsg] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const [qDraft, setQDraft] = useState(searchParams.get("q") ?? "");
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useState<UserPreferences>(
    initialPreferences ?? DEFAULT_PREFERENCES,
  );

  const qsKey = searchParams.toString();

  // Default: roles an India applicant can act on (prefs override when set).
  const labelsDefault =
    prefs.defaultLabels?.length > 0
      ? prefs.defaultLabels.join(",")
      : DEFAULT_LABELS_VALUE;
  const roleDefault =
    prefs.defaultRoles.length === 1 ? prefs.defaultRoles[0]! : "";
  const hasSalaryDefault = prefs.hideNoSalary ? "true" : "";

  const labels = searchParams.get("labels") ?? labelsDefault;
  const role = searchParams.get("role") ?? roleDefault;
  const ats = searchParams.get("ats") ?? "";
  const posted = searchParams.get("posted") ?? "all";
  const hasSalary = searchParams.get("has_salary") ?? hasSalaryDefault;
  const sort = searchParams.get("sort") ?? "newest";
  const jobId = searchParams.get("job");

  const queryDefaults = useMemo(
    () => ({
      labels: labelsDefault,
      role: roleDefault,
      has_salary: hasSalaryDefault,
      posted: "all",
      sort: "newest",
    }),
    [labelsDefault, roleDefault, hasSalaryDefault],
  );

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      startTransition(() => {
        const qs = sp.toString();
        router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
      });
    },
    [router, searchParams, basePath],
  );

  useEffect(() => {
    setQDraft(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    void (async () => {
      try {
        const [savedRes, prefRes] = await Promise.all([
          fetch("/api/me/saved?ids=1"),
          fetch("/api/me/preferences"),
        ]);
        if (savedRes.ok) {
          const body = (await savedRes.json()) as { ids?: string[] };
          setSavedIds(new Set(body.ids ?? []));
        }
        if (prefRes.ok) {
          const body = (await prefRes.json()) as {
            preferences?: UserPreferences;
          };
          if (body.preferences) setPrefs(body.preferences);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setFailed(false);
      try {
        const sp = new URLSearchParams(
          buildQuery(searchParams, {
            companySlug,
            companyOnly: Boolean(companySlug),
            defaults: queryDefaults,
          }),
        );
        sp.delete("job");
        const res = await fetch(`/api/jobs?${sp.toString()}`);
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const body = (await res.json()) as ListResponse;
        if (cancelled) return;
        setItems(body.items);
        setTotal(body.total);
        setNextCursor(body.nextCursor);
        setLastIngestionAt(body.lastIngestionAt);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- qsKey captures URL state
  }, [qsKey, companySlug]);

  useEffect(() => {
    if (!jobId) {
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
  }, [jobId]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const sp = new URLSearchParams(
        buildQuery(searchParams, {
          companySlug,
          companyOnly: Boolean(companySlug),
          defaults: queryDefaults,
        }),
      );
      sp.delete("job");
      sp.set("cursor", nextCursor);
      const res = await fetch(`/api/jobs?${sp.toString()}`);
      if (!res.ok) return;
      const body = (await res.json()) as ListResponse;
      setItems((prev) => {
        const seen = new Set(prev.map((j) => j.id));
        const add = body.items.filter((j) => !seen.has(j.id));
        return [...prev, ...add];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load when cursor/items change
  }, [nextCursor, items.length]);

  async function submitReport() {
    if (!jobId) return;
    setReportMsg(null);
    const res = await fetch(`/api/jobs/${jobId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: reportNote || undefined }),
    });
    if (res.status === 201) {
      setReportMsg("Thanks — report submitted.");
      setReportNote("");
    } else if (res.status === 429) {
      setReportMsg("Rate limit — try again later.");
    } else {
      setReportMsg("Could not submit report.");
    }
  }

  const headerLine = useMemo(() => {
    const ist = lastIngestionAt ? `${formatIst(lastIngestionAt)} IST` : "—";
    return `Showing ${total} jobs · updated ${relativeTime(lastIngestionAt)} (${ist})`;
  }, [total, lastIngestionAt]);

  return (
    <div className="space-y-6">
      {!hideChrome ? (
        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div>
            <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
              Jobs
            </h1>
            <p className="mt-1.5 text-[13px] text-mute sm:text-[14px]">
              {headerLine}
            </p>
          </div>
          {pending ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mark-deep">
              Updating…
            </p>
          ) : null}
        </header>
      ) : null}

      <div className="space-y-3 border-b border-line/80 pb-4">
        {!hideChrome ? (
          <input
            type="search"
            placeholder="Search titles, companies, skills…"
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
        ) : (
          <p className="text-[13px] text-mute sm:text-[14px]">{headerLine}</p>
        )}
        <div className="-mx-1 flex flex-wrap items-center gap-0.5">
          <SoftSelect
            label="Eligibility"
            value={labels}
            defaultValue={labelsDefault}
            options={[...LABEL_OPTIONS]}
            onChange={(v) => patchParams({ labels: v })}
          />
          {!hideChrome ? (
            <>
              <SoftSelect
                label="Role"
                value={role}
                defaultValue={roleDefault}
                options={[...ROLE_OPTIONS]}
                onChange={(v) => patchParams({ role: v || null })}
              />
              <SoftSelect
                label="ATS"
                value={ats}
                defaultValue=""
                options={[...ATS_OPTIONS]}
                onChange={(v) => patchParams({ ats: v || null })}
              />
              <SoftSelect
                label="Posted"
                value={posted}
                defaultValue="all"
                options={[...POSTED_OPTIONS]}
                onChange={(v) => patchParams({ posted: v })}
              />
              <SoftSelect
                label="Salary"
                value={hasSalary}
                defaultValue={hasSalaryDefault}
                options={[...SALARY_OPTIONS]}
                onChange={(v) => patchParams({ has_salary: v || null })}
              />
              <SoftSelect
                label="Sort"
                value={sort}
                defaultValue="newest"
                options={[...SORT_OPTIONS]}
                onChange={(v) => patchParams({ sort: v })}
              />
            </>
          ) : null}
        </div>
      </div>

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
              Couldn’t load jobs.{" "}
              <button
                type="button"
                className="text-mark-deep underline-offset-2 hover:underline"
                onClick={() => router.refresh()}
              >
                Retry
              </button>
            </p>
          ) : items.length === 0 && pending ? (
            <ul className="divide-y divide-line/50">
              {Array.from({ length: 6 }).map((_, i) => (
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
                const label = job.label
                  ? (ELIGIBILITY_LABELS[job.label] ?? job.label)
                  : null;
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
                              {job.isNew ? (
                                <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-[0.06em] text-sun">
                                  New
                                </span>
                              ) : null}
                            </p>
                            {label ? (
                              <span
                                className={`mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em] ${
                                  isIndia ? "text-mark-deep" : "text-mute"
                                }`}
                              >
                                {isIndia ? "India" : label}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[12.5px] text-mute">
                            {job.company.name}
                            {job.locationText ? ` · ${job.locationText}` : ""}
                            {job.salaryText ? ` · ${job.salaryText}` : ""}
                          </p>
                          {quote ? (
                            <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-mute/90">
                              <span className="text-mark-deep/80">“</span>
                              {highlightEvidence(quote, qDraft)}
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
                      <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5 pr-1 sm:pr-0">
                        <SaveJobButton
                          jobId={job.id}
                          saved={savedIds.has(job.id)}
                          onSavedChange={(s) => {
                            setSavedIds((prev) => {
                              const next = new Set(prev);
                              if (s) next.add(job.id);
                              else next.delete(job.id);
                              return next;
                            });
                          }}
                        />
                        <a
                          href={job.applyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-semibold uppercase tracking-[0.04em] text-mark-deep opacity-80 transition hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
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
            <div ref={loadMoreRef} className="flex justify-center py-8" aria-hidden>
              {loadingMore ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="auth-load-dot h-1.5 w-1.5 rounded-full bg-mark" />
                  <span className="auth-load-dot h-1.5 w-1.5 rounded-full bg-mark [animation-delay:120ms]" />
                  <span className="auth-load-dot h-1.5 w-1.5 rounded-full bg-mark [animation-delay:240ms]" />
                </span>
              ) : (
                <span className="h-1 w-1 rounded-full bg-transparent" />
              )}
            </div>
          ) : items.length > 0 ? (
            <div className="h-10" aria-hidden />
          ) : null}
        </div>

        {jobId ? (
          <aside className="dash-job-detail lg:sticky lg:top-6 lg:self-start lg:border-l lg:border-line/70 lg:pl-8">
            {detailLoading ? (
              <div className="space-y-3 py-2">
                <div className="skel h-6 w-4/5 rounded" />
                <div className="skel h-3 w-1/2 rounded" />
                <div className="skel mt-6 h-20 w-full rounded" />
              </div>
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

                <a
                  href={detail.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ink inline-flex w-full"
                >
                  Apply
                </a>

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

                <div className="border-t border-line/70 pt-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
                    Report wrong label
                  </p>
                  <textarea
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    rows={2}
                    placeholder="Optional note"
                    className="mt-2.5 w-full resize-none border-0 border-b border-line bg-transparent py-2 text-[13px] text-ink outline-none placeholder:text-mute/70 focus:border-mark"
                  />
                  <button
                    type="button"
                    onClick={() => void submitReport()}
                    className="mt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep transition hover:text-ink"
                  >
                    Submit report
                  </button>
                  {reportMsg ? (
                    <p className="mt-1.5 text-[12px] text-mute">{reportMsg}</p>
                  ) : null}
                </div>
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
