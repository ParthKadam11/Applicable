"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { HeroLite } from "@/components/hero-lite";

const BackgroundCubesGrid = dynamic(
  () =>
    import("@/components/ui/background-cubes-grid").then(
      (m) => m.BackgroundCubesGrid,
    ),
  {
    ssr: false,
    loading: () => <HeroLite />,
  },
);

/**
 * Always run the cube animation. Code-split Three.js so first paint stays
 * fast; upgrade from the CSS shell as soon as the chunk is ready.
 */
export function Hero() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const start = () => setReady(true);
    const ric = window.requestIdleCallback?.bind(window);
    if (ric) {
      const id = ric(start, { timeout: 900 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(start, 120);
    return () => window.clearTimeout(t);
  }, []);

  if (!ready) {
    return <HeroLite />;
  }

  return (
    <section className="relative min-h-[52vh] w-full overflow-hidden sm:min-h-[72vh] lg:min-h-[78vh]">
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
    </section>
  );
}
