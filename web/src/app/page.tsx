import { ExampleJob } from "@/components/example-job";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { McpSetup } from "@/components/mcp-setup";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { fetchExampleJob } from "@/lib/api";

export const revalidate = 300;

export default async function HomePage() {
  const example = await fetchExampleJob();

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader active="home" />
      <Hero />
      <McpSetup />
      <HowItWorks />
      <ExampleJob job={example} />
      <SiteFooter />
    </div>
  );
}
