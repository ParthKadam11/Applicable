"use client";

import { useEffect, useState } from "react";
import {
  companyLogoCandidates,
  companyLogoDomain,
} from "@/lib/company-logo";
import { cn } from "@/lib/utils";

type Props = {
  company: string;
  website?: string | null;
  className?: string;
  size?: number;
};

function initial(name: string) {
  const letter = name.trim().charAt(0);
  return letter ? letter.toUpperCase() : "?";
}

/** Real company mark from website/domain; multi-CDN fallback → initial. */
export function CompanyLogo({
  company,
  website,
  className,
  size = 36,
}: Props) {
  const domain = companyLogoDomain(company, website);
  const candidates = domain ? companyLogoCandidates(domain) : [];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(0);
  }, [domain, company, website]);

  const src = candidates[idx] ?? null;
  const showImg = Boolean(src);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[0.7rem] bg-white text-[13px] font-semibold text-ink ring-1 ring-line/60",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote logo CDN; onError cascades
        <img
          key={src}
          src={src!}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            setIdx((i) => (i + 1 < candidates.length ? i + 1 : candidates.length));
          }}
          className="size-full object-contain p-0.5"
        />
      ) : (
        <span className="bg-soft size-full inline-flex items-center justify-center">
          {initial(company)}
        </span>
      )}
    </span>
  );
}
