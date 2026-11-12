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

export function StatsStrip({ stats }: Props) {
  const open = stats?.by_eligibility?.open;
  const indiaRemote = stats?.by_eligibility?.india_remote;
  const pct = applicablePct(open, indiaRemote, stats?.tech_open_jobs);

  const cells = [
    { k: "Tech jobs", v: formatNumber(stats?.tech_open_jobs) },
    { k: "Companies", v: formatNumber(stats?.companies_active) },
    { k: "Open worldwide", v: formatNumber(open) },
    { k: "India remote", v: formatNumber(indiaRemote) },
    { k: "Applicable", v: formatPercent(pct), hot: true },
  ];

  return (
    <section className="border-y border-line bg-white/80">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-5">
          {cells.map((c) => (
            <div key={c.k} className="bg-white px-4 py-5 sm:px-5">
              <p className="font-mono text-[10px] uppercase text-mute">{c.k}</p>
              <p
                className={`mt-2 font-mono text-2xl tabular-nums sm:text-[1.65rem] ${
                  c.hot ? "text-mark-deep" : "text-ink"
                }`}
              >
                {c.v}
              </p>
            </div>
          ))}
        </div>
        <p className="py-3 font-mono text-[10px] uppercase text-mute">
          Updated {formatIst(stats?.last_ingestion_at)} IST · (open + india
          remote) / tech
        </p>
      </div>
    </section>
  );
}
