"use client";

import { BackgroundCubesGrid } from "@/components/ui/background-cubes-grid";

/** Clean hero shell — cubes grid only for now. */
export function Hero() {
  return (
    <section className="relative min-h-[72vh] w-full overflow-hidden sm:min-h-[78vh]">
      <BackgroundCubesGrid
        variant="isometric"
        cellSize={52}
        gap={0.035}
        topColor="#f4fbff"
        leftColor="#d7ebf7"
        rightColor="#b8d4e8"
        glowColor="#00b39a"
        glow={0.4}
        amplitude={0.55}
      />
    </section>
  );
}
