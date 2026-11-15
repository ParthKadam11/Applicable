import { afterAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { sql } from "drizzle-orm";
import { createMcpHttpApp } from "../../src/mcp/app.js";
import { db } from "../../src/db/client.js";

async function dbUp(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

function extractJsonRpc(body: string): { result?: unknown; error?: unknown } {
  if (body.includes("data:")) {
    const lines = body
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.replace(/^data:\s?/, ""));
    const last = lines[lines.length - 1];
    if (!last) throw new Error(`No SSE data: ${body.slice(0, 200)}`);
    return JSON.parse(last) as { result?: unknown; error?: unknown };
  }
  return JSON.parse(body) as { result?: unknown; error?: unknown };
}

async function mcpJsonRpc(
  base: string,
  method: string,
  params?: Record<string, unknown>,
  id = 1,
) {
  const res = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: params ?? {},
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return extractJsonRpc(text);
}

describe("MCP HTTP end-to-end", () => {
  let server: Server | null = null;

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.close(() => resolve());
    });
  });

  it(
    "initialize, tools/list, stats, search_jobs over HTTP",
    async () => {
    if (!(await dbUp())) return;

    const app = createMcpHttpApp();
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    const base = `http://127.0.0.1:${addr.port}`;

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(((await health.json()) as { ok: boolean }).ok).toBe(true);

    const init = await mcpJsonRpc(base, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "vitest", version: "0" },
    });
    expect(init.error).toBeUndefined();
    expect(init.result).toBeTruthy();

    const tools = await mcpJsonRpc(base, "tools/list", {}, 2);
    expect(tools.error).toBeUndefined();
    const toolNames = (
      (tools.result as { tools: Array<{ name: string }> }).tools ?? []
    ).map((t) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        "search_jobs",
        "ask_jobs",
        "get_job",
        "list_companies",
        "stats",
        "submit_company",
      ]),
    );

    const stats = await mcpJsonRpc(
      base,
      "tools/call",
      { name: "stats", arguments: {} },
      3,
    );
    expect(stats.error).toBeUndefined();
    const statsText = (
      stats.result as { content: Array<{ text: string }> }
    ).content[0]!.text;
    const statsJson = JSON.parse(statsText) as {
      companies_active: number;
      tech_open_jobs: number;
      by_eligibility: Record<string, number>;
      graph: {
        enabled: boolean;
        nodes: number;
        edges: number;
        lastSyncAt: string | null;
        lastRun: { added: number; removed: number; relabels: number } | null;
      };
    };
    expect(statsJson.graph).toEqual(
      expect.objectContaining({
        enabled: expect.any(Boolean),
        nodes: expect.any(Number),
        edges: expect.any(Number),
      }),
    );
    expect(typeof statsJson.companies_active).toBe("number");
    expect(typeof statsJson.tech_open_jobs).toBe("number");
    expect(statsJson.by_eligibility).toBeTypeOf("object");

    const search = await mcpJsonRpc(
      base,
      "tools/call",
      {
        name: "search_jobs",
        arguments: { eligibility: ["open", "india_remote"], limit: 3 },
      },
      4,
    );
    expect(search.error).toBeUndefined();
    const searchText = (
      search.result as { content: Array<{ text: string }> }
    ).content[0]!.text;
    const searchJson = JSON.parse(searchText) as {
      results: unknown[];
      count: number;
    };
    expect(Array.isArray(searchJson.results)).toBe(true);
    expect(searchJson.count).toBe(searchJson.results.length);

    const apiStats = await fetch(`${base}/api/stats`);
    expect(apiStats.status).toBe(200);
    expect(apiStats.headers.get("cache-control")).toMatch(/max-age=300/);
    const apiBody = (await apiStats.json()) as { companies_active: number };
    expect(typeof apiBody.companies_active).toBe("number");
  },
    30_000,
  );
});
