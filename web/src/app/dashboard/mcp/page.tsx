import { redirect } from "next/navigation";

/** Personal MCP merged into Integrations. */
export default function DashboardMcpPage() {
  redirect("/dashboard/integrations#personal-mcp");
}
