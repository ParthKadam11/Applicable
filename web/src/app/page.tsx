import { AgentsStrip } from "@/components/agents-strip";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { McpSetup } from "@/components/mcp-setup";

export const revalidate = 300;

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-paper">
      <Hero />
      <AgentsStrip />
      <HowItWorks />
      <McpSetup />
    </div>
  );
}
