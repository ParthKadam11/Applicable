import type { TopCompany } from "@/lib/api";
import { formatNumber } from "@/lib/format";

export function TopCompanies({ companies }: { companies: TopCompany[] | null }) {
  if (!companies || companies.length === 0) {
    return <p className="font-mono text-sm text-mute">-</p>;
  }

  const max = Math.max(...companies.map((c) => c.total), 1);

  return (
    <ol className="space-y-3">
      {companies.map((c, i) => (
        <li
          key={c.id}
          className="grid grid-cols-[2rem_1fr] items-center gap-3"
        >
          <span className="font-mono text-xs tabular-nums text-mute">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium text-ink">{c.name}</p>
              <p className="shrink-0 font-mono text-xs tabular-nums text-mute">
                {formatNumber(c.total)}
              </p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper">
              <div
                className="h-full rounded-full bg-mark"
                style={{ width: `${(c.total / max) * 100}%` }}
              />
            </div>
            <p className="mt-1 font-mono text-[10px] uppercase text-mute">
              {formatNumber(c.open)} open · {formatNumber(c.india_remote)} India
              remote
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
