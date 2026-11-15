import { MePanel } from "@/components/me-panel";
import { SiteHeader } from "@/components/site-header";

export default function MePage() {
  return (
    <div className="min-h-dvh bg-paper">
      <div className="sky">
        <SiteHeader active="me" />
        <div className="mx-auto max-w-5xl px-5 pb-6 pt-10 sm:px-8 sm:pt-12">
          <p className="font-mono text-[11px] uppercase text-mark-deep">You</p>
          <h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">
            Account
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-[15px] text-mute">
            Saved jobs, personal MCP token, and account controls.
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        <MePanel />
      </div>
    </div>
  );
}
