"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Skel } from "@/components/ui/skeleton";
import { ELIGIBILITY_LABELS, MCP_URL } from "@/lib/constants";
import { evidenceQuote, formatIst } from "@/lib/format";
import type { McpTokenPublic, SavedJobRow } from "@/lib/me-types";

function MePanelSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading account">
      <section className="rounded-2xl border border-line bg-white p-5">
        <Skel className="h-2.5 w-16 rounded-full" />
        <Skel className="mt-3 h-7 w-48 rounded-lg" />
        <Skel className="mt-2 h-3 w-40 rounded-full" />
      </section>
      <section className="rounded-2xl border border-line bg-white">
        <div className="border-b border-line px-5 py-3">
          <Skel className="h-5 w-28 rounded-md" />
        </div>
        <ul className="divide-y divide-line">
          {[0, 1, 2].map((i) => (
            <li key={i} className="space-y-2 px-5 py-4">
              <Skel className="h-4 w-[60%] rounded-full" />
              <Skel className="h-3 w-[40%] rounded-full" />
              <Skel className="h-3 w-[80%] rounded-full" />
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border border-line bg-white p-5">
        <Skel className="h-5 w-40 rounded-md" />
        <Skel className="mt-3 h-3 w-full max-w-md rounded-full" />
        <Skel className="mt-2 h-3 w-2/3 rounded-full" />
        <div className="mt-4 flex gap-2">
          <Skel className="h-9 w-32 rounded-full" />
          <Skel className="h-9 w-24 rounded-full" />
        </div>
      </section>
    </div>
  );
}

export function MePanel() {
  const { data, status } = useSession();
  const [saved, setSaved] = useState<SavedJobRow[]>([]);
  const [tokens, setTokens] = useState<McpTokenPublic[]>([]);
  const [rawOnce, setRawOnce] = useState<string | null>(null);
  const [mcpUrlOnce, setMcpUrlOnce] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [sRes, tRes] = await Promise.all([
      fetch("/api/me/saved"),
      fetch("/api/me/mcp-token"),
    ]);
    if (sRes.ok) {
      const body = (await sRes.json()) as {
        results?: SavedJobRow[];
        items?: Array<{
          id: string;
          title: string;
          company: { name: string };
          locationText: string | null;
          label: string | null;
          evidence: string[];
          applyUrl: string;
          savedAt: string;
          isClosed: boolean;
        }>;
      };
      if (body.results) {
        setSaved(body.results);
      } else if (body.items) {
        setSaved(
          body.items.map((j) => ({
            job_id: j.id,
            title: j.title,
            company: j.company.name,
            location: j.locationText,
            eligibility: j.label,
            evidence: j.evidence,
            apply_url: j.applyUrl,
            saved_at: j.savedAt,
            status: j.isClosed ? ("closed" as const) : ("open" as const),
          })),
        );
      } else {
        setSaved([]);
      }
    }
    if (tRes.ok) {
      const body = (await tRes.json()) as { tokens?: McpTokenPublic[] };
      setTokens(body.tokens ?? []);
    }
  }

  useEffect(() => {
    if (status !== "authenticated") return;
    void refresh();
  }, [status]);

  if (status === "loading") {
    return <MePanelSkeleton />;
  }

  if (!data?.user) {
    return (
      <p className="text-sm text-mute">
        Sign in from the header to manage saved jobs and your MCP token.
      </p>
    );
  }

  async function generateToken() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/mcp-token", { method: "POST" });
      if (!res.ok) throw new Error("create_failed");
      const body = (await res.json()) as {
        raw?: string;
        mcp_url?: string;
      };
      setRawOnce(body.raw ?? null);
      setMcpUrlOnce(body.mcp_url ?? null);
      await refresh();
    } catch {
      setError("Could not create token");
    } finally {
      setBusy(false);
    }
  }

  async function revokeTokens() {
    setBusy(true);
    try {
      await fetch("/api/me/mcp-token", { method: "DELETE" });
      setRawOnce(null);
      setMcpUrlOnce(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function wipeAccount() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/account", { method: "DELETE" });
      if (!res.ok) throw new Error("delete_failed");
      await signOut({ callbackUrl: "/" });
    } catch {
      setError("Could not delete account");
      setBusy(false);
    }
  }

  const active = tokens.find((t) => t.active);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-white p-5">
        <p className="text-[11px] uppercase tracking-wide text-mute">Account</p>
        <h2 className="mt-1 font-display text-2xl text-ink">
          {data.user.name ?? data.user.email}
        </h2>
        <p className="mt-1 text-sm text-mute">{data.user.email}</p>
      </section>

      <section className="rounded-2xl border border-line bg-white">
        <div className="border-b border-line px-5 py-3">
          <h2 className="font-display text-lg text-ink">Saved jobs</h2>
        </div>
        <ul className="divide-y divide-line">
          {saved.length === 0 ? (
            <li className="px-5 py-8 text-sm text-mute">No saved jobs yet.</li>
          ) : (
            saved.map((job) => {
              const quote = evidenceQuote(job.evidence);
              return (
                <li key={job.job_id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink">{job.title}</p>
                      <p className="text-sm text-mute">{job.company}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${
                        job.status === "open"
                          ? "bg-mark-soft text-mark-deep"
                          : "bg-paper text-mute"
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>
                  {job.eligibility ? (
                    <p className="mt-1 text-[12px] text-mute">
                      {ELIGIBILITY_LABELS[job.eligibility] ?? job.eligibility}
                    </p>
                  ) : null}
                  {quote ? (
                    <p className="mt-2 line-clamp-2 text-xs text-mute">
                      “{quote}”
                    </p>
                  ) : null}
                  <div className="mt-2 flex gap-3 text-[11px] uppercase">
                    {job.status === "open" ? (
                      <a
                        href={job.apply_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-mark-deep hover:underline"
                      >
                        Apply
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="text-mute hover:text-ink"
                      onClick={() => {
                        void (async () => {
                          await fetch(`/api/me/saved/${job.job_id}`, {
                            method: "DELETE",
                          });
                          await refresh();
                        })();
                      }}
                    >
                      Unsave
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-display text-lg text-ink">Personal MCP token</h2>
        <p className="mt-1 text-sm text-mute">
          Public tools work without a token. With a bearer token (or{" "}
          <code className="text-[12px]">?token=</code>), you get save_job,
          unsave_job, and my_saved_jobs.
        </p>
        <p className="mt-2 text-[12px] text-mute">Base URL: {MCP_URL}</p>

        {active ? (
          <p className="mt-3 text-sm text-ink">
            Active token created {formatIst(active.created_at)}
            {active.last_used_at
              ? ` · last used ${formatIst(active.last_used_at)}`
              : ""}
          </p>
        ) : (
          <p className="mt-3 text-sm text-mute">No active token.</p>
        )}

        {rawOnce ? (
          <div className="mt-4 space-y-2 rounded-xl border border-line bg-paper p-3">
            <p className="text-[12px] text-mute">
              Copy now. The raw token is shown once.
            </p>
            <code className="block break-all text-[12px] text-ink">{rawOnce}</code>
            {mcpUrlOnce ? (
              <code className="block break-all text-[12px] text-mute">
                {mcpUrlOnce}
              </code>
            ) : null}
            <button
              type="button"
              className="text-[11px] uppercase text-mark-deep"
              onClick={() => {
                void navigator.clipboard.writeText(mcpUrlOnce ?? rawOnce);
              }}
            >
              Copy MCP URL
            </button>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void generateToken()}
            className="rounded-full bg-mark px-4 py-2 text-[11px] font-semibold uppercase text-ink disabled:opacity-40"
          >
            Generate token
          </button>
          <button
            type="button"
            disabled={busy || !active}
            onClick={() => void revokeTokens()}
            className="rounded-full border border-line px-4 py-2 text-[11px] uppercase text-mute disabled:opacity-40"
          >
            Revoke
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-display text-lg text-ink">Delete account</h2>
        <p className="mt-1 text-sm text-mute">
          Permanently deletes your profile, saved jobs, and MCP tokens.
        </p>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-4 rounded-full border border-line px-4 py-2 text-[11px] uppercase text-mute"
          >
            Delete account
          </button>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void wipeAccount()}
              className="rounded-full bg-ink px-4 py-2 text-[11px] font-semibold uppercase text-white disabled:opacity-40"
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-full border border-line px-4 py-2 text-[11px] uppercase text-mute"
            >
              Cancel
            </button>
          </div>
        )}
      </section>

      {error ? <p className="text-sm text-sun">{error}</p> : null}
    </div>
  );
}
