#!/bin/bash
# Restore an OCP PostgreSQL backup. DESTRUCTIVE — reads current DB first.
#   ./scripts/restore.sh ./backups/ocp-20260101-020000.sql.gz
set -euo pipefail

BACKUP_FILE="${1:?Usage: restore.sh <backup.sql.gz>}"
COMPOSE_FILE="${OCP_COMPOSE_FILE:-docker-compose.yml}"
DB_USER="${POSTGRES_USER:-ocp}"
DB_NAME="${POSTGRES_DB:-ocp}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore] file not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "WARNING: this will DROP and recreate all tables in ${DB_NAME}."
read -r -p "Type 'yes' to continue: " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "[restore] aborted"; exit 0; }

echo "[restore] restoring from ${BACKUP_FILE}"
gunzip -c "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1

echo "[restore] complete — restart the bot so caches/migrations reload"
