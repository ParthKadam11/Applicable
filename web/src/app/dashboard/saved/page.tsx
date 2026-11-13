import { Suspense } from "react";
import { DashboardSaved } from "@/components/dashboard-saved";

export const dynamic = "force-dynamic";

export default function DashboardSavedPage() {
  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading saved…</p>}>
      <DashboardSaved />
    </Suspense>
  );
}
