import { Suspense } from "react";
import { auth } from "@/auth";
import { DashboardJobs } from "@/components/dashboard-jobs";
import { listJobs, parseJobsListSearchParams } from "@/lib/jobs-api";
import { getPreferences } from "@/lib/me";
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
  let preferences = null;
  try {
    const session = await auth();
    if (session?.user?.id) preferences = await getPreferences(session.user.id);
  } catch {
    preferences = null;
  }

  const parsed = parseJobsListSearchParams(
    toURLSearchParams(await searchParams),
    preferences,
  );
  let initial = null;
  try {
    initial = await listJobs(
      parsed.ok
        ? parsed.data
        : {
            labels: preferences?.defaultLabels ?? ["open", "india_remote"],
            posted: "all",
            sort: "newest",
            limit: 30,
            ...(preferences?.hideNoSalary ? { has_salary: true as const } : {}),
            ...(preferences?.defaultRoles?.length === 1
              ? { role: preferences.defaultRoles[0] }
              : preferences?.defaultRoles && preferences.defaultRoles.length > 1
                ? { roles: preferences.defaultRoles }
                : {}),
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
      <DashboardJobs
        initial={initial}
        initialPreferences={preferences ?? DEFAULT_PREFERENCES}
      />
    </Suspense>
  );
}
