import { ByokPanel } from "@/components/byok-panel";
import { DashboardCharts } from "@/components/dashboard-charts";
import { JobsTable } from "@/components/jobs-table";
import { StatsStrip } from "@/components/stats-strip";
import { TopCompanies } from "@/components/top-companies";
import {
  fetchJobs,
  fetchLlmStatus,
  fetchStats,
  fetchStatsHistory,
  fetchTopCompanies,
} from "@/lib/api";

export const revalidate = 60;

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-white">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h2 className="font-display text-lg text-ink">{title}</h2>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export default async function DashboardPage() {
  const [stats, history, jobs, top, llm] = await Promise.all([
    fetchStats(),
    fetchStatsHistory(30),
    fetchJobs({ eligibility: "open,india_remote", limit: 25 }),
    fetchTopCompanies(15),
    fetchLlmStatus(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
          Overview
        </h1>
        <p className="mt-1.5 max-w-xl text-pretty text-[14px] text-mute sm:text-[15px]">
          India-eligibility mix, companies, jobs, and BYOK classifier status.
        </p>
      </div>

      <StatsStrip stats={stats} compact />
      <ByokPanel status={llm} />
      <DashboardCharts
        byEligibility={stats?.by_eligibility}
        history={history}
      />
      <Panel title="Top companies">
        <TopCompanies companies={top} />
      </Panel>
      <Panel title="India-eligible jobs">
        <JobsTable initial={jobs} />
      </Panel>
    </div>
  );
}
