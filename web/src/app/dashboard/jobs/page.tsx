import { JobsTable } from "@/components/jobs-table";
import { fetchJobs } from "@/lib/api";

export const revalidate = 60;

export default async function DashboardJobsPage() {
  const jobs = await fetchJobs({
    eligibility: "open,india_remote",
    limit: 25,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
          Jobs
        </h1>
        <p className="mt-1.5 max-w-xl text-pretty text-[14px] text-mute sm:text-[15px]">
          Browse India-eligible remote roles with proof from each posting.
        </p>
      </div>
      <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
        <JobsTable initial={jobs} />
      </section>
    </div>
  );
}
