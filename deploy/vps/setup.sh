#!/usr/bin/env bash
# One-time VPS bootstrap: Docker, firewall, app directory and .env.
# Run as a user with sudo on a fresh Ubuntu 22.04/24.04 or Debian 12 VPS.
# Usage: bash deploy/vps/setup.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/ocp}"
REPO_URL="${REPO_URL:-https://github.com/zubershk/ocp.git}"

log() { printf '\n==> %s\n' "$*"; }

log "Checking OS"
if [ ! -f /etc/os-release ]; then
  echo "ERROR: /etc/os-release missing — unsupported distro" >&2
  exit 1
fi
. /etc/os-release
case "$ID" in
  ubuntu|debian) ;;
  *) echo "ERROR: unsupported distro: $ID (this script targets Ubuntu/Debian)" >&2; exit 1 ;;
esac

log "Installing Docker + Compose plugin"
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER"
  echo "Docker installed. Log out and back in for group changes to take effect."
else
  echo "Docker already installed."
fi

log "Configuring firewall (SSH + HTTP + HTTPS only)"
if command -v ufw >/dev/null 2>&1; then
  sudo ufw allow 22/tcp
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
  sudo ufw status
else
  echo "ufw not found — configure your host firewall to allow 22/80/443 manually."
fi

log "Cloning repository to $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "Repo already present — skipping clone."
else
  sudo mkdir -p "$APP_DIR"
  sudo chown "$USER":"$USER" "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

log "Creating deploy/vps/.env from template"
cd "$APP_DIR"
if [ -f deploy/vps/.env ]; then
  echo "deploy/vps/.env already exists — leaving it untouched."
else
  cp deploy/vps/.env.example deploy/vps/.env
  # Generate strong values for the required secrets so nothing ships with a
  # placeholder. Domains still need editing by hand.
  for key in DB_PASSWORD BOT_ADMIN_KEY EVOLUTION_WEBHOOK_SECRET CAMPAIGN_ENCRYPTION_KEY OTP_PEPPER; do
    secret="$(openssl rand -hex 32)"
    sed -i "s|^${key}=.*|${key}=${secret}|" deploy/vps/.env
  done
  chmod 600 deploy/vps/.env
  echo "Created deploy/vps/.env with generated secrets (mode 600)."
  echo "EDIT IT NOW: set DOMAIN, *_DOMAIN, VITE_API_BASE_URL, CORS_ALLOWED_ORIGINS, TRUSTED_PROXIES."
fi

log "Installing backup cron"
if command -v crontab >/dev/null 2>&1; then
  # Source the env file so Compose interpolation (${DB_PASSWORD:?}) resolves
  # in cron's minimal environment, and use the same compose project name.
  (crontab -l 2>/dev/null || true; \
    echo "0 2 * * * cd $APP_DIR && set -a && . deploy/vps/.env && set +a && bash scripts/backup.sh >> /var/log/ocp-backup.log 2>&1") \
    | crontab -
  echo "Nightly backup installed at 02:00. Verify scripts/restore.sh against a scratch DB."
else
  echo "cron not available — schedule scripts/backup.sh with your platform's scheduler."
fi

log "Bootstrap complete"
echo "Next steps:"
echo "  1. Edit $APP_DIR/deploy/vps/.env (domains + origins)."
echo "  2. Point DNS A/AAAA records at this VPS."
echo "  3. bash deploy/vps/deploy.sh"
