"use client";

import { useState } from "react";
import { companyLogoDomain, companyLogoUrl } from "@/lib/company-logo";
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

/** Real company mark from website/domain; falls back to initial. */
export function CompanyLogo({
  company,
  website,
  className,
  size = 36,
}: Props) {
  const domain = companyLogoDomain(company, website);
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(domain) && !failed;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[0.7rem] bg-white text-[13px] font-semibold text-ink",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote logo CDN; onError fallback
        <img
          src={companyLogoUrl(domain!)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <span>{initial(company)}</span>
      )}
    </span>
  );
}
