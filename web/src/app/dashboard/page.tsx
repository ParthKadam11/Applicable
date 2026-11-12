import { ByokPanel } from "@/components/byok-panel";
import { DashboardCharts } from "@/components/dashboard-charts";
import { JobsTable } from "@/components/jobs-table";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
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
    <div className="min-h-dvh bg-paper">
      <div className="sky">
        <SiteHeader active="dashboard" />
        <div className="mx-auto max-w-5xl px-5 pb-6 pt-10 sm:px-8 sm:pt-12">
          <p className="font-mono text-[11px] uppercase text-mark-deep">
            Dashboard
          </p>
          <h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">
            Live corpus
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-[15px] text-mute">
            India-eligibility mix, companies, jobs, and BYOK classifier status.
          </p>
        </div>
      </div>

      <StatsStrip stats={stats} compact />

      <div className="mx-auto max-w-5xl space-y-5 px-5 py-10 sm:px-8">
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

      <SiteFooter />
    </div>
  );
}
