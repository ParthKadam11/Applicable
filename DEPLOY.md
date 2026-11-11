# Deploy CaniApply on a Contabo VPS

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

## 1. Fresh Ubuntu VPS — Docker + firewall

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
sudo mkdir -p /opt/caniapply
sudo chown "$USER":"$USER" /opt/caniapply
cd /opt/caniapply
git clone https://github.com/ParthKadam11/CaniApply.git .
# or: git clone <your-fork-url> .

cp .env.example .env
nano .env   # required: POSTGRES_PASSWORD, MCP_HOST, optional LLM_* keys
```

Minimum `.env` values:

| Variable | Example |
|---|---|
| `POSTGRES_PASSWORD` | long random string |
| `MCP_HOST` | `mcp.yourdomain.com` |
| `MCP_PUBLIC_URL` | `https://mcp.yourdomain.com/mcp` |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / … | optional (rules-only if empty) |

`DATABASE_URL` on the host is for local scripts; **inside Docker**, compose builds it from `POSTGRES_*` → `postgres:5432`.

---

## 3. Start the stack

```bash
cd /opt/caniapply
docker compose -f docker-compose.prod.yml up -d --build
```

What runs:

1. **postgres** — volume `caniapply_pgdata`, not published
2. **migrate** — one-shot Drizzle migrations, then exits
3. **app** — ingestion + discover workers (pg-boss)
4. **mcp** — Streamable HTTP on `:3100` (internal)
5. **caddy** — HTTPS termination → `mcp:3100`

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
    "caniapply": {
      "url": "https://mcp.yourdomain.com/mcp"
    }
  }
}
```

---

## 5. Daily Postgres backups

Script: `scripts/backup-postgres.sh` → `/root/backups/caniapply-*.sql.gz`, keeps **7 days**.

```bash
sudo mkdir -p /root/backups
sudo cp /opt/caniapply/scripts/backup-postgres.sh /usr/local/bin/caniapply-backup.sh
sudo chmod +x /usr/local/bin/caniapply-backup.sh

# Load POSTGRES_USER / POSTGRES_DB from .env when dumping
sudo tee /etc/cron.d/caniapply-backup >/dev/null <<'EOF'
# Daily 03:00 UTC
0 3 * * * root set -a; . /opt/caniapply/.env; set +a; /usr/local/bin/caniapply-backup.sh >> /var/log/caniapply-backup.log 2>&1
EOF
```

Manual run:

```bash
sudo BACKUP_DIR=/root/backups /opt/caniapply/scripts/backup-postgres.sh
```

Restore (destructive):

```bash
gunzip -c /root/backups/caniapply-YYYYMMDD….sql.gz \
  | docker exec -i caniapply-postgres psql -U caniapply -d caniapply
```

---

## 6. CI/CD (GitHub Actions) — no more manual SSH

Workflows:

| File | When | What |
|---|---|---|
| `.github/workflows/ci.yml` | PR + push | typecheck + unit tests |
| `.github/workflows/deploy.yml` | push to `master`/`main`, or **Run workflow** | tests → SSH deploy → optional smoke |

### One-time setup on the VPS

1. Ensure the app is already cloned and running under `/opt/caniapply` (sections 1–3).
2. Make sure `git pull` works **non-interactively** on the VPS (deploy key recommended):

```bash
# On your laptop — create a deploy key (no passphrase)
ssh-keygen -t ed25519 -C "caniapply-github-deploy" -f caniapply_gha_deploy -N ""

# Install the *private* key as a GitHub Actions secret (VPS_SSH_KEY) — see below.
# Install the *public* key on the VPS for SSH login:
ssh-copy-id -i caniapply_gha_deploy.pub USER@YOUR_VPS_IP

# On the VPS — read-only deploy key so `git pull` works without a password:
ssh-keygen -t ed25519 -C "caniapply-vps-git" -f ~/.ssh/caniapply_github -N ""
cat ~/.ssh/caniapply_github.pub
# → GitHub repo → Settings → Deploy keys → Add (read-only)

# Point origin at SSH if you cloned via HTTPS:
cd /opt/caniapply
git remote set-url origin git@github.com:ParthKadam11/CaniApply.git
# ~/.ssh/config host github.com → IdentityFile ~/.ssh/caniapply_github
printf '%s\n' \
  'Host github.com' \
  '  HostName github.com' \
  '  User git' \
  '  IdentityFile ~/.ssh/caniapply_github' \
  '  IdentitiesOnly yes' >> ~/.ssh/config
chmod 600 ~/.ssh/config
ssh -T git@github.com   # should say "successfully authenticated"
git pull
```

### GitHub Actions secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Example |
|---|---|
| `VPS_HOST` | `123.45.67.89` or `mcp.yourdomain.com` |
| `VPS_USER` | `root` or your deploy user |
| `VPS_SSH_KEY` | full **private** key contents of `caniapply_gha_deploy` (see format below) |
| `VPS_DEPLOY_PATH` | `/opt/caniapply` (optional; this is the default) |
| `MCP_SMOKE_URL` | `https://mcp.yourdomain.com` (optional; enables post-deploy smoke) |

**`VPS_SSH_KEY` format (common failure):** paste the **private** key file whole, with real newlines — not the `.pub` file, not one long line, no quotes.

```bash
# On the machine where you generated the key — copy this exact output into the secret:
cat caniapply_gha_deploy
# Must start with: -----BEGIN OPENSSH PRIVATE KEY-----
# Must end with:   -----END OPENSSH PRIVATE KEY-----
```

Then on the VPS, the matching public key must be authorized:

```bash
# From your laptop
ssh-copy-id -i caniapply_gha_deploy.pub USER@VPS_HOST
# or append manually:
# cat caniapply_gha_deploy.pub >> ~/.ssh/authorized_keys
```

If deploy fails with `ssh: no key found` / `unable to authenticate`, the secret is wrong — delete and re-add `VPS_SSH_KEY`.

After secrets are set: push to `master` (or **Actions → Deploy → Run workflow**). Watch the Deploy job; it `git pull`s, `docker compose … up -d --build`s, waits for mcp healthy, then smokes if `MCP_SMOKE_URL` is set.

---

## 7. Manual update (pull + rebuild)

Still works anytime without CI:

```bash
cd /opt/caniapply
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
| migrate failed | `POSTGRES_PASSWORD` special chars — prefer alphanumeric; see logs |
| Empty stats | Run ingest: `docker compose -f docker-compose.prod.yml exec app node dist/scripts/ingest-once.js` |
