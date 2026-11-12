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
      {/* Blur + liquid refraction */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{
          backdropFilter: "blur(14px) saturate(180%)",
          WebkitBackdropFilter: "blur(14px) saturate(180%)",
          filter: "url(#nav-glass-distortion)",
        }}
        aria-hidden
      />
      {/* Tint */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-white/35"
        aria-hidden
      />
      {/* Specular edge */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_1px_1px_0_rgba(255,255,255,0.75),inset_0_-1px_0_rgba(255,255,255,0.25),0_8px_32px_rgba(6,32,58,0.08)] ring-1 ring-white/50"
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
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6 sm:pt-5">
      <div className="pointer-events-auto relative mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-2xl">
          <GlassLayers />
          <div className="relative z-10 flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
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
                className="ml-1 inline-flex min-h-9 items-center rounded-full bg-ink/90 px-4 font-mono text-[10px] font-semibold uppercase text-white shadow-[0_6px_18px_rgba(6,32,58,0.22)] backdrop-blur-sm transition hover:bg-ink"
              >
                Add MCP
              </Link>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
