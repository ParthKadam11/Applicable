# Applicable web

Landing + dashboard for [applicable.click](https://applicable.click).

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
2. Env: `NEXT_PUBLIC_API_BASE=https://mcp.applicable.click`
3. Add domain `applicable.click` → A record to the VPS (see `infra/nginx/enable-applicable-web.sh`).
4. Deploy. ISR/revalidate uses Vercel’s cache.

## Deploy (Cloudflare Pages)

Use `@opennextjs/cloudflare` or static `output: 'export'` only if you accept no ISR (then poll client-side). Prefer Vercel for `revalidate: 300`.

## Backend checklist

On the VPS, nginx must proxy `/api/` to the MCP container (see `infra/nginx/mcp.applicable.click.conf`), and the MCP image must include the public routes in `src/mcp/app.ts`.
