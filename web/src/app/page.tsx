import { AgentsStrip } from "@/components/agents-strip";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { LiveCorpus } from "@/components/live-corpus";
import { McpSetup } from "@/components/mcp-setup";
import { fetchLandingFeedJobs, fetchLandingStats } from "@/lib/api";

export const revalidate = 60;

export default async function HomePage() {
  const [stats, jobs] = await Promise.all([
    fetchLandingStats(),
    fetchLandingFeedJobs(),
  ]);

  return (
    <div className="min-h-dvh bg-paper">
      <Hero />
      <AgentsStrip />
      <LiveCorpus stats={stats} jobs={jobs} />
      <HowItWorks />
      <McpSetup />
    </div>
  );
}
