import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const providerName = z.enum(["ollama", "groq", "gemini", "openrouter"]);

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://jobfit:jobfit@127.0.0.1:5435/jobfit"),
  USER_AGENT: z
    .string()
    .min(1)
    .default(
      "CaniApply/0.1 (+https://github.com/ParthKadam11/CaniApply; job-board research bot)",
    ),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  PER_HOST_DELAY_MS: z.coerce.number().int().nonnegative().default(500),
  INGEST_CRON: z.string().min(1).default("0 */6 * * *"),
  INGEST_CONCURRENCY: z.coerce.number().int().positive().default(5),
  INGEST_COMPANY_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  // Free-tier LLM providers (comma-separated rotation order)
  LLM_PROVIDERS: z.string().default("groq,gemini,openrouter"),

  OLLAMA_URL: z.string().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().min(1).default("qwen2.5:3b"),

  GROQ_API_KEY: z.string().optional().default(""),
  GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),

  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.8-flash"),

  OPENROUTER_API_KEY: z.string().optional().default(""),
  OPENROUTER_MODEL: z
    .string()
    .min(1)
    .default("google/gemma-3-4b-it:free"),

  CLASSIFY_CONCURRENCY: z.coerce.number().int().positive().default(4),
  LLM_RPM: z.coerce.number().int().positive().default(30),
  LLM_STATE_PATH: z.string().default(".llm-state.json"),

  /** Nightly unclear→LLM cron (pg-boss). Default 02:30 Asia/Kolkata. */
  CLASSIFY_UNCLEAR_CRON: z.string().min(1).default("30 2 * * *"),
  CLASSIFY_UNCLEAR_TZ: z.string().min(1).default("Asia/Kolkata"),
  CLASSIFY_UNCLEAR_BATCH: z.coerce.number().int().positive().default(500),

  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3100),
  MCP_RATE_LIMIT_RPM: z.coerce.number().int().positive().default(60),
  MCP_PUBLIC_URL: z
    .string()
    .optional()
    .default("https://mcp.example.com/mcp"),
  /** Public hostname for Caddy (prod). */
  MCP_HOST: z.string().optional().default("mcp.example.com"),

  // Company discovery
  DISCOVER_CRON: z.string().min(1).default("0 6 * * 1"),
  DISCOVER_PROMOTE_LIMIT: z.coerce.number().int().positive().default(300),
  DISCOVER_PROMOTE_CONCURRENCY: z.coerce.number().int().positive().default(5),
  /** Common Crawl slug cap on the weekly discover cron. */
  DISCOVER_CC_LIMIT: z.coerce.number().int().positive().default(5000),
  YC_ALGOLIA_API_KEY: z.string().optional().default(""),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = envSchema.parse(process.env);

export function parseLlmProviders(
  raw: string = config.LLM_PROVIDERS,
): Array<z.infer<typeof providerName>> {
  const names = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const out: Array<z.infer<typeof providerName>> = [];
  for (const n of names) {
    const parsed = providerName.safeParse(n);
    if (parsed.success && !out.includes(parsed.data)) out.push(parsed.data);
  }
  return out.length > 0 ? out : ["groq", "gemini", "openrouter"];
}
