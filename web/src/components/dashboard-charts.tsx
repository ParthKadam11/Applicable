"use client";

import dynamic from "next/dynamic";
import type { DailyStats } from "@/lib/api";

const EligibilityChart = dynamic(
  () =>
    import("@/components/eligibility-chart").then((m) => m.EligibilityChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        —
      </div>
    ),
  },
);

const HistoryChart = dynamic(
  () => import("@/components/history-chart").then((m) => m.HistoryChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center text-sm text-zinc-500">
        —
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
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-white/[0.08] bg-[#0c0c0e]/70 p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-medium text-zinc-50">By eligibility</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Tech open jobs across labels
          </p>
        </div>
        <EligibilityChart byEligibility={byEligibility} />
      </section>
      <section className="rounded-xl border border-white/[0.08] bg-[#0c0c0e]/70 p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-medium text-zinc-50">Trend</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Open + India remote vs tech jobs (backfill days skipped)
          </p>
        </div>
        <HistoryChart history={history} />
      </section>
    </div>
  );
}
