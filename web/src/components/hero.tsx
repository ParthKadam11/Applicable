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
        topColor="#f5f9fc"
        leftColor="#d9eaf8"
        rightColor="#b7d4ec"
        glowColor="#4cc9f0"
        glow={0.4}
        amplitude={0.55}
      />
    </section>
  );
}
