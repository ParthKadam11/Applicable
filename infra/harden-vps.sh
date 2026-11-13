#!/usr/bin/env bash
# VPS hardening for Contabo box hosting Applicable (+ other apps).
# Safe defaults: keep SSH open, key-only already assumed, no root password login.
# Run once:  sudo bash /home/deployer/apps/CaniApply/infra/harden-vps.sh
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "==> packages"
apt-get update -qq
apt-get install -y -qq ufw fail2ban unattended-upgrades apt-listchanges >/dev/null

echo "==> SSH: disable root login (keys for deployer remain)"
install -d -m 755 /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/99-applicable-harden.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 4
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding yes
ClientAliveInterval 300
ClientAliveCountMax 2
EOF
sshd -t
systemctl reload ssh

echo "==> UFW: deny inbound except SSH/HTTP/HTTPS"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
# enable non-interactively
ufw --force enable
ufw status verbose

echo "==> fail2ban: ssh + nginx basic"
cat >/etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
mode = aggressive

[nginx-http-auth]
enabled = true

[nginx-botsearch]
enabled = true
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban
fail2ban-client status sshd || true

echo "==> unattended security upgrades"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades 2>/dev/null || true

echo "==> done"
echo "Public ports should be: 22, 80, 443 only."
echo "Applicable web/MCP/Postgres stay on 127.0.0.1 behind nginx."
