"use client";

import { useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/format";
import type { CorpusStat } from "@/lib/live-corpus";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function CountUp({ value, active }: { value: number; active: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [n, setN] = useState(reduced || !active ? value : 0);

  useEffect(() => {
    if (reduced || !active) {
      setN(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - (1 - p) ** 3;
      setN(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, active, reduced]);

  return (
    <span className="tabular-nums">{formatNumber(n)}</span>
  );
}

type Props = {
  stats: CorpusStat[];
  updatedLabel: string | null;
};

/** Four live stats + pulsing “Updated X min ago”. */
export function LiveCorpusStats({ stats, updatedLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.key}
            className="bg-white px-4 py-5 sm:px-5 sm:py-6"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-mute">
              {s.label}
            </p>
            <p className="mt-2 font-display text-2xl text-ink sm:text-[1.75rem]">
              <CountUp value={s.value} active={active} />
            </p>
          </div>
        ))}
      </div>
      {updatedLabel ? (
        <p className="mt-3 flex items-center gap-2 text-[11px] text-mute">
          <span
            className="relative inline-flex size-1.5"
            aria-hidden
          >
            <span className="absolute inset-0 animate-ping rounded-full bg-mark opacity-60" />
            <span className="relative size-1.5 rounded-full bg-mark-deep" />
          </span>
          <span>{updatedLabel}</span>
        </p>
      ) : null}
    </div>
  );
}
