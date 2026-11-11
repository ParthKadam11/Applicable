export function logToolCall(input: {
  tool: string;
  latencyMs: number;
  resultCount: number | null;
  ok: boolean;
  ip?: string;
}): void {
  // Never log secrets, API keys, or full job descriptions.
  console.log(
    JSON.stringify({
      type: "mcp_tool",
      tool: input.tool,
      latency_ms: input.latencyMs,
      result_count: input.resultCount,
      ok: input.ok,
      ip: input.ip ?? null,
      ts: new Date().toISOString(),
    }),
  );
}
