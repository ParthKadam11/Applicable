import Link from "next/link";
import { AgentLogo } from "@/components/agent-logo";
import { PersonalMcpCard } from "@/components/personal-mcp-card";
import { MCP_URL } from "@/lib/constants";
import { CONNECTORS } from "@/lib/mcp-connectors";

export default function DashboardIntegrationsPage() {
  const clients = CONNECTORS.filter((c) => c.id !== "mcp");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
          Integrations
        </h1>
        <p className="mt-1.5 max-w-xl text-pretty text-[14px] text-mute sm:text-[15px]">
          Personal MCP token plus client installs. On phones we copy the
          endpoint and guide you.
        </p>
      </div>

      <div id="personal-mcp" className="scroll-mt-20">
        <PersonalMcpCard />
      </div>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="font-display text-lg text-ink">Public endpoint</h2>
        <code className="mt-2 block break-all rounded-xl bg-soft px-3 py-3 text-[13px] text-ink">
          {MCP_URL}
        </code>
      </section>

      <ul className="grid gap-2 sm:grid-cols-2">
        {clients.map((c) => (
          <li key={c.id}>
            <Link
              href={`/dashboard/integrations/${c.id}`}
              className="flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 transition hover:border-mark hover:bg-mark-soft/40"
            >
              <span className="overflow-hidden rounded-lg ring-1 ring-black/5">
                <AgentLogo id={c.id} label={c.label} size="sm" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">
                  {c.label}
                </span>
                <span className="block truncate text-[12px] text-mute">
                  {c.tag}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
