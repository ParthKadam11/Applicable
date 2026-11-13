import Link from "next/link";
import { MCP_URL } from "@/lib/constants";

export default function DashboardMcpPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
          MCP
        </h1>
        <p className="mt-1.5 max-w-xl text-pretty text-[14px] text-mute sm:text-[15px]">
          Point any MCP client at Applicable for live India-eligibility search.
        </p>
      </div>

      <section className="rounded-2xl border border-line bg-white p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-mute">
          Endpoint
        </p>
        <code className="mt-2 block break-all rounded-xl bg-soft px-3 py-3 text-[13px] text-ink">
          {MCP_URL}
        </code>
        <p className="mt-4 text-[14px] text-mute">
          Full install flows for Claude, Cursor, Instinct, and more live on the
          home page.
        </p>
        <Link
          href="/#mcp"
          className="btn-ink mt-5 inline-flex w-full sm:w-auto"
        >
          Open integrations
        </Link>
      </section>
    </div>
  );
}
