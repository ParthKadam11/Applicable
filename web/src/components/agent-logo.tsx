"use client";

import Image from "next/image";
import { useState } from "react";
import { AGENT_LOGOS, type AgentLogoId } from "@/lib/agent-logos";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, { box: string; px: number }> = {
  sm: { box: "size-5", px: 20 },
  md: { box: "size-8", px: 32 },
  lg: { box: "size-10", px: 40 },
};

type Props = {
  id: string;
  label: string;
  size?: Size;
  className?: string;
  /** Edge-to-edge inside a parent tile. */
  fill?: boolean;
  priority?: boolean;
};

export function AgentLogo({
  id,
  label,
  size = "md",
  className = "",
  fill = false,
  priority = false,
}: Props) {
  const src = AGENT_LOGOS[id as AgentLogoId];
  const dim = SIZE[size];
  const [loaded, setLoaded] = useState(false);

  if (!src) return null;

  if (fill) {
    return (
      <span className={cn("relative block size-full overflow-hidden", className)}>
        {!loaded ? (
          <span className="skel absolute inset-0 block" aria-hidden />
        ) : null}
        <Image
          src={src}
          alt={label}
          width={64}
          height={64}
          sizes="64px"
          quality={70}
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          onLoad={() => setLoaded(true)}
          className={cn(
            "size-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-md",
        dim.box,
        className,
      )}
    >
      {!loaded ? (
        <span className="skel absolute inset-0 block rounded-md" aria-hidden />
      ) : null}
      <Image
        src={src}
        alt={label}
        width={dim.px}
        height={dim.px}
        sizes={`${dim.px}px`}
        quality={65}
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        onLoad={() => setLoaded(true)}
        className={cn(
          "size-full rounded-md object-cover transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  );
}
