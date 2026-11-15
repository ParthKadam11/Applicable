"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { ByokKeysPanel } from "@/components/byok-keys-panel";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { SoftSelect } from "@/components/ui/soft-select";
import {
  clearByokKey,
  clearRecentSearches,
  loadByokKey,
} from "@/lib/ai-search";
import { copyText } from "@/lib/copy-text";
import { formatIst } from "@/lib/format";
import type { McpTokenPublic } from "@/lib/me-types";
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/lib/preferences";
import type { z } from "zod";
import { LabelSchema, RoleSchema } from "@/lib/jobs-filters";

const LABEL_OPTIONS = LabelSchema.options.map((v) => ({
  value: v,
  label: v.replace(/_/g, " "),
}));

const ROLE_OPTIONS = RoleSchema.options.map((v) => ({
  value: v,
  label: v,
}));

type Profile = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  memberSince: string;
};

function maskKey(key: string): string {
  if (key.length <= 4) return "••••";
  return `••••${key.slice(-4)}`;
}

function ToggleChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] font-semibold uppercase tracking-[0.06em] transition ${
        active ? "text-mark-deep" : "text-mute hover:text-ink"
      }`}
    >
      {active ? "✓ " : ""}
      {label}
    </button>
  );
}

export function DashboardSettings() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [signInOpen, setSignInOpen] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences>({ ...DEFAULT_PREFERENCES });
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);
  const [prefsBusy, setPrefsBusy] = useState(false);

  const [byokMeta, setByokMeta] = useState<{
    provider: string;
    masked: string;
  } | null>(null);

  const [token, setToken] = useState<McpTokenPublic | null>(null);
  const [rawOnce, setRawOnce] = useState<string | null>(null);
  const [mcpUrlOnce, setMcpUrlOnce] = useState<string | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const [deleteTyped, setDeleteTyped] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshByokMeta = useCallback(() => {
    const store = loadByokKey();
    if (!store) {
      setByokMeta(null);
      return;
    }
    setByokMeta({
      provider: store.provider,
      masked: maskKey(store.apiKey),
    });
  }, []);

  const load = useCallback(async () => {
    const [pRes, tRes] = await Promise.all([
      fetch("/api/me/profile"),
      fetch("/api/me/mcp-token"),
    ]);
    if (pRes.ok) {
      const body = (await pRes.json()) as Profile & {
        preferences?: UserPreferences;
      };
      setProfile({
        id: body.id,
        name: body.name,
        email: body.email,
        avatarUrl: body.avatarUrl,
        memberSince: body.memberSince,
      });
      if (body.preferences) setPrefs(body.preferences);
    }
    if (tRes.ok) {
      const body = (await tRes.json()) as {
        tokens?: McpTokenPublic[];
        token?: McpTokenPublic | null;
      };
      const active =
        body.token ??
        body.tokens?.find((t) => t.active) ??
        null;
      setToken(active);
    }
    refreshByokMeta();
  }, [refreshByokMeta]);

  useEffect(() => {
    if (status === "unauthenticated") setSignInOpen(true);
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void load();
  }, [status, load]);

  async function savePrefs(next: UserPreferences) {
    setPrefsBusy(true);
    setPrefsMsg(null);
    try {
      const res = await fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        setPrefsMsg("Could not save preferences.");
        return;
      }
      const body = (await res.json()) as { preferences?: UserPreferences };
      if (body.preferences) setPrefs(body.preferences);
      setPrefsMsg("Saved.");
    } finally {
      setPrefsBusy(false);
    }
  }

  function toggleLabel(label: z.infer<typeof LabelSchema>) {
    const set = new Set(prefs.defaultLabels);
    if (set.has(label)) {
      if (set.size <= 1) return;
      set.delete(label);
    } else set.add(label);
    const next = {
      ...prefs,
      defaultLabels: LabelSchema.options.filter((l) => set.has(l)),
    };
    setPrefs(next);
    void savePrefs(next);
  }

  function toggleRole(role: z.infer<typeof RoleSchema>) {
    const set = new Set(prefs.defaultRoles);
    if (set.has(role)) set.delete(role);
    else set.add(role);
    const next = {
      ...prefs,
      defaultRoles: RoleSchema.options.filter((r) => set.has(r)),
    };
    setPrefs(next);
    void savePrefs(next);
  }

  async function generateToken() {
    if (token && !confirmRegen) {
      setConfirmRegen(true);
      return;
    }
    setTokenBusy(true);
    setError(null);
    setConfirmRegen(false);
    try {
      const res = await fetch("/api/me/mcp-token", { method: "POST" });
      if (!res.ok) throw new Error("create_failed");
      const body = (await res.json()) as {
        raw?: string;
        mcp_url?: string;
        token?: McpTokenPublic;
      };
      setRawOnce(body.raw ?? null);
      setMcpUrlOnce(body.mcp_url ?? null);
      setToken(body.token ?? null);
      await load();
    } catch {
      setError("Could not create token");
    } finally {
      setTokenBusy(false);
    }
  }

  async function revokeToken() {
    setTokenBusy(true);
    try {
      await fetch("/api/me/mcp-token", { method: "DELETE" });
      setRawOnce(null);
      setMcpUrlOnce(null);
      setToken(null);
      setConfirmRegen(false);
    } finally {
      setTokenBusy(false);
    }
  }

  async function wipeAccount() {
    if (deleteTyped.trim().toLowerCase() !== "delete") return;
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "delete" }),
      });
      if (!res.ok) throw new Error("delete_failed");
      clearByokKey();
      clearRecentSearches();
      await signOut({ callbackUrl: "/" });
      router.replace("/");
    } catch {
      setError("Could not delete account");
      setDeleteBusy(false);
    }
  }

  if (status === "loading") {
    return <p className="py-16 text-center text-sm text-mute">Loading…</p>;
  }

  if (!session?.user) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
            Settings
          </h1>
          <p className="mt-1.5 text-[13px] text-mute sm:text-[14px]">
            Sign in to manage your account.
          </p>
        </header>
        <SignInPrompt
          open={signInOpen}
          message="Sign in to open Settings"
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

  const displayName = profile?.name ?? session.user.name ?? "—";
  const email = profile?.email ?? session.user.email ?? "—";
  const avatar = profile?.avatarUrl ?? session.user.image ?? null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
          Settings
        </h1>
        <p className="mt-1.5 max-w-xl text-pretty text-[14px] text-mute sm:text-[15px]">
          Profile, search defaults, AI key, MCP token, and data.
        </p>
      </header>

      {/* Profile */}
      <section className="space-y-3 border-b border-line/80 pb-5">
        <h2 className="font-display text-lg tracking-tight text-ink">
          Profile
        </h2>
        <div className="flex items-start gap-3.5">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt=""
              className="size-12 rounded-[0.7rem] object-cover"
            />
          ) : (
            <span className="inline-flex size-12 items-center justify-center rounded-[0.7rem] bg-mark-soft text-[15px] font-semibold text-ink">
              {(displayName || "?").charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              {displayName}
            </p>
            <p className="mt-0.5 text-[13px] text-mute">{email}</p>
            <p className="mt-1 text-[12px] text-mute/90">
              Member since{" "}
              {profile?.memberSince
                ? formatIst(profile.memberSince)
                : "—"}
            </p>
          </div>
        </div>
      </section>

      {/* Skills */}
      <section
        id="skills"
        className="scroll-mt-24 space-y-3 border-b border-line/80 pb-5"
      >
        <div>
          <h2 className="font-display text-lg tracking-tight text-ink">
            Skills
          </h2>
          <p className="mt-1 text-[13px] text-mute">
            Optional chips used for better job matches in AI search.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {prefs.skills.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                const next = {
                  ...prefs,
                  skills: prefs.skills.filter((x) => x !== s),
                };
                setPrefs(next);
                void savePrefs(next);
              }}
              className="rounded-full border border-line bg-white px-2.5 py-1 text-[12px] font-medium text-ink transition hover:border-danger hover:text-danger"
              title="Remove skill"
            >
              {s} ×
            </button>
          ))}
        </div>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const raw = String(fd.get("skill") ?? "").trim();
            if (!raw) return;
            if (prefs.skills.some((s) => s.toLowerCase() === raw.toLowerCase())) {
              e.currentTarget.reset();
              return;
            }
            const next = {
              ...prefs,
              skills: [...prefs.skills, raw].slice(0, 40),
            };
            setPrefs(next);
            void savePrefs(next);
            e.currentTarget.reset();
          }}
        >
          <input
            name="skill"
            maxLength={40}
            placeholder="Add a skill (e.g. Python)"
            className="min-w-[12rem] flex-1 border-0 border-b border-line bg-transparent pb-2 text-[14px] text-ink outline-none placeholder:text-mute/70 focus:border-mark"
          />
          <button
            type="submit"
            className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep transition hover:text-ink"
          >
            + Add
          </button>
        </form>
      </section>

      {/* Preferences */}
      <section className="space-y-3 border-b border-line/80 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg tracking-tight text-ink">
              Preferences
            </h2>
            <p className="mt-1 text-[13px] text-mute">
              Defaults for Jobs and AI Search when the URL has no filter.
            </p>
          </div>
          {prefsBusy ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-mark-deep">
              Saving…
            </p>
          ) : prefsMsg ? (
            <p className="text-[12px] text-mute">{prefsMsg}</p>
          ) : null}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
            Default labels
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {LABEL_OPTIONS.map((o) => (
              <ToggleChip
                key={o.value}
                active={prefs.defaultLabels.includes(o.value)}
                label={o.label}
                onClick={() => toggleLabel(o.value)}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-mute">
            Default roles
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {ROLE_OPTIONS.map((o) => (
              <ToggleChip
                key={o.value}
                active={prefs.defaultRoles.includes(o.value)}
                label={o.label}
                onClick={() => toggleRole(o.value)}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-mute">
            None selected = all roles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SoftSelect
            label="Hide jobs without salary"
            value={prefs.hideNoSalary ? "true" : "false"}
            defaultValue="false"
            options={[
              { value: "false", label: "Show all" },
              { value: "true", label: "Salary listed only" },
            ]}
            onChange={(v) => {
              const next = { ...prefs, hideNoSalary: v === "true" };
              setPrefs(next);
              void savePrefs(next);
            }}
          />
        </div>
      </section>

      {/* BYOK */}
      <section className="space-y-3 border-b border-line/80 pb-5">
        <h2 className="font-display text-lg tracking-tight text-ink">
          AI key
        </h2>
        {byokMeta ? (
          <p className="text-[13px] text-mute">
            {byokMeta.provider} · {byokMeta.masked}
          </p>
        ) : (
          <p className="text-[13px] text-mute">No key saved in this browser.</p>
        )}
        <ByokKeysPanel
          title="Change / remove key"
          onKeyChange={refreshByokMeta}
        />
      </section>

      {/* MCP token */}
      <section className="space-y-3 border-b border-line/80 pb-5">
        <h2 className="font-display text-lg tracking-tight text-ink">
          Personal MCP token
        </h2>
        <p className="text-[13px] text-mute">
          Setup steps live on the{" "}
          <Link
            href="/dashboard/integrations#personal-mcp"
            className="text-mark-deep underline-offset-2 hover:underline"
          >
            Connect
          </Link>{" "}
          tab.
        </p>
        {token ? (
          <p className="text-[13px] text-ink">
            Token active · created {formatIst(token.created_at)}
            {token.last_used_at
              ? ` · last used ${formatIst(token.last_used_at)}`
              : " · never used"}
          </p>
        ) : (
          <p className="text-[13px] text-mute">No active token.</p>
        )}

        {rawOnce ? (
          <div className="space-y-2 border-b border-line/60 pb-3">
            <p className="text-[12px] text-mute">
              Copy now — plaintext is shown once.
            </p>
            <code className="block break-all text-[12px] text-ink">{rawOnce}</code>
            <button
              type="button"
              className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep"
              onClick={() => {
                void copyText(mcpUrlOnce ?? rawOnce).then((ok) => {
                  if (ok) {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  }
                });
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : null}

        {confirmRegen ? (
          <p className="text-[13px] text-mute">
            Generating a new token revokes the current one.{" "}
            <button
              type="button"
              className="text-mark-deep underline-offset-2 hover:underline"
              disabled={tokenBusy}
              onClick={() => void generateToken()}
            >
              Confirm generate
            </button>{" "}
            ·{" "}
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => setConfirmRegen(false)}
            >
              Cancel
            </button>
          </p>
        ) : null}

        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <button
            type="button"
            disabled={tokenBusy}
            onClick={() => void generateToken()}
            className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep transition hover:text-ink disabled:opacity-40"
          >
            {token ? "Generate new token" : "Generate token"}
          </button>
          <button
            type="button"
            disabled={tokenBusy || !token}
            onClick={() => void revokeToken()}
            className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute transition hover:text-ink disabled:opacity-40"
          >
            Revoke token
          </button>
        </div>
      </section>

      {/* Data */}
      <section className="space-y-3 border-b border-line/80 pb-5">
        <h2 className="font-display text-lg tracking-tight text-ink">Data</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <a
            href="/api/me/export"
            className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep transition hover:text-ink"
          >
            Export my data
          </a>
        </div>
        <div className="space-y-2 pt-2">
          <p className="text-[13px] text-mute">
            Delete account — type <span className="text-ink">delete</span> to
            confirm. Removes profile, saves, tokens; anonymizes label reports.
          </p>
          <input
            type="text"
            value={deleteTyped}
            onChange={(e) => setDeleteTyped(e.target.value)}
            placeholder='Type "delete"'
            className="w-full max-w-xs border-0 border-b border-line bg-transparent pb-2 text-[14px] text-ink outline-none placeholder:text-mute/70 focus:border-mark"
          />
          <button
            type="button"
            disabled={
              deleteBusy || deleteTyped.trim().toLowerCase() !== "delete"
            }
            onClick={() => void wipeAccount()}
            className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mute transition hover:text-ink disabled:opacity-40"
          >
            {deleteBusy ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </section>

      {/* Session */}
      <section className="space-y-3">
        <h2 className="font-display text-lg tracking-tight text-ink">
          Session
        </h2>
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/" })}
          className="text-[11px] font-semibold uppercase tracking-[0.06em] text-mark-deep transition hover:text-ink"
        >
          Sign out
        </button>
      </section>

      {error ? <p className="text-sm text-mute">{error}</p> : null}
    </div>
  );
}
