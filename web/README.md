# Applicable web

Landing + dashboard for [applicable.parthkadam.tech](https://applicable.parthkadam.tech).

- Next.js 15 App Router + Tailwind CSS v4
- Data only from `NEXT_PUBLIC_API_BASE` (`/api/stats`, `/api/stats/history`, `/api/jobs`, `/api/companies/top`)
- Revalidate every 5 minutes; failed fetches render `-`

## Develop

```bash
cp .env.example .env.local   # optional override
npm install
npm run dev                  # http://localhost:3000
```

Point `NEXT_PUBLIC_API_BASE` at a local MCP (`http://127.0.0.1:3100`) if the prod nginx hasn’t proxied `/api/` yet.

## Deploy (Vercel - recommended)

1. Import this repo in Vercel; set **Root Directory** to `web`.
2. Env: `NEXT_PUBLIC_API_BASE=https://mcp.parthkadam.tech`
3. Add domain `applicable.parthkadam.tech` → CNAME to `cname.vercel-dns.com` (or A records Vercel shows).
4. Deploy. ISR/revalidate uses Vercel’s cache.

## Deploy (Cloudflare Pages)

Use `@opennextjs/cloudflare` or static `output: 'export'` only if you accept no ISR (then poll client-side). Prefer Vercel for `revalidate: 300`.

## Backend checklist

On the VPS, nginx must proxy `/api/` to the MCP container (see `infra/nginx/mcp.parthkadam.tech.conf`), and the MCP image must include the public routes in `src/mcp/app.ts`.
