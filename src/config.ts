import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://jobfit:jobfit@localhost:5432/jobfit"),
  USER_AGENT: z
    .string()
    .min(1)
    .default(
      "JobFit/0.1 (+https://github.com/ParthKadam11/CaniApply; job-board research bot)",
    ),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  PER_HOST_DELAY_MS: z.coerce.number().int().nonnegative().default(500),
  INGEST_CRON: z.string().min(1).default("0 */6 * * *"),
  INGEST_CONCURRENCY: z.coerce.number().int().positive().default(5),
  INGEST_COMPANY_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  GROQ_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  LLM_PROVIDER: z.enum(["groq", "gemini"]).default("groq"),
  // llama-3.3-70b-versatile was shut down on Groq free/dev tier (2026-08-16)
  GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.0-flash"),
  CLASSIFY_CONCURRENCY: z.coerce.number().int().positive().default(3),
  LLM_RPM: z.coerce.number().int().positive().default(30),
  SEARCH_PROVIDER: z.enum(["searxng", "tavily", "brave"]).default("searxng"),
  SEARXNG_URL: z.string().optional().default("http://localhost:8080"),
  TAVILY_API_KEY: z.string().optional().default(""),
  BRAVE_API_KEY: z.string().optional().default(""),
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(3100),
});

export type AppConfig = z.infer<typeof envSchema>;

export const config: AppConfig = envSchema.parse(process.env);
