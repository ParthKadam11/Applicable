import { AgentsStrip } from "@/components/agents-strip";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { McpSetup } from "@/components/mcp-setup";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const revalidate = 300;

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader active="home" />
      <Hero />
      <AgentsStrip />
      <HowItWorks />
      <McpSetup />
      <SiteFooter />
    </div>
  );
}
