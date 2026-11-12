import Link from "next/link";

export function SiteHeader({ active }: { active?: "home" | "dashboard" }) {
  return (
    <header className="relative z-20 border-b border-white/[0.06]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="font-display text-[1.05rem] tracking-tight text-zinc-50 transition hover:text-white"
        >
          CanIApply
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/"
            className={`rounded-md px-3 py-1.5 transition ${
              active === "home"
                ? "text-zinc-50"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Home
          </Link>
          <Link
            href="/dashboard"
            className={`rounded-md px-3 py-1.5 transition ${
              active === "dashboard"
                ? "text-zinc-50"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Dashboard
          </Link>
          <Link
            href="/#mcp"
            className="ml-1 hidden rounded-md bg-emerald-400/10 px-3 py-1.5 text-emerald-300 ring-1 ring-emerald-400/20 transition hover:bg-emerald-400/15 sm:inline-block"
          >
            Add MCP
          </Link>
        </nav>
      </div>
    </header>
  );
}
