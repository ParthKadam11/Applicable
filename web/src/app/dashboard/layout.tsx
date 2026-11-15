import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { OnboardingHost } from "@/components/onboarding-modal";
import { authHref } from "@/lib/nav";

/** App shell — signed-in only. */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect(authHref("/dashboard/jobs"));
  }

  return (
    <div className="min-h-dvh bg-paper">
      <DashboardSidebar />
      <div className="min-h-dvh lg:pl-[16rem]">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
      <OnboardingHost />
    </div>
  );
}
