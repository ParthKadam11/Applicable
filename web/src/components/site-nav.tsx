"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BrandLogo } from "@/components/brand-logo";
import { CopyButton } from "@/components/copy-button";
import { Skel } from "@/components/ui/skeleton";
import { GITHUB_PUBLIC, LINKS, MCP_ENDPOINT } from "@/lib/constants";
import type { McpTokenPublic } from "@/lib/me-types";
import { authHref, userInitials, type NavUser } from "@/lib/nav";

type Props = {
  initialUser: NavUser | null;
  initialSavedCount: number | null;
};

function GlassLayers({ scrolled }: { scrolled: boolean }) {
  return (
    <>
      <div
        className={`pointer-events-none absolute inset-0 transition ${
          scrolled
            ? "bg-white/80 backdrop-blur-md supports-[backdrop-filter]:bg-white/65"
            : "bg-white/70 backdrop-blur-md supports-[backdrop-filter]:bg-white/55"
        }`}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-inset ring-white/35 transition ${
          scrolled ? "border-b border-line/80" : ""
        }`}
        aria-hidden
      />
    </>
  );
}

function Avatar({ user, size = 32 }: { user: NavUser; size?: number }) {
  const initials = userInitials(user);
  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Google avatar URL
      <img
        src={user.image}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-soft text-[11px] font-semibold text-ink"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      width="18"
      height="18"
      aria-hidden
      fill="currentColor"
    >
      <path d="M12 2C6.477 2 2 6.586 2 12.253c0 4.53 2.865 8.367 6.839 9.72.5.095.683-.222.683-.48 0-.237-.01-.865-.014-1.698-2.782.617-3.369-1.37-3.369-1.37-.455-1.18-1.11-1.494-1.11-1.494-.908-.635.069-.622.069-.622 1.003.072 1.53 1.05 1.53 1.05.892 1.566 2.341 1.114 2.91.852.092-.662.35-1.114.636-1.37-2.22-.259-4.555-1.14-4.555-5.073 0-1.12.39-2.037 1.03-2.756-.103-.26-.447-1.302.098-2.714 0 0 .84-.274 2.75 1.052A9.35 9.35 0 0 1 12 6.844a9.35 9.35 0 0 1 2.504.345c1.909-1.326 2.747-1.052 2.747-1.052.547 1.412.203 2.454.1 2.714.64.719 1.028 1.636 1.028 2.756 0 3.943-2.338 4.81-4.566 5.064.359.316.679.942.679 1.9 0 1.371-.013 2.477-.013 2.814 0 .26.18.58.688.48A10.27 10.27 0 0 0 22 12.253C22 6.586 17.523 2 12 2z" />
    </svg>
  );
}

function MenuRow({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block rounded-lg px-3 py-2 text-[13px] text-ink transition hover:bg-soft"
    >
      {children}
    </Link>
  );
}

function ConnectAiPanel({ onDone }: { onDone?: () => void }) {
  const [tokens, setTokens] = useState<McpTokenPublic[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/mcp-token");
        if (!res.ok) {
          if (!cancelled) setTokens([]);
          return;
        }
        const body = (await res.json()) as { tokens?: McpTokenPublic[] };
        if (!cancelled) setTokens(body.tokens ?? []);
      } catch {
        if (!cancelled) setTokens([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = (tokens ?? []).find((t) => t.active && !t.revoked_at);

  return (
    <div className="border-t border-line px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-mute">
        Connect your AI
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-paper px-2 py-1 text-[10px] text-ink">
          {MCP_ENDPOINT}
        </code>
        <CopyButton text={MCP_ENDPOINT} label="Copy" />
      </div>
      <p className="mt-2 text-[12px] text-mute">
        {tokens == null
          ? "Checking personal token…"
          : active
            ? "Personal token active."
            : "No personal token yet."}
      </p>
      <Link
        href="/dashboard/integrations#personal-mcp"
        onClick={onDone}
        className="mt-2 inline-flex text-[12px] font-medium text-mark-deep hover:underline"
      >
        Manage personal MCP
      </Link>
    </div>
  );
}

function AvatarMenu({
  user,
  onClose,
}: {
  user: NavUser;
  onClose: () => void;
}) {
  const [showConnect, setShowConnect] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointer(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="Account menu"
      className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_16px_40px_-20px_color-mix(in_srgb,var(--ink)_45%,transparent)]"
    >
      <div className="border-b border-line px-3 py-3">
        <p className="truncate text-[13px] font-semibold text-ink">
          {user.name?.trim() || "Account"}
        </p>
        {user.email ? (
          <p className="mt-0.5 truncate text-[12px] text-mute">{user.email}</p>
        ) : null}
      </div>
      <div className="py-1.5">
        <MenuRow href="/dashboard/settings" onClick={onClose}>
          My skills / profile
        </MenuRow>
        <MenuRow href="/dashboard/saved" onClick={onClose}>
          Saved jobs
        </MenuRow>
        <button
          type="button"
          role="menuitem"
          onClick={() => setShowConnect((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] text-ink transition hover:bg-soft"
        >
          Connect your AI
          <span className="text-[10px] text-mute">
            {showConnect ? "Hide" : "Show"}
          </span>
        </button>
        {showConnect ? <ConnectAiPanel onDone={onClose} /> : null}
      </div>
      <div className="border-t border-line p-1.5">
        <button
          type="button"
          role="menuitem"
          onClick={() => void signOut({ callbackUrl: "/" })}
          className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-mute transition hover:bg-soft hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function HowItWorksLink({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href="/#how"
      onClick={onClick}
      className={
        className ??
        "text-[13px] font-normal text-mute transition hover:text-ink"
      }
    >
      How it works
    </Link>
  );
}

/** Auth-aware product navbar — logo left, How it works + auth on the right. */
export function SiteNav({ initialUser }: Props) {
  const pathname = usePathname() || "/";
  const { data, status } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  const sessionUser = data?.user
    ? {
        name: data.user.name,
        email: data.user.email,
        image: data.user.image,
      }
    : null;
  const user: NavUser | null =
    status === "authenticated"
      ? sessionUser
      : status === "unauthenticated"
        ? null
        : initialUser;
  const signedIn = Boolean(user);
  const awaitingAvatar = status === "loading" && Boolean(initialUser);

  const hideChrome =
    pathname.startsWith("/auth") || pathname.startsWith("/waitlist");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  if (hideChrome) return null;

  const browseHref = authHref("/dashboard/jobs");

  return (
    <header className="sticky top-0 z-50">
      <div
        className={`relative border-b transition ${
          scrolled ? "border-line/70" : "border-white/30"
        }`}
      >
        <GlassLayers scrolled={scrolled} />
        <div className="relative z-10 mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 xs:gap-3 sm:px-8 sm:py-3">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 font-display text-[16px] tracking-tight text-ink sm:gap-2.5 sm:text-[17px]"
          >
            <BrandLogo
              size={26}
              className="shrink-0 rounded-[6px] sm:rounded-[7px]"
            />
            <span className="truncate">Applicable</span>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-2 xs:gap-3 sm:gap-4">
            <HowItWorksLink className="hidden text-[13px] font-normal text-mute transition hover:text-ink md:inline" />

            {GITHUB_PUBLIC ? (
              <a
                href={LINKS.github}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Applicable on GitHub"
                className="hidden size-9 items-center justify-center rounded-full text-mute transition hover:bg-white/45 hover:text-ink md:inline-flex"
              >
                <GitHubIcon />
              </a>
            ) : null}

            {awaitingAvatar ? (
              <span
                className="inline-flex"
                aria-hidden
                aria-label="Loading account"
              >
                <Skel className="size-8 rounded-full" />
              </span>
            ) : signedIn && user ? (
              <div className="relative hidden md:block">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-controls={menuId}
                  aria-label="Open account menu"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="inline-flex size-9 items-center justify-center overflow-hidden rounded-full ring-1 ring-line transition hover:ring-mark"
                >
                  <Avatar user={user} size={32} />
                </button>
                {menuOpen ? (
                  <div id={menuId}>
                    <AvatarMenu user={user} onClose={closeMenu} />
                  </div>
                ) : null}
              </div>
            ) : (
              <Link
                href={browseHref}
                className="inline-flex min-h-9 items-center rounded-full bg-mark px-3 text-[11px] font-semibold uppercase tracking-wide text-ink shadow-[0_6px_18px_color-mix(in_srgb,var(--mark)_35%,transparent)] transition hover:bg-mark-deep hover:text-white sm:px-3.5"
              >
                Browse jobs
              </Link>
            )}

            <button
              type="button"
              className="inline-flex size-10 items-center justify-center rounded-xl border border-line/80 bg-white/70 text-ink md:hidden"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((v) => !v)}
            >
              <span className="flex w-4 flex-col gap-1" aria-hidden>
                <span
                  className={`h-0.5 w-full bg-ink transition ${mobileOpen ? "translate-y-1.5 rotate-45" : ""}`}
                />
                <span
                  className={`h-0.5 w-full bg-ink transition ${mobileOpen ? "opacity-0" : ""}`}
                />
                <span
                  className={`h-0.5 w-full bg-ink transition ${mobileOpen ? "-translate-y-1.5 -rotate-45" : ""}`}
                />
              </span>
            </button>
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal
          aria-label="Navigation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-ink/30"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-x-0 top-0 flex max-h-[100dvh] flex-col border-b border-line bg-white shadow-[0_24px_48px_-24px_color-mix(in_srgb,var(--ink)_40%,transparent)]">
            <div className="flex items-center justify-between px-4 py-3">
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center gap-2 font-display text-[16px] text-ink"
              >
                <BrandLogo size={26} className="rounded-[6px]" />
                Applicable
              </Link>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="inline-flex size-10 items-center justify-center rounded-xl border border-line text-ink"
              >
                ✕
              </button>
            </div>
            <nav className="flex flex-col gap-1 px-3 pb-3" aria-label="Primary">
              <HowItWorksLink
                onClick={() => setMobileOpen(false)}
                className="rounded-xl px-3 py-3 text-[15px] font-normal text-ink hover:bg-soft"
              />
              {GITHUB_PUBLIC ? (
                <a
                  href={LINKS.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-3 text-[15px] font-normal text-ink hover:bg-soft"
                >
                  <GitHubIcon />
                  GitHub
                </a>
              ) : null}
            </nav>
            <div className="mt-auto border-t border-line px-4 py-4">
              {awaitingAvatar ? (
                <div className="flex items-center gap-3">
                  <Skel className="size-10 rounded-full" />
                  <Skel className="h-3 w-28 rounded" />
                </div>
              ) : signedIn && user ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Avatar user={user} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-ink">
                        {user.name?.trim() || "Account"}
                      </p>
                      {user.email ? (
                        <p className="truncate text-[12px] text-mute">
                          {user.email}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <MenuRow
                    href="/dashboard/settings"
                    onClick={() => setMobileOpen(false)}
                  >
                    My skills / profile
                  </MenuRow>
                  <MenuRow
                    href="/dashboard/saved"
                    onClick={() => setMobileOpen(false)}
                  >
                    Saved jobs
                  </MenuRow>
                  <ConnectAiPanel onDone={() => setMobileOpen(false)} />
                  <button
                    type="button"
                    onClick={() => void signOut({ callbackUrl: "/" })}
                    className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-[14px] text-mute hover:bg-soft hover:text-ink"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  href={browseHref}
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-mark text-[12px] font-semibold uppercase tracking-wide text-ink"
                >
                  Browse jobs
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
