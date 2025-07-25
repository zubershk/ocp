#!/usr/bin/env bash
# Orange Cheese Pizza bot API launcher (Milestone 1)
# Runs the bot from the bot/ directory so migrations resolve,
# against the WSL-local PostgreSQL.
cd "$(dirname "$0")"
export BOT_PORT="${BOT_PORT:-8090}"
export BOT_DATABASE_URL="${BOT_DATABASE_URL:-postgresql://postgres:root@127.0.0.1:5432/orange_cheese_pizza_bot?sslmode=disable}"
exec ./bot-ocp
