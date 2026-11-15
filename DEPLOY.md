# Deploy Applicable on a Contabo VPS

Single-VPS production stack: **Postgres + worker (ingest/pg-boss) + MCP + Caddy (HTTPS)**.

Public ports: **80 / 443** only. Postgres and MCP stay on the Docker network.

---

## 0. DNS

Create an **A** (and optional **AAAA**) record:

```
mcp.yourdomain.com  →  <VPS public IP>
```

Wait until it resolves before `compose up` so Caddy can obtain a Let's Encrypt cert.

---

## 1. Fresh Ubuntu VPS - Docker + firewall

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw

# Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out/in (or newgrp docker) so `docker` works without sudo

# Firewall: SSH + HTTP/HTTPS only
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

---

## 2. Clone and configure

```bash
sudo mkdir -p /opt/applicable
sudo chown "$USER":"$USER" /opt/applicable
cd /opt/applicable
git clone https://github.com/ParthKadam11/Applicable.git .
# or: git clone <your-fork-url> .

cp .env.example .env
nano .env   # required: POSTGRES_PASSWORD, MCP_HOST, optional LLM_* keys
```

Minimum `.env` values (**must exist on the VPS** at `/opt/applicable/.env` - compose fails without them):

| Variable | Example |
|---|---|
| `POSTGRES_PASSWORD` | long random string |
| `MCP_HOST` | `mcp.yourdomain.com` |
| `MCP_PUBLIC_URL` | `https://mcp.yourdomain.com/mcp` |
| `POSTGRES_USER` / `POSTGRES_DB` | `applicable` / `applicable` |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / … | optional (rules-only if empty) |
| `AUTH_SECRET` | long random string (Next.js / Vercel) |
| `AUTH_URL` | `https://applicable.click` (prod) or `http://localhost:3010` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth web client (Next.js / Vercel) |

### Web (Vercel) Auth.js env

Set on the Vercel project (root = `web`), in addition to `NEXT_PUBLIC_API_BASE` and `DATABASE_URL` (same Postgres the MCP stack uses; allow Vercel egress / use a public DB host or tunnel):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Required for `/api/me/*`, saved jobs, MCP tokens, account delete |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | Site origin, e.g. `https://applicable.click` |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google Cloud OAuth client secret |

Google authorized redirect URIs:

- `http://localhost:3010/api/auth/callback/google`
- `https://applicable.click/api/auth/callback/google`

If deploy fails with `MCP_HOST is missing`, SSH once and fix:

```bash
ssh USER@VPS
cd /opt/applicable
grep -E '^(MCP_HOST|POSTGRES_PASSWORD)=' .env || nano .env
# MCP_HOST=mcp.yourdomain.com
# POSTGRES_PASSWORD=...
```

`DATABASE_URL` on the host is for local scripts; **inside Docker**, compose builds it from `POSTGRES_*` → `postgres:5432`.

### Local volume naming (`jobfit` vs `applicable`)

Prod compose uses `applicable_pgdata` / `applicable_*` credentials. Local `docker-compose.yml` **intentionally keeps** the Docker volume name `jobfit_pgdata` and DB user/db `jobfit` so existing local data is not orphaned. Renaming that volume in compose would attach a **new empty** volume - dump/restore first if you ever want local naming to match prod.

### Migrating an existing CaniApply VPS

If the stack was previously under `/opt/caniapply` with `caniapply_*` volumes/containers:

1. Stop the old stack, then move the checkout: `sudo mv /opt/caniapply /opt/applicable`
2. Rename Docker volumes (or dump/restore into new names), e.g. `docker volume create applicable_pgdata` then copy data, **or** temporarily keep the old volume keys in compose until you migrate.
3. Update GitHub Actions `VPS_DEPLOY_PATH` to `/opt/applicable` and point DNS at `applicable.click` when ready.
4. Re-add MCP clients with server name `applicable` (old `caniapply` configs will stop matching after deploy).

---

## 3. Start the stack

```bash
cd /opt/applicable
docker compose -f docker-compose.prod.yml up -d --build
```

What runs:

1. **postgres** - volume `applicable_pgdata`, not published
2. **migrate** - one-shot Drizzle migrations, then exits
3. **app** - ingestion + discover workers (pg-boss)
4. **mcp** - Streamable HTTP on `:3100` (internal)
5. **caddy** - HTTPS termination → `mcp:3100`

Check:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=100 caddy mcp app migrate
```

Expect migrate: `Migrations complete.`  
Expect mcp: `listening on :3100`  
Expect caddy: certificate obtained for `MCP_HOST`.

---

## 4. Smoke test

```bash
chmod +x scripts/smoke.sh scripts/backup-postgres.sh
./scripts/smoke.sh https://mcp.yourdomain.com
```

Should print **PASS** for `/health`, `initialize`, `tools/list`, `tools/call stats`.

Connect Cursor / Claude with:

```json
{
  "mcpServers": {
    "applicable": {
      "url": "https://mcp.yourdomain.com/mcp"
    }
  }
}
```

---

## 5. Daily Postgres backups

Script: `scripts/backup-postgres.sh` → `/root/backups/applicable-*.sql.gz`, keeps **7 days**.

```bash
sudo mkdir -p /root/backups
sudo cp /opt/applicable/scripts/backup-postgres.sh /usr/local/bin/applicable-backup.sh
sudo chmod +x /usr/local/bin/applicable-backup.sh

# Load POSTGRES_USER / POSTGRES_DB from .env when dumping
sudo tee /etc/cron.d/applicable-backup >/dev/null <<'EOF'
# Daily 03:00 UTC
0 3 * * * root set -a; . /opt/applicable/.env; set +a; /usr/local/bin/applicable-backup.sh >> /var/log/applicable-backup.log 2>&1
EOF
```

Manual run:

```bash
sudo BACKUP_DIR=/root/backups /opt/applicable/scripts/backup-postgres.sh
```

Restore (destructive):

```bash
gunzip -c /root/backups/applicable-YYYYMMDD….sql.gz \
  | docker exec -i applicable-postgres psql -U applicable -d applicable
```

---

## 6. CI/CD (GitHub Actions) - no more manual SSH

Workflows:

| File | When | What |
|---|---|---|
| `.github/workflows/ci.yml` | PR + push | typecheck + unit tests |
| `.github/workflows/deploy.yml` | push to `master`/`main`, or **Run workflow** | tests → SSH deploy → optional smoke |

### One-time setup on the VPS

1. Ensure the app is already cloned and running under `/opt/applicable` (sections 1–3).
2. Create an SSH key so GitHub Actions can log into the VPS (no passphrase):

```bash
# On your laptop
ssh-keygen -t ed25519 -C "applicable-github-deploy" -f applicable_gha_deploy -N ""

# Install the *private* key as GitHub secret VPS_SSH_KEY (see below).
# Install the *public* key on the VPS for SSH login:
ssh-copy-id -i applicable_gha_deploy.pub USER@YOUR_VPS_IP
```

The deploy workflow uses `GITHUB_TOKEN` for `git fetch` on the VPS, so you do **not** need a separate GitHub deploy key for pulls (HTTPS remotes are fine).

### GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Example |
|---|---|
| `VPS_HOST` | `123.45.67.89` or `mcp.yourdomain.com` |
| `VPS_USER` | `root` or your deploy user |
| `VPS_SSH_KEY` | full **private** key contents of `applicable_gha_deploy` (see format below) |
| `VPS_DEPLOY_PATH` | `/opt/applicable` (optional; this is the default) |
| `MCP_SMOKE_URL` | `https://mcp.yourdomain.com` (optional; enables post-deploy smoke) |

**`VPS_SSH_KEY` format (common failure):** paste the **private** key file whole, with real newlines - not the `.pub` file, not one long line, no quotes.

```bash
# On the machine where you generated the key - copy this exact output into the secret:
cat applicable_gha_deploy
# Must start with: -----BEGIN OPENSSH PRIVATE KEY-----
# Must end with:   -----END OPENSSH PRIVATE KEY-----
```

Then on the VPS, the matching public key must be authorized:

```bash
# From your laptop
ssh-copy-id -i applicable_gha_deploy.pub USER@VPS_HOST
# or append manually:
# cat applicable_gha_deploy.pub >> ~/.ssh/authorized_keys
```

If deploy fails with `ssh: no key found` / `unable to authenticate`, the secret is wrong - delete and re-add `VPS_SSH_KEY`.

After secrets are set: push to `master` (or **Actions → Deploy → Run workflow**). Watch the Deploy job; it `git pull`s, `docker compose … up -d --build`s, waits for mcp healthy, then smokes if `MCP_SMOKE_URL` is set.

---

## 7. Manual update (pull + rebuild)

Still works anytime without CI:

```bash
cd /opt/applicable
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f --tail=50 migrate mcp app
./scripts/smoke.sh https://mcp.yourdomain.com
```

Migrations re-run via the **migrate** one-shot service on each recreate.

---

## 8. Useful commands

```bash
# Status
docker compose -f docker-compose.prod.yml ps

# Logs
docker compose -f docker-compose.prod.yml logs -f mcp
docker compose -f docker-compose.prod.yml logs -f app

# One-shot ingest (optional)
docker compose -f docker-compose.prod.yml exec app node dist/scripts/ingest-once.js

# Stop
docker compose -f docker-compose.prod.yml down
# Wipe DB volume (danger):
# docker compose -f docker-compose.prod.yml down -v
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Caddy cert fail | DNS A record → VPS; ports 80/443 open in Contabo + ufw |
| mcp unhealthy | `docker compose -f docker-compose.prod.yml logs mcp migrate` |
| migrate failed | `POSTGRES_PASSWORD` special chars - prefer alphanumeric; see logs |
| Empty stats | Run ingest: `docker compose -f docker-compose.prod.yml exec app node dist/scripts/ingest-once.js` |
