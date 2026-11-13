import { Suspense } from "react";
import { DashboardJobs } from "@/components/dashboard-jobs";
import { listJobs, parseJobsListSearchParams } from "@/lib/jobs-api";

export const dynamic = "force-dynamic";

type Sp = Record<string, string | string[] | undefined>;

function toURLSearchParams(sp: Sp): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v) out.set(k, v);
    else if (Array.isArray(v) && v[0]) out.set(k, v[0]);
  }
  return out;
}

export default async function DashboardJobsPage({
  searchParams,
}: {
  searchParams: Promise<Sp>;
}) {
  const parsed = parseJobsListSearchParams(
    toURLSearchParams(await searchParams),
  );
  let initial = null;
  try {
    initial = await listJobs(
      parsed.ok
        ? parsed.data
        : {
            labels: ["open", "india_remote"],
            posted: "all",
            sort: "newest",
            limit: 30,
          },
    );
  } catch {
    initial = null;
  }

  return (
    <Suspense
      fallback={
        <p className="text-sm text-mute">Loading jobs…</p>
      }
    >
      <DashboardJobs initial={initial} />
    </Suspense>
  );
}
