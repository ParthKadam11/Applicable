"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef, useState, useTransition } from "react";
import { AiSearchBar } from "@/components/ai-search-bar";
import { SaveJobButton } from "@/components/save-job-button";
import { TableRowsSkeleton } from "@/components/ui/skeleton";
import type { JobRow } from "@/lib/api";
import type { JobsFilterFields } from "@/lib/ai-search";
import { API_BASE, ELIGIBILITY_LABELS } from "@/lib/constants";
import { evidenceQuote } from "@/lib/format";

type Page = {
  results: JobRow[];
  next_cursor: string | null;
};

async function loadJobs(opts: {
  query: string;
  eligibility: string;
  role_keywords?: string;
  company?: string;
  posted_within_days?: number;
  cursor?: string;
}): Promise<Page | null> {
  const sp = new URLSearchParams();
  if (opts.query.trim()) sp.set("query", opts.query.trim());
  if (opts.role_keywords) sp.set("role_keywords", opts.role_keywords);
  if (opts.company) sp.set("company", opts.company);
  if (opts.posted_within_days != null) {
    sp.set("posted_within_days", String(opts.posted_within_days));
  }
  sp.set("eligibility", opts.eligibility);
  sp.set("limit", "25");
  if (opts.cursor) sp.set("cursor", opts.cursor);
  try {
    const res = await fetch(`${API_BASE}/api/jobs?${sp.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as Page;
  } catch {
    return null;
  }
}

export function JobsTable({ initial }: { initial: Page | null }) {
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const [eligibility, setEligibility] = useState("open,india_remote");
  const [roleKeywords, setRoleKeywords] = useState<string | undefined>();
  const [company, setCompany] = useState<string | undefined>();
  const [postedWithin, setPostedWithin] = useState<number | undefined>();
  const [page, setPage] = useState<Page | null>(initial);
  const [stack, setStack] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(!initial);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const skipFirst = useRef(true);

  useEffect(() => {
    if (!session?.user) {
      setSavedIds(new Set());
      return;
    }
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
  }, [session?.user]);

  function run(
    q: string,
    elig: string,
    cursor: string | undefined,
    index: number,
    extra?: {
      role_keywords?: string;
      company?: string;
      posted_within_days?: number;
    },
  ) {
    startTransition(() => {
      void (async () => {
        const next = await loadJobs({
          query: q,
          eligibility: elig,
          role_keywords: extra?.role_keywords ?? roleKeywords,
          company: extra?.company ?? company,
          posted_within_days: extra?.posted_within_days ?? postedWithin,
          cursor,
        });
        if (!next) {
          setFailed(true);
          setPage(null);
          return;
        }
        setFailed(false);
        setPage(next);
        setPageIndex(index);
        setStack((prev) => {
          const copy = prev.slice(0, index + 1);
          copy[index] = cursor;
          return copy;
        });
      })();
    });
  }

  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      setStack([undefined]);
      run(query, eligibility, undefined, 0);
    }, 300);
    return () => window.clearTimeout(t);
  }, [query, eligibility, roleKeywords, company, postedWithin]);

  function applyAiFilters(f: JobsFilterFields) {
    const labels = (f.labels ?? ["open", "india_remote"]).join(",");
    const days =
      f.posted === "24h" ? 1 : f.posted === "7d" ? 7 : f.posted === "30d" ? 30 : undefined;
    setQuery(f.q ?? "");
    setEligibility(labels);
    setRoleKeywords(f.role);
    setCompany(undefined);
    setPostedWithin(days);
    setStack([undefined]);
    run(f.q ?? "", labels, undefined, 0, {
      role_keywords: f.role,
      posted_within_days: days,
    });
  }

  return (
    <div className="space-y-4">
      <AiSearchBar
        onFilters={(f) => {
          applyAiFilters(f);
        }}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          placeholder="Search titles…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-mute focus:border-mark"
        />
        <select
          value={eligibility}
          onChange={(e) => setEligibility(e.target.value)}
          className="rounded-xl border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-mark"
        >
          <option value="open,india_remote">Open + India remote</option>
          <option value="open">Open worldwide</option>
          <option value="india_remote">India remote</option>
        </select>
      </div>

      <div className="relative overflow-x-auto rounded-xl border border-line">
        {pending ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-line"
            aria-hidden
          >
            <div className="skel h-full w-1/3 rounded-none" />
          </div>
        ) : null}
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-line bg-paper font-mono text-[10px] uppercase text-mute">
            <tr>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Company</th>
              <th className="hidden px-3 py-2.5 font-medium md:table-cell">
                Location
              </th>
              <th className="px-3 py-2.5 font-medium">Label</th>
              <th className="hidden px-3 py-2.5 font-medium lg:table-cell">
                Evidence
              </th>
              <th className="px-3 py-2.5 font-medium">Save</th>
              <th className="px-3 py-2.5 font-medium">Apply</th>
            </tr>
          </thead>
          <tbody>
            {pending && (!page || page.results.length === 0) ? (
              <TableRowsSkeleton rows={5} cols={7} />
            ) : failed || !page ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-mute"
                >
                  Couldn’t load jobs.
                </td>
              </tr>
            ) : page.results.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-mute"
                >
                  No jobs match.
                </td>
              </tr>
            ) : (
              page.results.map((job) => {
                const quote = evidenceQuote(job.evidence);
                return (
                  <tr
                    key={job.id}
                    className="border-b border-line/70 align-top last:border-0"
                  >
                    <td className="max-w-[14rem] px-3 py-3 font-medium text-ink">
                      {job.title}
                    </td>
                    <td className="px-3 py-3 text-mute">{job.company}</td>
                    <td className="hidden px-3 py-3 text-mute md:table-cell">
                      {job.location ?? "-"}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-mark-soft px-2 py-0.5 font-mono text-[10px] uppercase text-mark-deep">
                        {job.eligibility
                          ? (ELIGIBILITY_LABELS[job.eligibility] ??
                            job.eligibility)
                          : "-"}
                      </span>
                    </td>
                    <td className="hidden max-w-xs px-3 py-3 text-mute lg:table-cell">
                      {quote ? (
                        <span className="line-clamp-2 text-xs leading-relaxed">
                          “{quote}”
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-3">
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
                    </td>
                    <td className="px-3 py-3">
                      <a
                        href={job.apply_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[11px] uppercase text-mark-deep hover:underline"
                      >
                        Link
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between font-mono text-[11px] uppercase text-mute">
        <span className="tabular-nums">Page {pageIndex + 1}</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pageIndex === 0 || pending}
            onClick={() =>
              run(query, eligibility, stack[pageIndex - 1], pageIndex - 1)
            }
            className="rounded-full border border-line bg-white px-3 py-1.5 text-ink disabled:opacity-40"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={!page?.next_cursor || pending}
            onClick={() => {
              const nextCursor = page?.next_cursor ?? undefined;
              setStack((prev) => {
                const copy = prev.slice(0, pageIndex + 1);
                copy[pageIndex + 1] = nextCursor;
                return copy;
              });
              run(query, eligibility, nextCursor, pageIndex + 1);
            }}
            className="rounded-full border border-line bg-white px-3 py-1.5 text-ink disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
