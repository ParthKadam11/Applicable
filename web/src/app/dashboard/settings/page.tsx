import { ByokKeysPanel } from "@/components/byok-keys-panel";
import { ByokPanel } from "@/components/byok-panel";
import { fetchLlmStatus } from "@/lib/api";

export const revalidate = 60;

export default async function DashboardSettingsPage() {
  const llm = await fetchLlmStatus();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl tracking-tight text-ink sm:text-3xl">
          Settings
        </h1>
        <p className="mt-1.5 max-w-xl text-pretty text-[14px] text-mute sm:text-[15px]">
          AI search key (browser-only) and classifier BYOK status.
        </p>
      </div>

      <ByokKeysPanel title="Change/remove key" />
      <ByokPanel status={llm} />
    </div>
  );
}
