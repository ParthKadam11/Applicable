import { Suspense } from "react";
import { DashboardJobs } from "@/components/dashboard-jobs";
import { ALL_LABELS, listJobs, parseJobsListSearchParams } from "@/lib/jobs-api";
import { DEFAULT_PREFERENCES } from "@/lib/preferences";

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
  const rawSp = toURLSearchParams(await searchParams);
  // No filter UI — always list the full open tech corpus (+ optional q).
  const forParse = new URLSearchParams();
  const q = rawSp.get("q");
  const job = rawSp.get("job");
  if (q) forParse.set("q", q);
  if (job) forParse.set("job", job);
  forParse.set("labels", ALL_LABELS.join(","));
  forParse.set("sort", "newest");
  forParse.set("limit", "40");

  const parsed = parseJobsListSearchParams(forParse, {
    ...DEFAULT_PREFERENCES,
    defaultLabels: [...ALL_LABELS],
    defaultRoles: [],
    hideNoSalary: false,
  });
  let initial = null;
  try {
    initial = await listJobs(
      parsed.ok
        ? parsed.data
        : {
            labels: [...ALL_LABELS],
            posted: "all",
            sort: "newest",
            limit: 40,
            ...(q ? { q } : {}),
          },
    );
  } catch {
    initial = null;
  }

  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading jobs…</p>}>
      <DashboardJobs initial={initial} />
    </Suspense>
  );
}
