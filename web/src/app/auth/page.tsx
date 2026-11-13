import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthHeroField } from "@/components/auth-hero-field";
import { AuthJobsPanel } from "@/components/auth-jobs-panel";
import { AuthSignIn } from "@/components/auth-sign-in";
import { fetchJobs } from "@/lib/api";
import { filterEntryLevelJobs } from "@/lib/entry-level";

export const dynamic = "force-dynamic";

/** Split auth: interactive hero + entry-level Browse Jobs · Google sign-in. */
export default async function AuthPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard/jobs");

  const page = await fetchJobs({
    eligibility: "open,india_remote",
    limit: 50,
  });
  const initialJobs = filterEntryLevelJobs(page?.results ?? []);

  return (
    <div className="min-h-dvh bg-paper lg:h-dvh lg:overflow-hidden">
      <div className="grid min-h-dvh lg:h-full lg:grid-cols-2">
        <section className="relative order-2 min-h-[58vh] overflow-hidden border-t border-line lg:order-1 lg:min-h-0 lg:border-t-0 lg:border-r lg:border-line/80">
          <AuthHeroField />
          <div className="relative z-[1] h-full">
            <AuthJobsPanel
              initialJobs={initialJobs}
              initialCursor={page?.next_cursor ?? null}
            />
          </div>
        </section>

        <section className="order-1 bg-white lg:order-2">
          <AuthSignIn />
        </section>
      </div>
    </div>
  );
}
