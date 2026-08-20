#!/bin/bash
export SERVER_PORT=8080
export POSTGRES_AUTH_DB=postgresql://postgres:root@localhost:5432/evogo_auth?sslmode=disable
export POSTGRES_USERS_DB=postgresql://postgres:root@localhost:5432/evogo_users?sslmode=disable
export DATABASE_SAVE_MESSAGES=false
export CLIENT_NAME=evolution
export GLOBAL_API_KEY=***REMOVED_API_KEY***
export WADEBUG=DEBUG
export LOGTYPE=console
export WEBHOOK_FILES=true
export CONNECT_ON_STARTUP=true
export OS_NAME="Evolution GO"
export AMQP_URL=amqp://admin:admin@localhost:5672/default
export AMQP_GLOBAL_ENABLED=false
export WEBHOOK_URL=https://your-webhook-endpoint.example.com
export MINIO_ENABLED=false
export MINIO_ENDPOINT=localhost:9000
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin
export MINIO_BUCKET=evolution-media
export MINIO_USE_SSL=false

cd /home/user/Downloads/evolution-go
./evolution-go