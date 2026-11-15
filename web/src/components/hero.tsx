"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { HeroCopy } from "@/components/hero-copy";
import { HeroLite } from "@/components/hero-lite";

const BackgroundCubesGrid = dynamic(
  () =>
    import("@/components/ui/background-cubes-grid").then(
      (m) => m.BackgroundCubesGrid,
    ),
  { ssr: false },
);

/**
 * Stacked hero layout (title → subline → CTAs → preview slot).
 * Ambient cubes stay behind; content is not vertically centered.
 */
export function Hero() {
  const [loadGl, setLoadGl] = useState(false);
  const [glReady, setGlReady] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const start = () => setLoadGl(true);
    const ric = window.requestIdleCallback?.bind(window);
    if (ric) {
      const id = ric(start, { timeout: 900 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(start, 120);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!loadGl) return;
    const t = window.setTimeout(() => setGlReady(true), 120);
    return () => window.clearTimeout(t);
  }, [loadGl]);

  if (!loadGl) {
    return <HeroLite />;
  }

  return (
    <section
      className="relative w-full overflow-hidden"
      aria-label="Applicable"
    >
      <div className="absolute inset-0 z-0">
        <HeroLite fieldOnly />
      </div>
      <div
        className={`hero-webgl-fade absolute inset-0 z-[1] ${glReady ? "is-ready" : ""}`}
      >
        <BackgroundCubesGrid
          variant="isometric"
          cellSize={52}
          gap={0.035}
          topColor="#f6fafc"
          leftColor="#d7ebf4"
          rightColor="#b5d6e6"
          glowColor="#4cc9f0"
          glow={0.38}
          amplitude={0.55}
        />
      </div>
      {/* Soft center hush so type sits in a calm pocket over the field */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(ellipse_68%_56%_at_50%_26%,rgba(255,255,255,0.64)_0%,rgba(246,250,252,0.28)_48%,transparent_74%)]"
        aria-hidden
      />
      <div className="relative z-[2]">
        <HeroCopy />
      </div>
    </section>
  );
}
