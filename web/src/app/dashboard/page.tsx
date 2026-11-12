import { DashboardCharts } from "@/components/dashboard-charts";
import { JobsTable } from "@/components/jobs-table";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StatsStrip } from "@/components/stats-strip";
import { TopCompanies } from "@/components/top-companies";
import {
  fetchJobs,
  fetchStats,
  fetchStatsHistory,
  fetchTopCompanies,
} from "@/lib/api";

export const revalidate = 300;

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-[#0c0c0e]/70 p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-base font-medium text-zinc-50">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  const [stats, history, jobs, top] = await Promise.all([
    fetchStats(),
    fetchStatsHistory(30),
    fetchJobs({ eligibility: "open,india_remote", limit: 25 }),
    fetchTopCompanies(15),
  ]);

  return (
    <div className="min-h-screen">
      <div className="atmosphere">
        <SiteHeader active="dashboard" />
        <div className="mx-auto max-w-6xl px-5 pb-8 pt-12 sm:px-8 sm:pt-16">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-400/80">
            Dashboard
          </p>
          <h1 className="mt-3 font-display text-4xl tracking-tight text-zinc-50 sm:text-5xl">
            Live corpus
          </h1>
          <p className="mt-3 max-w-xl text-base text-zinc-400">
            Eligibility mix, history, searchable India-eligible roles, and the
            companies hiring from India right now.
          </p>
        </div>
      </div>

      <StatsStrip stats={stats} compact />

      <div className="mx-auto max-w-6xl space-y-6 px-5 py-10 sm:px-8 sm:py-14">
        <DashboardCharts
          byEligibility={stats?.by_eligibility}
          history={history}
        />

        <Panel
          title="Top companies hiring from India"
          subtitle="Ranked by open + india_remote tech roles"
        >
          <TopCompanies companies={top} />
        </Panel>

        <Panel
          title="India-eligible jobs"
          subtitle="Search open + india_remote · 25 per page"
        >
          <JobsTable initial={jobs} />
        </Panel>
      </div>

      <SiteFooter />
    </div>
  );
}
