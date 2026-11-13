import { ByokKeysPanel } from "@/components/byok-keys-panel";
import { ByokPanel } from "@/components/byok-panel";
import { JobsTable } from "@/components/jobs-table";
import { fetchJobs, fetchLlmStatus } from "@/lib/api";

export const revalidate = 60;

export default async function DashboardSearchPage() {
  const [jobs, llm] = await Promise.all([
    fetchJobs({ eligibility: "open,india_remote", limit: 25 }),
    fetchLlmStatus(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
          AI Search
        </h1>
        <p className="mt-1.5 max-w-xl text-pretty text-[14px] text-mute sm:text-[15px]">
          Natural-language search with your own keys, plus classifier BYOK
          status.
        </p>
      </div>

      <ByokKeysPanel defaultOpen />
      <ByokPanel status={llm} />

      <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
        <JobsTable initial={jobs} />
      </section>
    </div>
  );
}
