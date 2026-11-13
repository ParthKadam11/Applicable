import { notFound } from "next/navigation";
import { IntegrationConnectClient } from "@/components/integration-connect-client";
import { CONNECTORS } from "@/lib/mcp-connectors";

type Props = { params: Promise<{ client: string }> };

export default async function DashboardIntegrationClientPage({ params }: Props) {
  const { client } = await params;
  const connector = CONNECTORS.find((c) => c.id === client);
  if (!connector) notFound();

  return <IntegrationConnectClient connector={connector} />;
}
