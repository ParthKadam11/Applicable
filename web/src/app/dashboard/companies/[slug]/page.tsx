import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DashboardCompany } from "@/components/dashboard-company";
import { getCompanyBySlug } from "@/lib/companies-api";
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

export default async function DashboardCompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Sp>;
}) {
  const { slug } = await params;
  const company = await getCompanyBySlug(slug).catch(() => null);
  if (!company) notFound();

  const raw = toURLSearchParams(await searchParams);
  raw.set("company", slug);
  if (!raw.has("labels")) raw.set("labels", "open,india_remote");

  const parsed = parseJobsListSearchParams(raw);
  let jobsInitial = null;
  try {
    jobsInitial = await listJobs(
      parsed.ok
        ? parsed.data
        : {
            labels: ["open", "india_remote"],
            company: slug,
            posted: "all",
            sort: "newest",
            limit: 30,
          },
    );
  } catch {
    jobsInitial = null;
  }

  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading company…</p>}>
      <DashboardCompany company={company} jobsInitial={jobsInitial} />
    </Suspense>
  );
}
