import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardSaved } from "@/components/dashboard-saved";
import { authHref } from "@/lib/nav";

export const dynamic = "force-dynamic";

export default async function DashboardSavedPage() {
  const session = await auth();
  if (!session?.user) {
    redirect(authHref("/dashboard/saved"));
  }

  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading saved…</p>}>
      <DashboardSaved />
    </Suspense>
  );
}
