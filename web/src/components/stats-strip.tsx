import type { Stats } from "@/lib/api";
import {
  applicablePct,
  formatIst,
  formatNumber,
  formatPercent,
} from "@/lib/format";

type Props = {
  stats: Stats | null;
  compact?: boolean;
};

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl tracking-tight text-zinc-50 sm:text-[1.75rem]">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function StatsStrip({ stats, compact }: Props) {
  const open = stats?.by_eligibility?.open;
  const indiaRemote = stats?.by_eligibility?.india_remote;
  const pct = applicablePct(open, indiaRemote, stats?.tech_open_jobs);

  return (
    <section
      className={
        compact
          ? "border-b border-white/[0.06] bg-zinc-950/40"
          : "border-y border-white/[0.06] bg-zinc-950/50"
      }
    >
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="Tech jobs"
            value={formatNumber(stats?.tech_open_jobs)}
          />
          <Stat
            label="Companies"
            value={formatNumber(stats?.companies_active)}
          />
          <Stat label="Open worldwide" value={formatNumber(open)} />
          <Stat label="India remote" value={formatNumber(indiaRemote)} />
          <Stat
            label="Applicable"
            value={formatPercent(pct)}
            hint="(open + india remote) / tech"
          />
        </div>
        <p className="mt-6 text-xs text-zinc-600">
          Last updated{" "}
          <span className="text-zinc-400">
            {formatIst(stats?.last_ingestion_at)} IST
          </span>
        </p>
      </div>
    </section>
  );
}
