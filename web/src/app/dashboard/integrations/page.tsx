import Link from "next/link";
import { AgentLogo } from "@/components/agent-logo";
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
          Pick a client. On phones we copy the endpoint and guide you — apps
          that open and do nothing are skipped.
        </p>
      </div>

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
