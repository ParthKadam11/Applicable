"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bookmark,
  Building2,
  ChevronDown,
  Menu,
  Search,
  Settings,
  X,
  Briefcase,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { AgentLogo } from "@/components/agent-logo";
import { Skel } from "@/components/ui/skeleton";
import { openOnboardingModal } from "@/lib/onboarding";

type TabItem = {
  href: string;
  label: string;
  icon: ReactNode;
  match: (p: string) => boolean;
};

const WORKSPACE_TABS: TabItem[] = [
  {
    href: "/dashboard/jobs",
    label: "Jobs",
    icon: <Briefcase className="size-4" strokeWidth={1.75} />,
    match: (p) => p.startsWith("/dashboard/jobs"),
  },
  {
    href: "/dashboard/saved",
    label: "Saved",
    icon: <Bookmark className="size-4" strokeWidth={1.75} />,
    match: (p) => p.startsWith("/dashboard/saved"),
  },
  {
    href: "/dashboard/search",
    label: "AI Search",
    icon: <Search className="size-4" strokeWidth={1.75} />,
    match: (p) => p.startsWith("/dashboard/search"),
  },
  {
    href: "/dashboard/companies",
    label: "Companies",
    icon: <Building2 className="size-4" strokeWidth={1.75} />,
    match: (p) => p.startsWith("/dashboard/companies"),
  },
];

const ACCOUNT_TABS: TabItem[] = [
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: <Settings className="size-4" strokeWidth={1.75} />,
    match: (p) => p.startsWith("/dashboard/settings") || p === "/me",
  },
];

const INTEGRATIONS = [
  {
    id: "personal-mcp",
    label: "Personal MCP",
    href: "/dashboard/integrations#personal-mcp",
    logo: false as const,
  },
  { id: "claude", label: "Claude", href: "/dashboard/integrations/claude", logo: true as const },
  { id: "codex", label: "Codex", href: "/dashboard/integrations/codex", logo: true as const },
  { id: "cursor", label: "Cursor", href: "/dashboard/integrations/cursor", logo: true as const },
  { id: "grok", label: "Grokbot", href: "/dashboard/integrations/grok", logo: true as const },
  { id: "instinct", label: "Instinct", href: "/dashboard/integrations/instinct", logo: true as const },
  { id: "chatgpt", label: "ChatGPT", href: "/dashboard/integrations/chatgpt", logo: true as const },
  { id: "windsurf", label: "Windsurf", href: "/dashboard/integrations/windsurf", logo: true as const },
  { id: "cline", label: "Cline", href: "/dashboard/integrations/cline", logo: true as const },
  { id: "mcp", label: "Any MCP", href: "/dashboard/integrations", logo: true as const },
] as const;

function tabClass(on: boolean) {
  return `flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium tracking-[-0.01em] transition ${
    on
      ? "bg-mark-soft text-ink"
      : "text-mute hover:bg-white/70 hover:text-ink"
  }`;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-mute/80">
      {children}
    </p>
  );
}

function TabLink({
  tab,
  onNavigate,
}: {
  tab: TabItem;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const on = tab.match(pathname);
  return (
    <Link href={tab.href} onClick={onNavigate} className={tabClass(on)}>
      <span className={on ? "text-mark-deep" : "text-mute"}>{tab.icon}</span>
      <span className="truncate">{tab.label}</span>
    </Link>
  );
}

function IntegrationsDropdown({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const integrationsActive = pathname.startsWith("/dashboard/integrations");
  const [open, setOpen] = useState(integrationsActive);

  useEffect(() => {
    if (integrationsActive) setOpen(true);
  }, [integrationsActive]);

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${tabClass(integrationsActive)} w-full`}
      >
        <span className={integrationsActive ? "text-mark-deep" : "text-mute"}>
          <SparklesIcon />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">Integrations</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-mute transition ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>
      {open ? (
        <div className="mt-0.5 space-y-0.5 border-l border-line/70 py-1 pl-2 ml-3">
          {INTEGRATIONS.map((item) => {
            const pathOnly = item.href.split("#")[0]!;
            const on = item.href.includes("#")
              ? pathname === "/dashboard/integrations"
              : item.id === "mcp"
                ? pathname === "/dashboard/integrations"
                : pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] transition ${
                  on
                    ? "bg-mark-soft/80 text-ink"
                    : "text-mute hover:bg-white/70 hover:text-ink"
                }`}
              >
                {item.logo ? (
                  <AgentLogo id={item.id} label={item.label} size="sm" />
                ) : (
                  <span className="inline-flex size-5 items-center justify-center rounded-md bg-soft text-[10px] font-semibold text-ink">
                    MCP
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SparklesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"
      />
    </svg>
  );
}

function NavSections({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav
      className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-2"
      aria-label="Dashboard"
    >
      <SectionLabel>Workspace</SectionLabel>
      <div className="flex flex-col gap-0.5">
        {WORKSPACE_TABS.map((tab) => (
          <TabLink key={tab.href} tab={tab} onNavigate={onNavigate} />
        ))}
      </div>

      <SectionLabel>Connect</SectionLabel>
      <div className="flex flex-col gap-0.5">
        <IntegrationsDropdown onNavigate={onNavigate} />
      </div>

      <SectionLabel>Account</SectionLabel>
      <div className="flex flex-col gap-0.5">
        {ACCOUNT_TABS.map((tab) => (
          <TabLink key={tab.href} tab={tab} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}

function AccountBlock({ onNavigate }: { onNavigate?: () => void }) {
  const { data, status } = useSession();

  if (status === "loading") {
    return (
      <div className="border-t border-line/80 px-3 py-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Skel className="size-9 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skel className="h-3 w-24 rounded" />
            <Skel className="h-2.5 w-16 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!data?.user) {
    return (
      <div className="border-t border-line/80 px-3 py-3">
        <Link
          href="/auth"
          onClick={onNavigate}
          className="flex items-center justify-center rounded-xl bg-mark px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-ink transition hover:bg-mark-deep hover:text-white"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const name = data.user.name?.trim() || "Account";
  const email = data.user.email ?? "";
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="border-t border-line/80 px-3 py-3">
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        {data.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.user.image}
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-soft text-[13px] font-semibold text-ink">
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink">{name}</p>
          {email ? (
            <p className="truncate text-[11px] text-mute">{email}</p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          onNavigate?.();
          openOnboardingModal(e.currentTarget);
        }}
        className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[12px] font-medium text-mark-deep transition hover:bg-white/70 hover:text-ink"
      >
        Connect your AI
      </button>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/" })}
        className="mt-0.5 w-full rounded-lg px-3 py-2 text-left text-[12px] text-mute transition hover:bg-white/70 hover:text-ink"
      >
        Sign out
      </button>
    </div>
  );
}

function SidebarChrome({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pb-3 pt-4">
        <Link
          href="/"
          onClick={onNavigate}
          className="inline-flex items-center gap-2.5"
        >
          <BrandLogo size={28} className="rounded-[7px]" />
          <span className="font-display text-[16px] tracking-tight text-ink">
            Applicable
          </span>
        </Link>
      </div>

      <NavSections onNavigate={onNavigate} />
      <AccountBlock onNavigate={onNavigate} />
    </div>
  );
}

/**
 * Desktop sidebar flush to the top (no marketing header offset).
 * Mobile: sticky top bar + slide-over menu.
 */
export function DashboardSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
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

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-paper lg:hidden">
        <div className="flex h-12 items-center justify-between gap-3 px-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <BrandLogo size={24} className="rounded-[6px]" />
            <span className="font-display text-[15px] tracking-tight text-ink">
              Applicable
            </span>
          </Link>
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl border border-line/80 bg-white text-ink"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? (
              <X className="size-4" strokeWidth={2} />
            ) : (
              <Menu className="size-4" strokeWidth={2} />
            )}
          </button>
        </div>
      </header>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal>
          <button
            type="button"
            className="absolute inset-0 bg-ink/30"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col border-r border-line bg-paper shadow-[0_24px_48px_-24px_color-mix(in_srgb,var(--ink)_40%,transparent)]">
            <SidebarChrome onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      ) : null}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[16rem] flex-col border-r border-line bg-paper lg:flex">
        <SidebarChrome />
      </aside>
    </>
  );
}
