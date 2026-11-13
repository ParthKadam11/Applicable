"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const BackgroundCubesGrid = dynamic(
  () =>
    import("@/components/ui/background-cubes-grid").then(
      (m) => m.BackgroundCubesGrid,
    ),
  { ssr: false },
);

/** Interactive hero cubes for the auth left pane. */
export function AuthHeroField() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = window.setTimeout(() => setReady(true), 40);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="absolute inset-0" aria-hidden>
      <div className="hero-shell absolute inset-0">
        <div className="hero-iso absolute inset-0" />
        <div className="hero-iso-glow absolute inset-0" />
      </div>
      {ready ? (
        <div className="absolute inset-0 opacity-[0.92]">
          <BackgroundCubesGrid
            variant="isometric"
            cellSize={48}
            gap={0.035}
            topColor="#f6fafc"
            leftColor="#d7ebf4"
            rightColor="#b5d6e6"
            glowColor="#4cc9f0"
            glow={0.34}
            amplitude={0.5}
          />
        </div>
      ) : null}
      {/* Soft vignette so the jobs panel reads as the focal plane */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_48%,transparent_28%,color-mix(in_srgb,var(--paper)_72%,transparent)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-paper/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-paper/70 to-transparent" />
    </div>
  );
}
