# Applicable

**Can I apply from India?** Live remote tech jobs, classified for India eligibility, with the exact line from the posting that proves the label.

- **Web:** [https://applicable.click](https://applicable.click)
- **MCP:** [https://mcp.applicable.click](https://mcp.applicable.click)

## Live corpus (from MCP `stats`)

| Metric | Value |
|---|---|
| Active companies | **718** |
| Open tech roles | **15,079** |
| Open worldwide | **50** |
| India remote | **101** |
| India onsite | **339** |
| Graph | HydraDB · ~7.2k nodes · ~24.7k edges |

Numbers above are pulled from production `GET https://mcp.applicable.click/api/stats` at polish time; the landing page uses the same endpoint.

## What it is

Applicable ingests public ATS job boards (Ashby, Greenhouse, Lever, SmartRecruiters), stores postings in **Postgres (source of truth)**, classifies India eligibility with rules (+ LLM when unclear), and syncs a skills/company **graph into HydraDB**.

You can browse jobs on the site, or ask an AI agent via MCP tools: `search_jobs`, `get_job`, `get_company`, `stats`, `ask_jobs`, and more.

## Connect the MCP (30 seconds)

**Cursor** — Settings → MCP → Add server:

```json
{
  "mcpServers": {
    "applicable": {
      "url": "https://mcp.applicable.click"
    }
  }
}
```

**Claude** — custom connector URL: `https://mcp.applicable.click`

**Health check**

```bash
curl -s https://mcp.applicable.click/health
```

**Initialize (Streamable HTTP)** — use `POST`, not a bare `GET` (GET opens a long-lived stream):

```bash
curl -s -X POST https://mcp.applicable.click/ \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0.0.1"}}}'
```

Public REST (same data as the landing stats/feed): `/api/stats`, `/api/jobs`, `/api/companies/top`.

## Architecture

```
ATS boards ──ingest──▶ Postgres ──classify──▶ job_tags
                 │                      │
                 │                      └──sync──▶ HydraDB graph
                 │
                 ├── MCP (mcp.applicable.click)
                 └── Next.js web (applicable.click)
```

- **Postgres** is the source of truth for jobs, companies, and eligibility labels.
- **HydraDB** is the graph used by `ask_jobs` / skill matching (falls back to search when the graph is off).
- Staffing / AI-trainer noise is kept in the DB but flagged `role_family=non_tech` and excluded from tech search by default.

## Local development

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run db:seed
npm test
npm run ingest:once
npm run classify:once
npm run mcp:http          # :3100
cd web && npm install && npm run dev
```

See `.env.example` for required keys. Never commit `.env`.

## Tests

```bash
npm test                  # unit
npm run test:integration  # needs local Postgres
```
