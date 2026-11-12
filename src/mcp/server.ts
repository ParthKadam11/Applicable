import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../db/client.js";
import { logToolCall } from "./logging.js";
import {
  GetJobInputSchema,
  ListCompaniesInputSchema,
  SearchJobsInputSchema,
  StatsInputObjectSchema,
  StatsInputSchema,
  SubmitCompanyInputSchema,
} from "./schemas.js";
import {
  getJob,
  getMcpStats,
  listCompanies,
  searchJobs,
  submitCompany,
} from "./tools.js";

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errResult(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

async function timed<T>(
  tool: string,
  fn: () => Promise<T>,
  countOf: (v: T) => number | null,
): Promise<T> {
  const started = Date.now();
  try {
    const value = await fn();
    logToolCall({
      tool,
      latencyMs: Date.now() - started,
      resultCount: countOf(value),
      ok: true,
    });
    return value;
  } catch (err) {
    logToolCall({
      tool,
      latencyMs: Date.now() - started,
      resultCount: null,
      ok: false,
    });
    throw err;
  }
}

/** Create a fresh MCP server instance with read-only CaniApply tools. */
export function createCaniApplyMcpServer(db: Db): McpServer {
  const server = new McpServer({
    name: "caniapply",
    version: "0.1.0",
  });

  server.registerTool(
    "search_jobs",
    {
      title: "Search India-eligible jobs",
      description:
        "Search currently-open tech jobs with India eligibility filters. Defaults to open + india_remote. Returns compact rows with evidence quotes and apply URLs. Use for browsing / matching roles.",
      inputSchema: SearchJobsInputSchema.shape,
    },
    async (args) => {
      try {
        const parsed = SearchJobsInputSchema.parse(args);
        const result = await timed(
          "search_jobs",
          () => searchJobs(db, parsed),
          (r) => r.count,
        );
        return jsonResult(result);
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "get_job",
    {
      title: "Get job details",
      description:
        "Fetch full details for one job by UUID: eligibility evidence, classification source (rules/llm), compensation, and a description excerpt. Never invents missing fields.",
      inputSchema: GetJobInputSchema.shape,
    },
    async (args) => {
      try {
        const parsed = GetJobInputSchema.parse(args);
        const result = await timed(
          "get_job",
          () => getJob(db, parsed),
          (r) => (r.found ? 1 : 0),
        );
        return jsonResult(result);
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "list_companies",
    {
      title: "List companies",
      description:
        "List active companies with ATS slug, open job count, and India-eligible job count. Optional name/ATS filters.",
      inputSchema: ListCompaniesInputSchema.shape,
    },
    async (args) => {
      try {
        const parsed = ListCompaniesInputSchema.parse(args);
        const result = await timed(
          "list_companies",
          () => listCompanies(db, parsed),
          (r) => r.count,
        );
        return jsonResult(result);
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "stats",
    {
      title: "Corpus stats",
      description:
        "Live DB totals: active companies, tech open jobs by India eligibility, and last successful ingestion timestamp. Optional history (days) returns daily_stats rows for the landing dashboard.",
      inputSchema: StatsInputObjectSchema.shape,
    },
    async (args) => {
      try {
        const parsed = StatsInputSchema.parse(args ?? {});
        const result = await timed(
          "stats",
          () => getMcpStats(db, parsed),
          () => 1,
        );
        return jsonResult(result);
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "submit_company",
    {
      title: "Submit a company",
      description:
        "Queue a company (name + careers URL) into the discovery candidates table for later review. Dedupes by name. Does NOT auto-promote or ingest.",
      inputSchema: SubmitCompanyInputSchema.shape,
    },
    async (args) => {
      try {
        const parsed = SubmitCompanyInputSchema.parse(args);
        const result = await timed(
          "submit_company",
          () => submitCompany(db, parsed),
          () => 1,
        );
        return jsonResult(result);
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  return server;
}
