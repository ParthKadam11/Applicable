"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import type { JobRow } from "@/lib/api";
import { API_BASE, ELIGIBILITY_LABELS } from "@/lib/constants";
import { filterEntryLevelJobs } from "@/lib/entry-level";
import { evidenceQuote } from "@/lib/format";

const FALLBACK: JobRow[] = [
  {
    id: "fb-1",
    title: "Junior Backend Engineer",
    company: "Ramp",
    company_website: "https://ramp.com",
    location: "Remote",
    eligibility: "open",
    evidence: ["Hire from anywhere"],
    apply_url: "#",
    posted_at: null,
    last_seen_at: null,
  },
  {
    id: "fb-2",
    title: "Software Engineering Intern",
    company: "Rippling",
    company_website: "https://rippling.com",
    location: "Remote · India",
    eligibility: "india_remote",
    evidence: ["India remote OK"],
    apply_url: "#",
    posted_at: null,
    last_seen_at: null,
  },
  {
    id: "fb-3",
    title: "Associate Product Designer",
    company: "Brex",
    company_website: "https://brex.com",
    location: "Remote",
    eligibility: "india_remote",
    evidence: ["Open to India"],
    apply_url: "#",
    posted_at: null,
    last_seen_at: null,
  },
  {
    id: "fb-4",
    title: "New Grad Software Engineer",
    company: "Scale AI",
    company_website: "https://scale.com",
    location: "Worldwide",
    eligibility: "open",
    evidence: ["Remote-first, global"],
    apply_url: "#",
    posted_at: null,
    last_seen_at: null,
  },
  {
    id: "fb-5",
    title: "Junior Frontend Engineer",
    company: "Gusto",
    company_website: "https://gusto.com",
    location: "Remote",
    eligibility: "open",
    evidence: ["Global remote"],
    apply_url: "#",
    posted_at: null,
    last_seen_at: null,
  },
  {
    id: "fb-6",
    title: "Engineering Trainee",
    company: "Plaid",
    company_website: "https://plaid.com",
    location: "India remote",
    eligibility: "india_remote",
    evidence: ["Hire from India"],
    apply_url: "#",
    posted_at: null,
    last_seen_at: null,
  },
];

type Props = {
  initialJobs: JobRow[];
  initialCursor: string | null;
};

export function AuthJobsPanel({ initialJobs, initialCursor }: Props) {
  const seeded = useMemo(() => {
    const filtered = filterEntryLevelJobs(initialJobs);
    return filtered.length > 0 ? filtered : FALLBACK;
  }, [initialJobs]);

  const [rows, setRows] = useState<JobRow[]>(seeded);
  const [cursor, setCursor] = useState<string | null>(
    seeded[0]?.id.startsWith("fb-") ? null : initialCursor,
  );
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(
    seeded[0]?.id.startsWith("fb-") || !initialCursor,
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const seen = useRef(new Set(seeded.map((j) => j.id)));
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || done || !cursor) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        eligibility: "open,india_remote",
        limit: "40",
        cursor,
      });
      const res = await fetch(`${API_BASE}/api/jobs?${sp}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        setDone(true);
        return;
      }
      const body = (await res.json()) as {
        results?: JobRow[];
        next_cursor?: string | null;
      };
      const next = filterEntryLevelJobs(body.results ?? []).filter(
        (j) => !seen.current.has(j.id),
      );
      for (const j of next) seen.current.add(j.id);
      if (next.length > 0) {
        setRows((prev) => [...prev, ...next]);
      }
      const nextCursor = body.next_cursor ?? null;
      setCursor(nextCursor);
      if (!nextCursor) setDone(true);
    } catch {
      setDone(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor, done]);

  useEffect(() => {
    const root = scrollerRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || done) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: "120px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [done, loadMore, rows.length]);

  return (
    <div className="pointer-events-none relative flex h-full min-h-0 items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
      <div className="auth-jobs-rise pointer-events-auto flex w-full max-w-[28rem] flex-col">
        <h2 className="mb-5 font-hero text-[1.85rem] font-medium leading-[1.1] tracking-[-0.03em] text-ink sm:text-[2.15rem]">
          Browse Jobs
        </h2>

        <div className="overflow-hidden rounded-[1.35rem] border border-white/70 bg-white/78 shadow-[0_28px_70px_-36px_color-mix(in_srgb,var(--ink)_55%,transparent),0_1px_0_color-mix(in_srgb,var(--mark)_25%,transparent)_inset] backdrop-blur-xl">
          <div className="relative">
            <div
              ref={scrollerRef}
              className="auth-jobs-scroll max-h-[min(54vh,440px)] overflow-y-auto overscroll-contain"
            >
              <ul>
                {rows.map((job, i) => {
                  const quote = evidenceQuote(job.evidence);
                  const label = job.eligibility
                    ? (ELIGIBILITY_LABELS[job.eligibility] ?? job.eligibility)
                    : null;
                  const isIndia = job.eligibility === "india_remote";
                  return (
                    <li
                      key={job.id}
                      className="auth-job-row border-b border-line/60 last:border-b-0"
                      style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                    >
                      <div className="group flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-mark-soft/45 sm:px-5 sm:py-4">
                        <CompanyLogo
                          company={job.company}
                          website={job.company_website}
                          size={36}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="truncate text-[14.5px] font-semibold leading-snug tracking-[-0.01em] text-ink sm:text-[15px]">
                              {job.title}
                            </p>
                            {label ? (
                              <span
                                className={`mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em] ${
                                  isIndia ? "text-mark-deep" : "text-mute"
                                }`}
                              >
                                {isIndia ? "India" : "World"}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[12.5px] text-mute">
                            {job.company}
                            {job.location ? ` · ${job.location}` : ""}
                          </p>
                          {quote ? (
                            <p className="mt-1.5 line-clamp-1 text-[12px] leading-relaxed text-mute/90">
                              <span className="text-mark-deep/80">“</span>
                              {quote}
                              <span className="text-mark-deep/80">”</span>
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
                <li ref={sentinelRef} className="h-px" aria-hidden />
              </ul>

              {loading ? (
                <div className="flex items-center justify-center gap-1.5 border-t border-line/60 px-5 py-3.5">
                  <span className="auth-load-dot h-1.5 w-1.5 rounded-full bg-mark" />
                  <span className="auth-load-dot h-1.5 w-1.5 rounded-full bg-mark [animation-delay:120ms]" />
                  <span className="auth-load-dot h-1.5 w-1.5 rounded-full bg-mark [animation-delay:240ms]" />
                </div>
              ) : null}

            </div>

            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white/90 to-transparent"
              aria-hidden
            />
          </div>
        </div>
      </div>
    </div>
  );
}
