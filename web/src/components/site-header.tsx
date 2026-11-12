import Link from "next/link";
import { LINKS } from "@/lib/constants";

function GlassLayers() {
  return (
    <>
      <svg className="pointer-events-none absolute h-0 w-0" aria-hidden>
        <filter
          id="nav-glass-distortion"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          filterUnits="objectBoundingBox"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.012"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="soft"
            scale="28"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backdropFilter: "blur(14px) saturate(180%)",
          WebkitBackdropFilter: "blur(14px) saturate(180%)",
          filter: "url(#nav-glass-distortion)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-white/40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ring-1 ring-inset ring-white/40"
        aria-hidden
      />
    </>
  );
}

export function SiteHeader({ active }: { active?: "home" | "dashboard" }) {
  const link = (on: boolean) =>
    on
      ? "bg-white/55 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
      : "text-mute hover:bg-white/35 hover:text-ink";

  return (
    <header className="sticky top-0 z-50">
      <div className="relative border-b border-white/30">
        <GlassLayers />
        <div className="relative z-10 mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <Link
            href="/"
            className="font-display text-[17px] tracking-tight text-ink"
          >
            CanIApply
          </Link>
          <nav className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-wide sm:gap-1.5">
            <Link
              href="/"
              className={`rounded-full px-3 py-1.5 transition ${link(active === "home")}`}
            >
              Home
            </Link>
            <Link
              href="/dashboard"
              className={`rounded-full px-3 py-1.5 transition ${link(active === "dashboard")}`}
            >
              Dashboard
            </Link>
            <a
              href={LINKS.github}
              className={`hidden rounded-full px-3 py-1.5 transition sm:inline ${link(false)}`}
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <Link
              href="/#mcp"
              className="ml-1 inline-flex min-h-9 items-center rounded-full bg-mark px-4 font-mono text-[10px] font-semibold uppercase text-ink shadow-[0_6px_18px_rgba(76,201,240,0.35)] transition hover:bg-mark-deep hover:text-white"
            >
              Add MCP
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
