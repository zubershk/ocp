#!/bin/bash
# OCP PostgreSQL backup with retention. Run from cron/CI:
#   0 2 * * * /path/to/ocp/scripts/backup.sh
# All knobs are env-driven; see README "Backups".
set -euo pipefail

COMPOSE_FILE="${OCP_COMPOSE_FILE:-docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DB_USER="${POSTGRES_USER:-ocp}"
DB_NAME="${POSTGRES_DB:-ocp}"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"      # optional: s3://bucket/path
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTFILE="${BACKUP_DIR}/ocp-${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"
echo "[backup] dumping ${DB_NAME} -> ${OUTFILE}"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --clean --if-exists \
  | gzip > "$OUTFILE"

echo "[backup] dump complete: $(du -h "$OUTFILE" | cut -f1)"

# Prune old local backups
find "$BACKUP_DIR" -name 'ocp-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete

# Optional offsite copy (requires aws cli / rclone configured)
if [ -n "$S3_BUCKET" ]; then
  echo "[backup] uploading to ${S3_BUCKET}"
  if command -v aws &>/dev/null; then
    aws s3 cp "$OUTFILE" "$S3_BUCKET/"
  elif command -v rclone &>/dev/null; then
    rclone copy "$OUTFILE" "$S3_BUCKET"
  else
    echo "[backup] WARNING: BACKUP_S3_BUCKET set but neither aws nor rclone found" >&2
  fi
fi

echo "[backup] done"
