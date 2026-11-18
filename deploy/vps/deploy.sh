#!/usr/bin/env bash
# Deploy / upgrade the full OCP stack on a single VPS.
# Usage: bash deploy/vps/deploy.sh
set -euo pipefail

# Resolve repo root from this script's location.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.yml -f deploy/vps/docker-compose.prod.yml)

log() { printf '\n==> %s\n' "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }

cd "$ROOT"

log "Preflight"
[ -f "$ENV_FILE" ] || fail "Missing $ENV_FILE (copy deploy/vps/.env.example first)."
command -v docker >/dev/null 2>&1 || fail "docker not installed."
docker compose version >/dev/null 2>&1 || fail "docker compose plugin not installed."

for key in DOMAIN DB_PASSWORD BOT_ADMIN_KEY EVOLUTION_WEBHOOK_SECRET; do
  value="$(grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
  [ -n "$value" ] || fail "$key is empty in $ENV_FILE."
  case "$value" in
    CHANGE_ME*|example.com|www.example.com) fail "$key still has a placeholder value." ;;
  esac
done

# Expose the same values to this shell for health-check URLs.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

log "Validating merged compose config"
"${COMPOSE[@]}" config >/dev/null || fail "compose config invalid."

log "Pulling base images and building app images"
"${COMPOSE[@]}" build --pull

log "Starting / upgrading stack"
"${COMPOSE[@]}" up -d --remove-orphans

log "Waiting for services (up to 120s)"
for i in $(seq 1 40); do
  unhealthy="$("${COMPOSE[@]}" ps --format '{{.Name}} {{.Status}}' 2>/dev/null | grep -E 'unhealthy|starting' || true)"
  if [ -z "$unhealthy" ]; then
    break
  fi
  printf '.'
  sleep 3
done
echo

log "Service status"
"${COMPOSE[@]}" ps

log "Health checks"
for url in \
  "https://${DOMAIN}/health" \
  "https://${API_DOMAIN:-api.${DOMAIN}}/ready" \
  "https://${CAMPAIGN_DOMAIN:-campaign.${DOMAIN}}/health"; do
  host="${url#https://}"; host="${host%%/*}"
  printf '  %-45s ' "$host"
  if curl -fsS --max-time 10 "$url" >/dev/null 2>&1; then
    echo "OK"
  else
    echo "FAILED"
    "${COMPOSE[@]}" logs --tail=30
    fail "health check failed for $host"
  fi
done

log "Maintenance"
docker image prune -f >/dev/null || true

echo
echo "Deployment complete. Caddy is serving HTTPS on $DOMAIN."
echo "Run 'docker compose ... logs -f bot' to watch the API."
