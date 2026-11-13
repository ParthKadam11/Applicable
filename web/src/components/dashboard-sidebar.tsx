"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bookmark,
  Building2,
  ChevronDown,
  KeyRound,
  LayoutDashboard,
  Plug,
  Search,
  Settings,
  Sparkles,
  Briefcase,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { AgentLogo } from "@/components/agent-logo";
import { Skel } from "@/components/ui/skeleton";

type TabItem = {
  href: string;
  label: string;
  icon: ReactNode;
  match: (p: string) => boolean;
};

const WORKSPACE_TABS: TabItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: <LayoutDashboard className="size-4" strokeWidth={1.75} />,
    match: (p) => p === "/dashboard",
  },
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

const CONNECT_EXTRAS: TabItem[] = [
  {
    href: "/dashboard/byok",
    label: "BYOK keys",
    icon: <KeyRound className="size-4" strokeWidth={1.75} />,
    match: (p) => p.startsWith("/dashboard/byok"),
  },
  {
    href: "/dashboard/mcp",
    label: "Personal MCP",
    icon: <Sparkles className="size-4" strokeWidth={1.75} />,
    match: (p) => p.startsWith("/dashboard/mcp"),
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
  { id: "claude", label: "Claude", href: "/dashboard/integrations/claude" },
  { id: "codex", label: "Codex", href: "/dashboard/integrations/codex" },
  { id: "cursor", label: "Cursor", href: "/dashboard/integrations/cursor" },
  { id: "grok", label: "Grokbot", href: "/dashboard/integrations/grok" },
  { id: "instinct", label: "Instinct", href: "/dashboard/integrations/instinct" },
  { id: "chatgpt", label: "ChatGPT", href: "/dashboard/integrations/chatgpt" },
  { id: "windsurf", label: "Windsurf", href: "/dashboard/integrations/windsurf" },
  { id: "cline", label: "Cline", href: "/dashboard/integrations/cline" },
  { id: "mcp", label: "Any MCP", href: "/dashboard/integrations" },
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
        <span
          className={integrationsActive ? "text-mark-deep" : "text-mute"}
        >
          <Plug className="size-4" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">Integrations</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-mute transition ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>
      {open ? (
        <div className="mt-0.5 ml-2 space-y-0.5 border-l border-line/80 pl-2">
          {INTEGRATIONS.map((item) => {
            const on =
              pathname === item.href ||
              (item.href !== "/dashboard/integrations" &&
                pathname.startsWith(item.href));
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onNavigate}
                className={tabClass(on)}
              >
                <span className="overflow-hidden rounded-md">
                  <AgentLogo id={item.id} label={item.label} size="sm" />
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
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
        {CONNECT_EXTRAS.map((tab) => (
          <TabLink key={tab.href} tab={tab} onNavigate={onNavigate} />
        ))}
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
        onClick={() => void signOut({ callbackUrl: "/" })}
        className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[12px] text-mute transition hover:bg-white/70 hover:text-ink"
      >
        Sign out
      </button>
    </div>
  );
}

function SidebarChrome({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-5">
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

/** App shell sidebar — sections + icons, integrations dropdown, account foot. */
export function DashboardSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur-md lg:hidden">
        <Link href="/" className="inline-flex items-center gap-2">
          <BrandLogo size={24} className="rounded-[6px]" />
          <span className="font-display text-[15px] tracking-tight text-ink">
            Applicable
          </span>
        </Link>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex size-10 items-center justify-center rounded-xl border border-line text-ink"
        >
          <span className="sr-only">Menu</span>
          <span className="flex w-4 flex-col gap-1" aria-hidden>
            <span
              className={`h-0.5 w-full bg-ink transition ${open ? "translate-y-1.5 rotate-45" : ""}`}
            />
            <span
              className={`h-0.5 w-full bg-ink transition ${open ? "opacity-0" : ""}`}
            />
            <span
              className={`h-0.5 w-full bg-ink transition ${open ? "-translate-y-1.5 -rotate-45" : ""}`}
            />
          </span>
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal>
          <button
            type="button"
            className="absolute inset-0 bg-ink/25"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18.5rem,90vw)] flex-col border-r border-line bg-paper shadow-[8px_0_40px_-24px_color-mix(in_srgb,var(--ink)_40%,transparent)]">
            <SidebarChrome onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[16rem] flex-col border-r border-line bg-paper lg:flex">
        <SidebarChrome />
      </aside>
    </>
  );
}
