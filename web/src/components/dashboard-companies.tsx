"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { CompanyLogo } from "@/components/company-logo";
import type { ApiCompany } from "@/lib/companies-api";

type ListResponse = {
  items: ApiCompany[];
  nextCursor: string | null;
  total: number;
};

function buildQuery(sp: URLSearchParams): string {
  const next = new URLSearchParams();
  const q = sp.get("q");
  if (q) next.set("q", q);
  next.set("has_open", "false");
  next.set("sort", "name");
  next.set("limit", "40");
  return next.toString();
}

export function DashboardCompanies({
  initial,
}: {
  initial: ListResponse | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<ApiCompany[]>(initial?.items ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initial?.nextCursor ?? null,
  );
  const [failed, setFailed] = useState(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestUrl, setSuggestUrl] = useState("");
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const [qDraft, setQDraft] = useState(searchParams.get("q") ?? "");
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const qsKey = searchParams.get("q") ?? "";

  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams();
      const q = patch.q !== undefined ? patch.q : searchParams.get("q");
      if (q) sp.set("q", q);
      startTransition(() => {
        const qs = sp.toString();
        router.replace(
          qs ? `/dashboard/companies?${qs}` : "/dashboard/companies",
          { scroll: false },
        );
      });
    },
    [router, searchParams],
  );

  useEffect(() => {
    setQDraft(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setFailed(false);
      try {
        const sp = new URLSearchParams(buildQuery(searchParams));
        const res = await fetch(`/api/companies?${sp.toString()}`);
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
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [qsKey, searchParams]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const sp = new URLSearchParams(buildQuery(searchParams));
      sp.set("cursor", nextCursor);
      const res = await fetch(`/api/companies?${sp.toString()}`);
      if (!res.ok) return;
      const body = (await res.json()) as ListResponse;
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const add = body.items.filter((c) => !seen.has(c.id));
        return [...prev, ...add];
      });
      setNextCursor(body.nextCursor);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [nextCursor, searchParams]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !nextCursor) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { root: null, rootMargin: "320px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [nextCursor, items.length, loadMore]);

  async function submitSuggest() {
    setSuggestMsg(null);
    setSuggestBusy(true);
    try {
      const res = await fetch("/api/companies/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: suggestUrl.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
      };
      if (res.status === 202) {
        setSuggestMsg("Queued for review — thanks.");
        setSuggestUrl("");
      } else if (res.status === 409) {
        setSuggestMsg("Already tracked.");
      } else if (res.status === 422) {
        setSuggestMsg("No Ashby / Greenhouse / Lever board found in that URL.");
      } else if (res.status === 429) {
        setSuggestMsg("Rate limit — try again later.");
      } else {
        setSuggestMsg(body.error ?? "Could not submit.");
      }
    } finally {
      setSuggestBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            Companies
          </h1>
          <p className="mt-1.5 text-[13px] text-mute sm:text-[14px]">
            {total} companies
          </p>
        </div>
        <div className="flex items-center gap-4">
          {pending ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mark-deep">
              Updating…
            </p>
          ) : null}
          <button
            type="button"
            className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep transition hover:text-ink"
            onClick={() => {
              setSuggestOpen((v) => !v);
              setSuggestMsg(null);
            }}
          >
            Suggest a company
          </button>
        </div>
      </header>

      {suggestOpen ? (
        <div className="space-y-2 border-b border-line/80 pb-4">
          <input
            type="url"
            placeholder="https://jobs.ashbyhq.com/… or boards.greenhouse.io/…"
            value={suggestUrl}
            onChange={(e) => setSuggestUrl(e.target.value)}
            className="w-full border-0 border-b border-line bg-transparent pb-2.5 text-[15px] text-ink outline-none placeholder:text-mute/70 focus:border-mark"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={suggestBusy || !suggestUrl.trim()}
              onClick={() => void submitSuggest()}
              className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep transition hover:text-ink disabled:opacity-40"
            >
              {suggestBusy ? "Submitting…" : "Submit"}
            </button>
            {suggestMsg ? (
              <p className="text-[12px] text-mute">{suggestMsg}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="border-b border-line/80 pb-4">
        <input
          type="search"
          placeholder="Search companies…"
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
      </div>

      {failed ? (
        <p className="py-16 text-center text-sm text-mute">
          Couldn’t load companies.{" "}
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
          No companies match. Try a shorter name, or browse all jobs instead.
        </p>
      ) : (
        <ul>
          {items.map((co, i) => {
            const openN = co.counts.open + co.counts.india_remote;
            return (
              <li
                key={co.id}
                className="auth-job-row border-b border-line/50 last:border-b-0"
                style={{ animationDelay: `${Math.min(i, 10) * 28}ms` }}
              >
                <Link
                  href={`/dashboard/companies/${co.slug}`}
                  className="group flex items-start gap-3.5 py-4 transition-colors hover:bg-mark-soft/25 sm:gap-4"
                >
                  <CompanyLogo
                    company={co.name}
                    website={co.website}
                    size={36}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14.5px] font-semibold leading-snug tracking-[-0.01em] text-ink sm:text-[15px]">
                        {co.name}
                      </p>
                      {co.ats ? (
                        <span className="mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em] text-mute">
                          {co.ats}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] text-mute">
                      {openN} open / India-remote
                      <span className="mx-1.5 text-line">·</span>
                      {co.activeJobs} active jobs
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor ? (
        <div ref={loadMoreRef} className="flex justify-center py-10" aria-hidden>
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
        <p className="py-6 text-center text-[12px] text-mute">
          End of list · {items.length} shown
        </p>
      ) : null}
    </div>
  );
}
