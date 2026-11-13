import Link from "next/link";
import { AuthMenu } from "@/components/auth-menu";
import { BrandLogo } from "@/components/brand-logo";

/** Light glass - no SVG displacement filter (that costs a lot on phones). */
function GlassLayers() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 bg-white/70 backdrop-blur-md supports-[backdrop-filter]:bg-white/55"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-inset ring-white/35"
        aria-hidden
      />
    </>
  );
}

export function SiteHeader({
  active,
}: {
  active?: "home" | "dashboard" | "me" | "auth";
}) {
  const link = (on: boolean) =>
    on
      ? "bg-white/70 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
      : "text-mute hover:bg-white/45 hover:text-ink";

  return (
    <header className="sticky top-0 z-50">
      <div className="relative border-b border-white/30">
        <GlassLayers />
        <div className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5 sm:gap-4 sm:px-8 sm:py-3">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 font-display text-[16px] tracking-tight text-ink sm:gap-2.5 sm:text-[17px]"
          >
            <BrandLogo size={26} className="shrink-0 rounded-[6px] sm:rounded-[7px]" />
            <span className="truncate">Applicable</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-0.5 text-[10px] uppercase tracking-wide sm:gap-1.5 sm:text-[11px]">
            <Link
              href="/"
              className={`hidden rounded-full px-2.5 py-1.5 transition xs:inline sm:px-3 ${link(active === "home")}`}
            >
              Home
            </Link>
            <AuthMenu />
            <Link
              href="/#mcp"
              className="ml-0.5 inline-flex min-h-9 items-center rounded-full bg-mark px-3 text-[10px] font-semibold uppercase text-ink shadow-[0_6px_18px_color-mix(in_srgb,var(--mark)_35%,transparent)] transition hover:bg-mark-deep hover:text-white sm:ml-1 sm:px-4"
            >
              Add MCP
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
