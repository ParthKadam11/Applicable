"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type LogoItem = {
  name: string;
  node: ReactNode;
};

type LogosWithBlurFlipProps = {
  sets: LogoItem[][];
  intervalMs?: number;
  className?: string;
  itemClassName?: string;
};

/**
 * Aceternity-style logos-with-blur-flip:
 * cycles logo sets every few seconds with blur + fade enter/exit.
 */
export function LogosWithBlurFlip({
  sets,
  intervalMs = 3000,
  className,
  itemClassName,
}: LogosWithBlurFlipProps) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const active = sets[index] ?? sets[0] ?? [];

  useEffect(() => {
    if (reduceMotion || sets.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % sets.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, reduceMotion, sets.length]);

  return (
    <div
      className={cn(
        "flex min-h-[3.25rem] flex-wrap items-center justify-center gap-x-8 gap-y-5 sm:min-h-[3.5rem] sm:gap-x-10 md:gap-x-12",
        className,
      )}
    >
      <AnimatePresence mode="popLayout">
        {active.map((logo, i) => (
          <motion.div
            key={`${index}-${logo.name}`}
            layout
            initial={
              reduceMotion
                ? false
                : { opacity: 0, y: 40, filter: "blur(10px)" }
            }
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={
              reduceMotion
                ? undefined
                : { opacity: 0, y: -40, filter: "blur(10px)" }
            }
            transition={{
              duration: 0.45,
              delay: reduceMotion ? 0 : i * 0.1,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cn(
              "flex items-center gap-2 text-[#3d4f5f]",
              itemClassName,
            )}
          >
            {logo.node}
            <span className="text-sm font-medium sm:text-[15px]">
              {logo.name}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
