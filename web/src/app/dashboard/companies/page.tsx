import { Suspense } from "react";
import { DashboardCompanies } from "@/components/dashboard-companies";
import {
  listCompanies,
  parseCompaniesListSearchParams,
} from "@/lib/companies-api";

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

export default async function DashboardCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Sp>;
}) {
  const raw = toURLSearchParams(await searchParams);
  if (!raw.has("has_open")) raw.set("has_open", "true");
  if (!raw.has("sort")) raw.set("sort", "most_open");

  const parsed = parseCompaniesListSearchParams(raw);
  let initial = null;
  try {
    initial = await listCompanies(
      parsed.ok
        ? parsed.data
        : {
            has_open: true,
            sort: "most_open",
            limit: 30,
          },
    );
  } catch {
    initial = null;
  }

  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading companies…</p>}>
      <DashboardCompanies initial={initial} />
    </Suspense>
  );
}
