import type { TopCompany } from "@/lib/api";
import { formatNumber } from "@/lib/format";

export function TopCompanies({ companies }: { companies: TopCompany[] | null }) {
  if (!companies || companies.length === 0) {
    return <p className="text-sm text-zinc-500">—</p>;
  }

  const max = Math.max(...companies.map((c) => c.total), 1);

  return (
    <ol className="space-y-3">
      {companies.map((c, i) => (
        <li key={c.id} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3">
          <span className="font-mono text-xs text-zinc-600">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm font-medium text-zinc-100">{c.name}</p>
              <p className="shrink-0 font-mono text-xs text-zinc-400">
                {formatNumber(c.total)}
              </p>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className="h-full rounded-full bg-emerald-400/70"
                style={{ width: `${(c.total / max) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-zinc-600">
              {formatNumber(c.open)} open · {formatNumber(c.india_remote)} India
              remote
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
