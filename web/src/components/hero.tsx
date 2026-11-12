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
