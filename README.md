# CaniApply

TypeScript (Node 20) backend that collects startup job postings from public ATS
job-board APIs, stores them in Postgres, and exposes them through a hosted MCP
server. No UI.

**Current milestone:** hosted MCP (Streamable HTTP) on top of ingest + classify.

## Stack

- TypeScript / Node 20
- Postgres + Drizzle ORM
- pg-boss for scheduling / retries
- Zod for validation
- Docker Compose for local Postgres
- Vitest

## Quick start

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate   # if drizzle/ is empty
npm run db:migrate
npm run db:seed
npm test
npm run ingest:once   # one-shot ingest of active companies
npm run classify:once # classify jobs needing tags; print stats
npm run stats         # india_eligibility counts
npm run dev           # long-running worker + 6h cron
```

## Environment

See `.env.example`. Required for local ingest:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `USER_AGENT` | Identifies CaniApply on outbound HTTP |
| `PER_HOST_DELAY_MS` | Polite per-host delay between requests |
| `INGEST_CRON` | Cron expression (default every 6 hours UTC) |
| `INGEST_CONCURRENCY` | Max concurrent company fetches (default 5) |
| `INGEST_COMPANY_TIMEOUT_MS` | Per-company timeout (default 30000) |
| `LLM_PROVIDER` | `groq` or `gemini` |
| `GROQ_API_KEY` / `GEMINI_API_KEY` | Optional; rules-only if unset |
| `GROQ_MODEL` | Default `openai/gpt-oss-20b` (Llama 3.3 IDs are deprecated on Groq) |
| `CLASSIFY_CONCURRENCY` | Max concurrent classify jobs (default 1; raise if not rate-limited) |
| `LLM_RPM` | Token-bucket for LLM calls (default 6; Groq free ~8k TPM) |

| `MCP_HTTP_PORT` | Streamable HTTP listen port (default 3100) |
| `MCP_RATE_LIMIT_RPM` | Per-IP rate limit (default 60) |
| `MCP_PUBLIC_URL` | Public MCP URL for docs / clients |
| `MCP_DOMAIN` | Hostname for Caddy TLS (`docker compose --profile tls`) |

## Adding companies

Edit `companies.yaml`:

```yaml
companies:
  - name: Acme
    website: https://acme.com
    ats: ashby          # ashby | greenhouse | lever | workable | recruitee | personio
    ats_slug: acme
```

Then:

```bash
npm run db:seed
```

### Detect ATS from a careers page

```bash
npm run detect-ats -- https://acme.com/careers
```

Prints JSON with detected `ats` + `ats_slug` from known host patterns
(`jobs.ashbyhq.com`, `boards.greenhouse.io`, `jobs.lever.co`,
`apply.workable.com`, `*.recruitee.com`, `*.jobs.personio.de`).

## Ingestion

- One adapter per ATS behind `fetchJobs(slug, companyId) → NormalizedJob[]`
- Implemented now: **Ashby**, **Greenhouse**, **Lever**
- Upserts into `jobs` on `(company_id, external_id)`, stores `content_hash`
- Jobs missing from the latest successful fetch get `closed_at = now()`
- pg-boss cron every 6 hours enqueues one job per active company
- Concurrency 5, retries with backoff, 30s per-company timeout
- Each attempt logged in `fetch_runs` (`ok`, `job_count`, `error`)

```bash
npm run ingest:once   # enqueue all active companies once
npm run dev           # worker + schedule
```

## Tests

```bash
npm test                         # unit tests (fixtures, no network)
docker compose up -d
npm run db:migrate
DATABASE_URL=postgres://jobfit:jobfit@localhost:5432/jobfit npm run test:integration
```

## Classification

- Rules first (`src/classify/rules.ts`): india eligibility, interview style,
  contractor/EOR, compensation, seniority, role family — each with evidence quotes.
- Bare `"Remote"` is never `india_eligibility=open`.
- LLM only when rules leave eligibility unclear or seniority/role unresolved.
- Evidence guard rejects any quote that is not a whitespace-normalized substring
  of the posting; rejected fields fall back to `unclear` / unknown.
- After ingest, jobs with new/changed `content_hash` are enqueued on `classify-job`.

```bash
npm run classify:once
npm run stats
```

## MCP (hosted)

Read-only Streamable HTTP MCP server against Postgres. Tools:
`search_jobs`, `get_job`, `list_companies`, `stats`, `submit_company`.

```bash
npm run mcp:http          # http://localhost:3100/mcp
npm run mcp:stdio         # local stdio for Cursor/Claude Desktop
npm run mcp:smoke         # call each tool once against the DB
docker compose up -d --build mcp
curl -s http://localhost:3100/health
```

For HTTPS on a Contabo VPS (Let's Encrypt via Caddy):

```bash
export MCP_DOMAIN=mcp.yourdomain.com
docker compose --profile tls up -d --build
```

### Connect in 30 seconds

Replace the URL with your deployed endpoint (local example shown).

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "caniapply": {
      "url": "https://mcp.yourdomain.com/mcp"
    }
  }
}
```

If your Claude build only supports stdio locally:

```json
{
  "mcpServers": {
    "caniapply": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.yourdomain.com/mcp"]
    }
  }
}
```

**Cursor** (Settings → MCP → Add server):

```json
{
  "mcpServers": {
    "caniapply": {
      "url": "https://mcp.yourdomain.com/mcp"
    }
  }
}
```

**curl** (initialize):

```bash
curl -s http://localhost:3100/health
curl -s -X POST http://localhost:3100/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.1"}}}'
```

## Project layout

```
src/
  ats/           # ATS adapters (ashby, greenhouse, lever)
  classify/      # rules + LLM eligibility
  discover/      # YC/HN/remote company discovery
  mcp/           # Streamable HTTP + stdio MCP server
  db/            # Drizzle schema, client, migrate
  ingestion/     # upsert, fetch-company, pg-boss
  scripts/       # seed, detect-ats, ingest-once, mcp-smoke
  utils/         # http, html strip, content hash
tests/
  ats/           # adapter unit tests + fixtures
  mcp/           # MCP schema + tool tests
  integration/   # docker Postgres ingestion test
companies.yaml
drizzle/         # SQL migrations
Dockerfile       # mcp image
Caddyfile        # TLS reverse proxy for mcp.<domain>
```
