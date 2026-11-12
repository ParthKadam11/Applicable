import { cn } from "@/lib/utils";

type Props = {
  size?: number;
  className?: string;
  /** Edge-to-edge inside a parent tile. */
  fill?: boolean;
  alt?: string;
};

/** Official Applicable mark from /public/logo.svg */
export function BrandLogo({
  size = 32,
  className = "",
  fill = false,
  alt = "Applicable",
}: Props) {
  if (fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local SVG mark
      <img
        src="/logo.svg"
        alt={alt}
        width={64}
        height={64}
        className={cn("size-full object-cover", className)}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- local SVG mark
    <img
      src="/logo.svg"
      alt={alt}
      width={size}
      height={size}
      className={cn("rounded-[22%] object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}
