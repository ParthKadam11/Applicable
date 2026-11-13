import { cn } from "@/lib/utils";

type SkelProps = {
  className?: string;
  /** Softer, slower pulse for large fields. */
  tone?: "default" | "soft";
  style?: React.CSSProperties;
};

/** Coastal shimmer block. Prefer fixed sizes so layout never jumps. */
export function Skel({ className, tone = "default", style }: SkelProps) {
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "skel inline-block",
        tone === "soft" && "skel-soft",
        className,
      )}
    />
  );
}

export function ChartPieSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-64 items-center justify-center gap-8",
        className,
      )}
      role="status"
      aria-label="Loading chart"
    >
      <Skel className="size-40 shrink-0 rounded-full" tone="soft" />
      <div className="hidden w-28 flex-col gap-2.5 sm:flex">
        <Skel className="h-2.5 w-full rounded-full" />
        <Skel className="h-2.5 w-[85%] rounded-full" />
        <Skel className="h-2.5 w-[70%] rounded-full" />
        <Skel className="h-2.5 w-[55%] rounded-full" />
      </div>
    </div>
  );
}

export function ChartTrendSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex h-72 flex-col justify-end gap-3 px-1 pb-2", className)}
      role="status"
      aria-label="Loading chart"
    >
      <div className="flex flex-1 items-end gap-2">
        {[42, 58, 35, 72, 48, 64, 40, 78, 52, 68, 45, 60].map((h, i) => (
          <Skel
            key={i}
            tone="soft"
            className="min-w-0 flex-1 rounded-t-md"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <Skel className="h-2 w-full rounded-full" />
    </div>
  );
}

export function TableRowsSkeleton({
  rows = 5,
  cols = 6,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-line/70 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-3 py-3.5">
              <Skel
                className={`h-3 rounded-full ${
                  c === 0 ? "w-[85%]" : c === cols - 1 ? "w-10" : "w-[70%]"
                }`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function ChartEmpty({
  label = "Nothing to show yet",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-64 items-center justify-center text-sm text-mute",
        className,
      )}
    >
      {label}
    </div>
  );
}
