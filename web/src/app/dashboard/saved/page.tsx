import { MePanel } from "@/components/me-panel";

export default function DashboardSavedPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
          Saved
        </h1>
        <p className="mt-1.5 max-w-xl text-pretty text-[14px] text-mute sm:text-[15px]">
          Roles you bookmarked, plus your personal MCP token.
        </p>
      </div>
      <MePanel />
    </div>
  );
}
