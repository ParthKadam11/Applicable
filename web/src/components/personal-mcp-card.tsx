"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { MCP_URL } from "@/lib/constants";
import { formatIst } from "@/lib/format";
import { copyText } from "@/lib/copy-text";
import type { McpTokenPublic } from "@/lib/me-types";

/** Personal bearer token — lives under Integrations (not its own tab). */
export function PersonalMcpCard() {
  const { data: session, status } = useSession();
  const [active, setActive] = useState<McpTokenPublic | null>(null);
  const [rawOnce, setRawOnce] = useState<string | null>(null);
  const [mcpUrlOnce, setMcpUrlOnce] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setActive(null);
      return;
    }
    try {
      const res = await fetch("/api/me/mcp-token");
      if (!res.ok) return;
      const body = (await res.json()) as { token?: McpTokenPublic | null };
      setActive(body.token ?? null);
    } catch {
      /* ignore */
    }
  }, [session?.user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function generateToken() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/mcp-token", { method: "POST" });
      if (!res.ok) return;
      const body = (await res.json()) as {
        token?: string;
        mcp_url?: string;
        meta?: McpTokenPublic;
      };
      setRawOnce(body.token ?? null);
      setMcpUrlOnce(body.mcp_url ?? null);
      setActive(body.meta ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function revokeTokens() {
    setBusy(true);
    try {
      await fetch("/api/me/mcp-token", { method: "DELETE" });
      setActive(null);
      setRawOnce(null);
      setMcpUrlOnce(null);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <section className="rounded-2xl border border-line bg-white p-5">
        <p className="text-sm text-mute">Loading personal MCP…</p>
      </section>
    );
  }

  if (!session?.user) {
    return (
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-display text-lg text-ink">Personal MCP</h2>
        <p className="mt-1 text-sm text-mute">
          Sign in to generate a bearer token for save_job / my_saved_jobs.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="font-display text-lg text-ink">Personal MCP</h2>
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
              void copyText(mcpUrlOnce ?? rawOnce).then((ok) => {
                if (ok) {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                }
              });
            }}
          >
            {copied ? "Copied" : "Copy MCP URL"}
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
  );
}
