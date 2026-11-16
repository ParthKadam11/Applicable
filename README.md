# Applicable

**Can I apply from India?**

Remote tech roles, labeled for India eligibility, with the exact line from the posting that proves it — browse on the web, or ask an agent over MCP.

[![Applicable — remote jobs that actually hire from India](docs/applicable-hero.jpg)](https://applicable.click)

<p align="center">
  <a href="https://applicable.click"><img src="https://img.shields.io/badge/Web-applicable.click-0B6E4F?style=for-the-badge" alt="Web" /></a>
  <a href="https://mcp.applicable.click"><img src="https://img.shields.io/badge/MCP-mcp.applicable.click-1B4F72?style=for-the-badge" alt="MCP" /></a>
  <a href="https://joinwaitlist.parthkadam.tech"><img src="https://img.shields.io/badge/Waitlist-join-5D3A9B?style=for-the-badge" alt="Waitlist" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Postgres-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="Postgres" />
  <img src="https://img.shields.io/badge/HydraDB-graph-111111?style=flat-square&logo=neo4j&logoColor=white" alt="HydraDB" />
  <img src="https://img.shields.io/badge/MCP-Model%20Context%20Protocol-000000?style=flat-square&logo=openai&logoColor=white" alt="MCP" />
  <img src="https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=black" alt="Drizzle" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/pg--boss-jobs-6B7280?style=flat-square&logo=amazonaws&logoColor=white" alt="pg-boss" />
  <img src="https://img.shields.io/badge/Zod-3E67B1?style=flat-square&logo=zod&logoColor=white" alt="Zod" />
  <img src="https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/Auth.js-000000?style=flat-square&logo=auth0&logoColor=white" alt="Auth.js" />
</p>

---

## Why it exists

Most “remote” postings are not remote from India. They are US-only, EMEA-only, clearance-gated, or silent until you read the fine print.

Applicable does the reading for you:

1. **Ingest** public ATS boards (Ashby · Greenhouse · Lever · SmartRecruiters · Workable)
2. **Classify** every tech role: worldwide open, India remote, India onsite, region-locked, or unclear
3. **Quote** the exact sentence that supports the label
4. **Expose** the corpus on the web and as an MCP server agents can query

---

## Live corpus

The **live corpus** is the product proof — not a marketing mock. It is the same Postgres-backed dataset the site, MCP tools, and landing stats all read from.

| Metric | Live |
|---|---:|
| Companies tracked | **718** |
| Open tech roles | **15,079** |
| Remote from India | **101** |
| Open worldwide | **50** |
| India onsite | **339** |
| Graph (HydraDB) | **~7.2k** nodes · **~24.7k** edges |

Numbers update continuously via ingest + classify. Pull them yourself:

```bash
curl -s https://mcp.applicable.click/api/stats | jq '.by_eligibility, .graph'
```

On the landing page, the Live corpus section shows those counts plus a scrolling feed of real jobs with evidence quotes — so you can verify a label before you apply.

**Why it matters:** without a live, quoted corpus, “India-friendly jobs” is just a claim. Every Applicable label is falsifiable against the posting text.

---

## HydraDB (graph layer)

[HydraDB](https://www.hydradb.ai) is the **skills / company / job graph** synced from Postgres.

| Layer | Role |
|---|---|
| **Postgres** | Source of truth — jobs, companies, eligibility labels, evidence |
| **HydraDB** | Graph over that data — hops like `SIMILAR_TO`, `REQUIRES`, `USES_SKILL`, `POSTS`, `INVESTED_IN` |

**When you need it**

- `explore` — walk company ↔ skill ↔ job paths
- `skill_gap` — skills that unlock the most India-eligible roles you’re one skill short of
- `ask_jobs` — legacy graph ops (`match_skills`, `similar_companies`, …)

**When you don’t**

- Plain `search_jobs` / `get_job` / `stats` / web browse — Postgres only
- If HydraDB is down or `HYDRA_GRAPH_ENABLED=false`, graph tools fall back to keyword search instead of failing the whole product

Self-host with a separate Compose project (safe next to prod):

```bash
mkdir -p .hydra
python3 -c "import secrets; print(secrets.token_urlsafe(32))" > .hydra/auth-token
chmod 600 .hydra/auth-token
docker compose -f docker-compose.hydra.yml up -d --build
# then set HYDRA_GRAPH_ENABLED=true + HYDRA_* in .env
```

---

## Eligibility labels

| Label | Meaning |
|---|---|
| `open` | Worldwide / no country lock — India can apply |
| `india_remote` | Remote and explicitly India / APAC / India city |
| `india_onsite` | Based in India (office / hybrid) |
| `region_locked` | US / EMEA / clearance / citizenship lock |
| `unclear` | Ambiguous — quote shown so you can decide |

Hard constraints (citizenship, ITAR, clearance) beat marketing “global team” fluff. Multi-location posts that list Bengaluru / India / APAC stay India-eligible even when other offices are US-only. Details: [applicable.click/labels](https://applicable.click/labels).

---

## Architecture

```
┌─────────────┐     ingest      ┌────────────┐     classify     ┌──────────┐
│ ATS boards  │ ──────────────▶ │  Postgres  │ ───────────────▶ │ job_tags │
│ Ashby · GH  │                 │  (SoT)     │                  │ + quotes │
│ Lever · …   │                 └─────┬──────┘                  └────┬─────┘
└─────────────┘                       │                              │
                                      │ sync                         │
                                      ▼                              │
                               ┌─────────────┐                       │
                               │   HydraDB   │◀──────────────────────┘
                               │   graph     │
                               └──────┬──────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
     ┌────────────────┐    ┌──────────────────┐    ┌─────────────────┐
     │ MCP HTTP       │    │ Next.js web      │    │ Agents (Cursor, │
     │ mcp.applicable │    │ applicable.click │    │ Claude, …)      │
     │ .click         │    │                  │    │                 │
     └────────────────┘    └──────────────────┘    └─────────────────┘
```

**Stack**

| Area | Tech |
|---|---|
| Ingest / classify / MCP | Node 20 · TypeScript · Express · Zod · pg-boss |
| Data | Postgres 16 · Drizzle ORM |
| Graph | HydraDB (Bolt + HTTP) |
| Web | Next.js 15 · React 19 · Tailwind CSS v4 · Auth.js · Motion |
| Ops | Docker Compose · Caddy · Vitest |

---

## Connect the MCP (~30 seconds)

**Cursor** → Settings → MCP → Add server:

```json
{
  "mcpServers": {
    "applicable": {
      "url": "https://mcp.applicable.click"
    }
  }
}
```

**Claude** → custom connector URL: `https://mcp.applicable.click`

**Health**

```bash
curl -s https://mcp.applicable.click/health
```

### Tools agents get

| Tool | What it does |
|---|---|
| `search_jobs` | India-eligible tech jobs + evidence quotes (default: `open` + `india_remote`) |
| `get_job` / `get_company` | Full posting or company card |
| `stats` | Live corpus counts (same as `/api/stats`) |
| `explore` | Graph hops (needs HydraDB) |
| `skill_gap` | Skills that unlock more India-OK roles (needs HydraDB) |
| `ask_jobs` | Legacy graph alias; falls back to search if graph is off |

Public REST (same corpus): `/api/stats`, `/api/jobs`, `/api/companies/top`.

---

## Repo map

```
CaniApply/
├── src/                 # ingest, classify, discover, MCP, Hydra sync
│   ├── classify/        # rules + LLM eligibility
│   ├── discover/        # ATS / YC / remote-board discovery
│   ├── graph/           # HydraDB explore / ask / skill-gap
│   ├── ingestion/       # ATS fetch + pg-boss
│   └── mcp/             # MCP server + public HTTP API
├── web/                 # Next.js site (applicable.click)
├── video/               # Remotion launch video
├── tests/               # Vitest unit + integration
├── docs/                # hero + assets
├── docker-compose.yml           # local stack
├── docker-compose.prod.yml      # VPS app + mcp + postgres
└── docker-compose.hydra.yml     # HydraDB graph (separate project)
```

---

## Local development

```bash
cp .env.example .env          # fill Postgres + optional LLM / Hydra keys
docker compose up -d          # Postgres
npm install
npm run db:migrate
npm run db:seed
npm test
npm run ingest:once
npm run classify:once
npm run mcp:http              # http://127.0.0.1:3100

cd web && npm install && npm run dev   # http://127.0.0.1:3010
```

Point `web/.env.local` at the local MCP:

```bash
NEXT_PUBLIC_API_BASE=http://127.0.0.1:3100
```

Never commit `.env` / `.env.local` / `.hydra/auth-token`.

### Useful scripts

```bash
npm run discover:once              # find + promote ATS companies
npm run classify:unclear-nightly   # LLM pass on unclear tech jobs
npm run graph:sync                 # push labels → HydraDB
npm run stats                      # print eligibility breakdown
npm run smoke                      # health smoke
```

### Tests

```bash
npm test                  # unit
npm run test:integration  # needs local Postgres
```

---

## How it’s hosted

Single VPS. Public surface is HTTPS only.

| Piece | How |
|---|---|
| **Web** | Next.js behind nginx → [applicable.click](https://applicable.click) |
| **MCP + API** | Docker service behind nginx → [mcp.applicable.click](https://mcp.applicable.click) |
| **Postgres** | Docker — source of truth (not public) |
| **Ingest / classify** | Docker worker (pg-boss) |
| **HydraDB** | Docker graph next to the app (not public) |
| **TLS** | nginx terminates HTTPS; DB / graph stay on the private network |

```
Internet ──HTTPS──▶ nginx
                      ├── applicable.click      → Next.js (PM2)
                      └── mcp.applicable.click  → MCP (Docker)
                                                    │
                                    private: Postgres · worker · HydraDB
```

Local / self-host steps: [DEPLOY.md](./DEPLOY.md).

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.hydra.yml up -d --build
bash scripts/deploy-web.sh
```

---

## Links

| | |
|---|---|
| Product | [applicable.click](https://applicable.click) |
| MCP | [mcp.applicable.click](https://mcp.applicable.click) |
| Labels | [applicable.click/labels](https://applicable.click/labels) |
| HydraDB | [hydradb.ai](https://www.hydradb.ai) |
| Waitlist | [joinwaitlist.parthkadam.tech](https://joinwaitlist.parthkadam.tech) |
| Author | [parthkadam.tech](https://www.parthkadam.tech/) |

Built for India-based engineers who are tired of reading “remote” and finding a US-only asterisk.
