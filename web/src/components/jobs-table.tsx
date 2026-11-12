"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { JobRow } from "@/lib/api";
import { API_BASE, ELIGIBILITY_LABELS } from "@/lib/constants";
import { evidenceQuote } from "@/lib/format";

type Page = {
  results: JobRow[];
  next_cursor: string | null;
};

async function loadJobs(opts: {
  query: string;
  eligibility: string;
  cursor?: string;
}): Promise<Page | null> {
  const sp = new URLSearchParams();
  if (opts.query.trim()) sp.set("query", opts.query.trim());
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
  const [query, setQuery] = useState("");
  const [eligibility, setEligibility] = useState("open,india_remote");
  const [page, setPage] = useState<Page | null>(initial);
  const [stack, setStack] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(!initial);
  const skipFirst = useRef(true);

  function run(q: string, elig: string, cursor: string | undefined, index: number) {
    startTransition(() => {
      void (async () => {
        const next = await loadJobs({ query: q, eligibility: elig, cursor });
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
  }, [query, eligibility]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          placeholder="Search titles…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full flex-1 rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400/40"
        />
        <select
          value={eligibility}
          onChange={(e) => setEligibility(e.target.value)}
          className="rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-400/40"
        >
          <option value="open,india_remote">Open + India remote</option>
          <option value="open">Open worldwide</option>
          <option value="india_remote">India remote</option>
        </select>
      </div>

      <div
        className={`overflow-x-auto rounded-xl border border-white/[0.08] ${
          pending ? "opacity-70" : ""
        }`}
      >
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-white/[0.06] bg-white/[0.02] text-[11px] uppercase tracking-[0.12em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Location
              </th>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Evidence
              </th>
              <th className="px-4 py-3 font-medium">Apply</th>
            </tr>
          </thead>
          <tbody>
            {failed || !page ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                  —
                </td>
              </tr>
            ) : page.results.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                  No jobs match.
                </td>
              </tr>
            ) : (
              page.results.map((job) => {
                const quote = evidenceQuote(job.evidence);
                return (
                  <tr
                    key={job.id}
                    className="border-b border-white/[0.04] align-top last:border-0"
                  >
                    <td className="max-w-[14rem] px-4 py-3 font-medium text-zinc-100">
                      {job.title}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{job.company}</td>
                    <td className="hidden px-4 py-3 text-zinc-500 md:table-cell">
                      {job.location ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs text-emerald-300">
                        {job.eligibility
                          ? (ELIGIBILITY_LABELS[job.eligibility] ??
                            job.eligibility)
                          : "—"}
                      </span>
                    </td>
                    <td className="hidden max-w-xs px-4 py-3 text-zinc-400 lg:table-cell">
                      {quote ? (
                        <span className="line-clamp-2 text-xs leading-relaxed">
                          “{quote}”
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={job.apply_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-300 hover:text-emerald-200"
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

      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>Page {pageIndex + 1} · 25 / page</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pageIndex === 0 || pending}
            onClick={() =>
              run(query, eligibility, stack[pageIndex - 1], pageIndex - 1)
            }
            className="rounded-md px-3 py-1.5 ring-1 ring-white/[0.08] disabled:opacity-40"
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
            className="rounded-md px-3 py-1.5 ring-1 ring-white/[0.08] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
