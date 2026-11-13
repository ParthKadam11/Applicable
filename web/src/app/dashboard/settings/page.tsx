import { Suspense } from "react";
import { DashboardSettings } from "@/components/dashboard-settings";

export const dynamic = "force-dynamic";

export default function DashboardSettingsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading settings…</p>}>
      <DashboardSettings />
    </Suspense>
  );
}
