import { Hero } from "@/components/hero";
import { McpSetup } from "@/components/mcp-setup";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const revalidate = 300;

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader active="home" />
      <Hero />
      <McpSetup />
      <SiteFooter />
    </div>
  );
}
