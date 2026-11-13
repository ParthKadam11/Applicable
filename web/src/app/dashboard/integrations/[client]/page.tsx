import { DashboardPlaceholder } from "@/components/dashboard-placeholder";

const LABELS: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  grok: "Grokbot",
  instinct: "Instinct",
  chatgpt: "ChatGPT",
  windsurf: "Windsurf",
  cline: "Cline",
};

type Props = { params: Promise<{ client: string }> };

export default async function DashboardIntegrationClientPage({ params }: Props) {
  const { client } = await params;
  const label = LABELS[client] ?? client;

  return (
    <DashboardPlaceholder
      title={label}
      description={`One-click connect flow for ${label}. Placeholder while we wire install.`}
    />
  );
}
