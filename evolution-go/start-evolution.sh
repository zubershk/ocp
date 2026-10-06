#!/bin/bash
# Local-dev launcher. Real credentials come from the environment — this
# file must never contain committed secrets. Generate values with:
#   openssl rand -hex 16   # GLOBAL_API_KEY (32 hex chars)
export SERVER_PORT=8080
export POSTGRES_AUTH_DB=${POSTGRES_AUTH_DB:-postgresql://postgres:postgres@localhost:5432/evogo_auth?sslmode=disable}
export POSTGRES_USERS_DB=${POSTGRES_USERS_DB:-postgresql://postgres:postgres@localhost:5432/evogo_users?sslmode=disable}
export DATABASE_SAVE_MESSAGES=false
export CLIENT_NAME=evolution
export GLOBAL_API_KEY=${GLOBAL_API_KEY:?set GLOBAL_API_KEY to a generated 32-char hex value}
export WADEBUG=DEBUG
export LOGTYPE=console
export WEBHOOK_FILES=true
export CONNECT_ON_STARTUP=true
export OS_NAME="Evolution GO"
export AMQP_URL=${AMQP_URL:-amqp://admin:changeme@localhost:5672/default}
export AMQP_GLOBAL_ENABLED=false
export WEBHOOK_URL=${WEBHOOK_URL:-https://your-webhook-endpoint.example.com}
export MINIO_ENABLED=false
export MINIO_ENDPOINT=localhost:9000
export MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-CHANGE_ME_MINIO_ACCESS_KEY}
export MINIO_SECRET_KEY=${MINIO_SECRET_KEY:-CHANGE_ME_MINIO_SECRET_KEY}
export MINIO_BUCKET=evolution-media
export MINIO_USE_SSL=false

cd "$(dirname "$0")"
./evolution-go
