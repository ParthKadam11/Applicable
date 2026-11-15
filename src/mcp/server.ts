import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Db } from "../db/client.js";
import {
  listSavedJobs,
  saveJob,
  unsaveJob,
} from "../auth/saved-jobs.js";
import { SIGN_IN_TO_SAVE } from "./auth-context.js";
import { logToolCall } from "./logging.js";
import { z } from "zod";
import { askJobs } from "../graph/ask.js";
import { explore } from "../graph/explore.js";
import { skillGap } from "../graph/skill-gap.js";
import {
  AskJobsInputSchema,
  EligibilityFilterSchema,
  ExploreInputSchema,
  FindCompaniesInputSchema,
  GetCompanyInputSchema,
  GetJobInputSchema,
  ListCompaniesInputSchema,
  MySavedJobsInputSchema,
  ReportLabelInputSchema,
  SaveJobInputSchema,
  SearchJobsInputSchema,
  SkillGapInputSchema,
  StatsInputObjectSchema,
  StatsInputSchema,
  SubmitCompanyInputSchema,
  UnsaveJobInputSchema,
} from "./schemas.js";
import {
  findCompanies,
  getCompany,
  getJob,
  getMcpStats,
  listCompanies,
  reportLabel,
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

export type McpServerOptions = {
  userId?: string | null;
};

/** Create a fresh MCP server instance. Public tools always; save tools need token. */
export function createApplicableMcpServer(
  db: Db,
  opts: McpServerOptions = {},
): McpServer {
  const userId = opts.userId ?? null;
  const server = new McpServer({
    name: "applicable",
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
    "explore",
    {
      title: "Explore graph paths",
      description:
        "Walk allowlisted hops (SIMILAR_TO, POSTS, REQUIRES, USES_SKILL, LABELED, SAVED, INVESTED_IN, FOUNDED, HQ_IN, IN_BATCH; max 3) from skill|company|job|me|investor|person|batch. Returns compact path lines + thin job cards. Rehydrated from Postgres. start.type=me and SAVED require a personal MCP token.",
      inputSchema: ExploreInputSchema.shape,
    },
    async (args) => {
      try {
        const parsed = ExploreInputSchema.parse(args);
        const result = await timed(
          "explore",
          () => explore(db, parsed, { userId }),
          (r) => r.lines.length,
        );
        if (result.source === "error" && result.error) {
          return errResult(result.error);
        }
        return jsonResult(result);
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "skill_gap",
    {
      title: "Skill gap (India-OK unlocks)",
      description:
        "Top skills that unlock the most India-eligible jobs you are one skill short of. Pass my_skills[], or me:true (personal token) to derive skills from saved jobs.",
      inputSchema: SkillGapInputSchema.shape,
    },
    async (args) => {
      try {
        const parsed = SkillGapInputSchema.parse(args);
        const result = await timed(
          "skill_gap",
          () => skillGap(db, parsed, { userId }),
          (r) => r.gaps.length,
        );
        if (result.source === "error" && result.error) {
          return errResult(result.error);
        }
        return jsonResult(result);
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "ask_jobs",
    {
      title: "Ask jobs (graph, legacy alias)",
      description:
        "Legacy alias for explore: match_skills, similar_companies, company_jobs_by_skill. Prefer the explore tool for path-style context. Falls back to keyword search if the graph is disabled/down.",
      inputSchema: {
        op: z.enum([
          "match_skills",
          "similar_companies",
          "company_jobs_by_skill",
        ]),
        skills: z.array(z.string().min(1).max(64)).min(1).max(20).optional(),
        skill: z.string().min(1).max(64).optional(),
        company_slug: z.string().min(1).max(200).optional(),
        labels: z.array(EligibilityFilterSchema).min(1).optional(),
        max_results: z.number().int().min(1).max(25).optional(),
      },
    },
    async (args) => {
      try {
        const parsed = AskJobsInputSchema.parse(args);
        const result = await timed(
          "ask_jobs",
          () => askJobs(db, parsed),
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
    "get_company",
    {
      title: "Get company enrichment",
      description:
        "Company profile with founders, investors, HQ, founded year, team size, YC batch, and sourced facts (source_url + quote). Lookup by slug, name, or id.",
      inputSchema: GetCompanyInputSchema.shape,
    },
    async (args) => {
      try {
        const parsed = GetCompanyInputSchema.parse(args);
        const result = await timed(
          "get_company",
          () => getCompany(db, parsed),
          (r) => (r.found ? 1 : 0),
        );
        return jsonResult(result);
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "find_companies",
    {
      title: "Find companies by enrichment filters",
      description:
        "Filter companies by investor, founder, YC batch, industry/tag, HQ country, team size, or presence of open/india_remote jobs.",
      inputSchema: FindCompaniesInputSchema.shape,
    },
    async (args) => {
      try {
        const parsed = FindCompaniesInputSchema.parse(args);
        const result = await timed(
          "find_companies",
          () => findCompanies(db, parsed),
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

  server.registerTool(
    "report_label",
    {
      title: "Report wrong eligibility label",
      description:
        "Flag a job whose India-eligibility label is wrong. Stores a correction + learned pattern (Postgres + HydraDB). Evidence must be an exact posting substring about location/eligibility. Gold-eval jobs are rejected.",
      inputSchema: ReportLabelInputSchema.shape,
    },
    async (args) => {
      try {
        const parsed = ReportLabelInputSchema.parse(args);
        const result = await timed(
          "report_label",
          () => reportLabel(db, parsed),
          () => 1,
        );
        return jsonResult(result);
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "save_job",
    {
      title: "Save a job",
      description:
        "Save a job to the signed-in user's list. Requires a personal MCP bearer token.",
      inputSchema: SaveJobInputSchema.shape,
    },
    async (args) => {
      try {
        if (!userId) {
          return jsonResult({ ok: false, message: SIGN_IN_TO_SAVE });
        }
        const parsed = SaveJobInputSchema.parse(args);
        const result = await timed(
          "save_job",
          () => saveJob(db, userId, parsed.job_id),
          () => 1,
        );
        return jsonResult({ ok: true, ...result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "job_not_found") {
          return errResult("Job not found");
        }
        return errResult(msg);
      }
    },
  );

  server.registerTool(
    "unsave_job",
    {
      title: "Unsave a job",
      description:
        "Remove a job from the signed-in user's saved list. Requires a personal MCP bearer token.",
      inputSchema: UnsaveJobInputSchema.shape,
    },
    async (args) => {
      try {
        if (!userId) {
          return jsonResult({ ok: false, message: SIGN_IN_TO_SAVE });
        }
        const parsed = UnsaveJobInputSchema.parse(args);
        const result = await timed(
          "unsave_job",
          () => unsaveJob(db, userId, parsed.job_id),
          () => 1,
        );
        return jsonResult({ ok: true, ...result });
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    "my_saved_jobs",
    {
      title: "List my saved jobs",
      description:
        "List jobs saved by the signed-in user. Requires a personal MCP bearer token.",
      inputSchema: MySavedJobsInputSchema.shape,
    },
    async (args) => {
      try {
        if (!userId) {
          return jsonResult({ ok: false, message: SIGN_IN_TO_SAVE });
        }
        const parsed = MySavedJobsInputSchema.parse(args ?? {});
        const all = await timed(
          "my_saved_jobs",
          () => listSavedJobs(db, userId),
          (r) => r.length,
        );
        const results = all.slice(0, parsed.limit);
        return jsonResult({ results, count: results.length });
      } catch (err) {
        return errResult(err instanceof Error ? err.message : String(err));
      }
    },
  );

  return server;
}
