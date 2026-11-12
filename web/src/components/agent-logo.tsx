import Image from "next/image";
import { AGENT_LOGOS, type AgentLogoId } from "@/lib/agent-logos";

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
  /** Fill the parent tile edge-to-edge (app-icon style). */
  fill?: boolean;
};

export function AgentLogo({
  id,
  label,
  size = "md",
  className = "",
  fill = false,
}: Props) {
  const src = AGENT_LOGOS[id as AgentLogoId];
  const dim = SIZE[size];

  if (!src) return null;

  if (fill) {
    return (
      <Image
        src={src}
        alt={label}
        width={64}
        height={64}
        className={`size-full object-cover ${className}`}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={label}
      width={dim.px}
      height={dim.px}
      className={`${dim.box} rounded-md object-cover ${className}`}
    />
  );
}
