import { Suspense } from "react";
import { DashboardSearch } from "@/components/dashboard-search";

export const dynamic = "force-dynamic";

export default function DashboardSearchPage() {
  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading search…</p>}>
      <DashboardSearch />
    </Suspense>
  );
}
