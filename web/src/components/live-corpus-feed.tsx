"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CorpusCard } from "@/lib/live-corpus";

const FEED_CAP = 12;

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

function Initial({ name }: { name: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-soft text-[11px] font-semibold text-ink"
      aria-hidden
    >
      {letter}
    </span>
  );
}

function JobRow({ card }: { card: CorpusCard }) {
  return (
    <Link
      href={card.href}
      className="group flex gap-3 rounded-xl border border-line/80 bg-white px-3 py-2.5 transition hover:border-mark hover:bg-mark-soft/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mark"
    >
      <Initial name={card.company} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-ink"
            style={{
              background: `color-mix(in srgb, ${card.labelColor} 20%, white)`,
            }}
          >
            {card.label}
          </span>
          <span className="truncate text-[12px] text-mute">{card.company}</span>
        </div>
        <p className="mt-0.5 truncate text-[13px] font-medium leading-snug text-ink group-hover:text-mark-deep">
          {card.title}
        </p>
        <p className="mt-1 truncate text-[12px] leading-snug text-mute">
          <span className="text-ink/80">“{card.quote}”</span>
          <span className="text-line"> · </span>
          <span>{card.postedAgo.replace(/^Posted /i, "")}</span>
        </p>
      </div>
    </Link>
  );
}

function MarqueeColumn({
  cards,
  reverse,
}: {
  cards: CorpusCard[];
  reverse?: boolean;
}) {
  const loop = [...cards, ...cards];
  return (
    <div
      className={`corpus-marquee-col flex flex-col gap-2 ${reverse ? "corpus-marquee-col--rev" : ""}`}
    >
      {loop.map((card, i) => (
        <JobRow key={`${card.id}-${i}`} card={card} />
      ))}
    </div>
  );
}

type Props = {
  cards: CorpusCard[];
};

/**
 * Light auto-scrolling feed. Caps cards, initials instead of remote logos,
 * one layout at a time, starts only when near the viewport.
 */
export function LiveCorpusFeed({ cards }: Props) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const list = cards.slice(0, FEED_CAP);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (list.length === 0) return null;

  if (reduced || !active) {
    return (
      <div
        ref={rootRef}
        className="grid gap-2 sm:grid-cols-2"
        style={{ minHeight: reduced ? undefined : "16rem" }}
      >
        {(active ? list : list.slice(0, 6)).map((card) => (
          <JobRow key={card.id} card={card} />
        ))}
      </div>
    );
  }

  const mid = Math.ceil(list.length / 2);
  const left = list.slice(0, mid);
  const right = list.slice(mid);

  return (
    <div ref={rootRef} className="corpus-feed relative">
      {isMobile ? (
        <div className="corpus-fade-x relative overflow-hidden">
          <div className="corpus-marquee-x flex w-max gap-2 py-0.5">
            {[...list, ...list].map((card, i) => (
              <div
                key={`${card.id}-m-${i}`}
                className="w-[min(17.5rem,82vw)] shrink-0"
              >
                <JobRow card={card} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="corpus-fade-y relative grid h-[22rem] grid-cols-2 gap-3 overflow-hidden">
          <div className="overflow-hidden">
            <MarqueeColumn cards={left.length ? left : list} />
          </div>
          <div className="overflow-hidden">
            <MarqueeColumn
              cards={right.length ? right : list}
              reverse
            />
          </div>
        </div>
      )}
    </div>
  );
}
