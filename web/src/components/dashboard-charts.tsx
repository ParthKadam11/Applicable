"use client";

import dynamic from "next/dynamic";
import type { DailyStats } from "@/lib/api";

const EligibilityChart = dynamic(
  () =>
    import("@/components/eligibility-chart").then((m) => m.EligibilityChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center font-mono text-sm text-mute">
        -
      </div>
    ),
  },
);

const HistoryChart = dynamic(
  () => import("@/components/history-chart").then((m) => m.HistoryChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center font-mono text-sm text-mute">
        -
      </div>
    ),
  },
);

export function DashboardCharts({
  byEligibility,
  history,
}: {
  byEligibility: Record<string, number> | null | undefined;
  history: DailyStats[] | null;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-line bg-white">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="font-display text-lg text-ink">By eligibility</h2>
        </div>
        <div className="p-4 sm:p-5">
          <EligibilityChart byEligibility={byEligibility} />
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-white">
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <h2 className="font-display text-lg text-ink">Trend</h2>
        </div>
        <div className="p-4 sm:p-5">
          <HistoryChart history={history} />
        </div>
      </section>
    </div>
  );
}
