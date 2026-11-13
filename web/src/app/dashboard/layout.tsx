import { DashboardSidebar } from "@/components/dashboard-sidebar";

/** Pure app shell — no marketing header/footer. */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-paper">
      <DashboardSidebar />
      <div className="min-h-dvh pt-14 lg:pl-[16rem] lg:pt-0">
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
