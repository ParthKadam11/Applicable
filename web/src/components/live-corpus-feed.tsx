"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
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

function JobRow({ card }: { card: CorpusCard }) {
  return (
    <Link
      href={card.href}
      className="group flex min-w-0 gap-2.5 rounded-xl border border-line/80 bg-white px-2.5 py-2.5 transition hover:border-mark hover:bg-mark-soft/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mark xs:gap-3 xs:px-3"
    >
      <CompanyLogo
        company={card.company}
        website={card.companyWebsite}
        size={32}
        className="rounded-lg border border-line bg-soft text-[11px]"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="max-w-[55%] shrink-0 truncate rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-ink"
            style={{
              background: `color-mix(in srgb, ${card.labelColor} 20%, white)`,
            }}
          >
            {card.label}
          </span>
          <span className="min-w-0 truncate text-[12px] text-mute">
            {card.company}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug text-ink group-hover:text-mark-deep md:truncate">
          {card.title}
        </p>
        <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-mute md:truncate">
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
        <div className="corpus-fade-y relative grid h-[20rem] grid-cols-1 gap-3 overflow-hidden md:h-[22rem] md:grid-cols-2">
          <div className="min-w-0 overflow-hidden">
            <MarqueeColumn cards={left.length ? left : list} />
          </div>
          <div className="hidden min-w-0 overflow-hidden md:block">
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
