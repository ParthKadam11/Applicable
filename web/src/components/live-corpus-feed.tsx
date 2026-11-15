"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import type { CorpusCard } from "@/lib/live-corpus";

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

function JobCard({ card }: { card: CorpusCard }) {
  return (
    <Link
      href={card.href}
      className="group flex min-h-[9.5rem] flex-col rounded-2xl border border-line bg-white p-4 transition hover:border-mark hover:bg-mark-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mark"
    >
      <div className="flex items-start gap-3">
        <CompanyLogo
          company={card.company}
          website={card.companyWebsite}
          size={40}
          className="rounded-[0.75rem] border border-line shadow-sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink"
              style={{
                background: `color-mix(in srgb, ${card.labelColor} 22%, white)`,
              }}
            >
              {card.label}
            </span>
            {card.location ? (
              <span className="truncate text-[11px] text-mute">
                {card.location}
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 line-clamp-2 font-display text-[1.05rem] leading-snug text-ink group-hover:text-mark-deep">
            {card.title}
          </h3>
          <p className="mt-0.5 truncate text-[13px] text-mute">{card.company}</p>
        </div>
      </div>
      <blockquote className="mt-3 line-clamp-2 border-l-[3px] border-sun pl-3 text-[13px] leading-relaxed text-ink">
        “{card.quote}”
      </blockquote>
      <p className="mt-auto pt-3 text-[11px] text-mute">{card.postedAgo}</p>
    </Link>
  );
}

function CardColumn({
  cards,
  animate,
}: {
  cards: CorpusCard[];
  animate: boolean;
}) {
  const loop = animate ? [...cards, ...cards] : cards;
  return (
    <div
      className={`flex flex-col gap-3 ${animate ? "corpus-marquee-col" : ""}`}
    >
      {loop.map((card, i) => (
        <JobCard key={`${card.id}-${i}`} card={card} />
      ))}
    </div>
  );
}

type Props = {
  cards: CorpusCard[];
};

/** Auto-scrolling job feed — vertical on desktop, horizontal strip on mobile. */
export function LiveCorpusFeed({ cards }: Props) {
  const reduced = usePrefersReducedMotion();
  if (cards.length === 0) return null;

  const mid = Math.ceil(cards.length / 2);
  const left = cards.slice(0, mid);
  const right = cards.slice(mid);
  const animate = !reduced && cards.length >= 4;

  if (reduced) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.slice(0, 8).map((card) => (
          <JobCard key={card.id} card={card} />
        ))}
      </div>
    );
  }

  return (
    <div className="corpus-feed relative">
      {/* Mobile: horizontal marquee */}
      <div className="corpus-fade-x relative overflow-hidden md:hidden">
        <div className="corpus-marquee-x flex w-max gap-3 py-1">
          {[...cards, ...cards].map((card, i) => (
            <div key={`${card.id}-m-${i}`} className="w-[min(19rem,78vw)] shrink-0">
              <JobCard card={card} />
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: two vertical columns */}
      <div className="corpus-fade-y relative hidden h-[34rem] overflow-hidden md:grid md:grid-cols-2 md:gap-4">
        <div className="corpus-col-wrap overflow-hidden">
          <CardColumn cards={left.length ? left : cards} animate={animate} />
        </div>
        <div className="corpus-col-wrap overflow-hidden">
          <CardColumn
            cards={right.length ? right : cards}
            animate={animate}
          />
        </div>
      </div>
    </div>
  );
}
