import Link from "next/link";
import { ExampleJob } from "@/components/example-job";
import { HowItWorks } from "@/components/how-it-works";
import { McpSetup } from "@/components/mcp-setup";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StatsStrip } from "@/components/stats-strip";
import { fetchExampleJob, fetchStats } from "@/lib/api";

export const revalidate = 300;

export default async function HomePage() {
  const [stats, example] = await Promise.all([
    fetchStats(),
    fetchExampleJob(),
  ]);

  return (
    <div className="min-h-screen">
      <div className="atmosphere">
        <SiteHeader active="home" />

        <main>
          <section className="relative mx-auto max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
            <p className="animate-rise text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-400/80">
              Live job boards · India eligibility
            </p>
            <h1 className="animate-rise animate-rise-delay-1 mt-4 max-w-3xl font-display text-[2.6rem] leading-[1.05] tracking-tight text-zinc-50 sm:text-6xl md:text-[4rem]">
              Can I apply from India?
            </h1>
            <p className="animate-rise animate-rise-delay-2 mt-5 max-w-xl text-lg leading-relaxed text-zinc-400 sm:text-xl">
              Every live remote tech job, checked for whether you can actually
              apply from India — with the line from the posting that proves it.
            </p>
            <div className="animate-rise animate-rise-delay-3 mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#mcp"
                className="inline-flex items-center rounded-lg bg-emerald-400 px-5 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-emerald-300"
              >
                Connect MCP
              </a>
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-medium text-zinc-300 ring-1 ring-white/10 transition hover:bg-white/[0.04] hover:text-white"
              >
                Open dashboard
              </Link>
            </div>
          </section>
        </main>
      </div>

      <StatsStrip stats={stats} />
      <McpSetup />
      <HowItWorks />
      <ExampleJob job={example} />
      <SiteFooter />
    </div>
  );
}
