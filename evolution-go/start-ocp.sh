#!/usr/bin/env bash
# ============================================================
#  start-ocp.sh — starts Evolution GO + Pizza Bot together,
#  waits for both ports, prints one status line each.
#
#  Usage (from Windows PowerShell/cmd):
#      wsl -u pizza -e bash /mnt/c/Users/Pizza/Downloads/evolution-go/start-ocp.sh
#
#  Usage (from inside WSL):
#      ~/start-ocp.sh   (if you symlink it)
# ============================================================
export XDG_RUNTIME_DIR=/run/user/$(id -u)
cd "$(dirname "$0")"

echo "Starting services..."

systemctl --user start evolution-go.service

# wait for :8080 (max 20s)
for i in $(seq 1 20); do
  curl -s -m 2 http://localhost:8080/server/ok >/dev/null 2>&1 && break
  sleep 1
done
EVO=$(curl -s -m 3 http://localhost:8080/server/ok 2>/dev/null || echo 'DOWN')

systemctl --user start orange-cheese-pizza-bot.service

# wait for :8090 (max 20s)
for i in $(seq 1 20); do
  curl -s -m 2 http://localhost:8090/health >/dev/null 2>&1 && break
  sleep 1
done
BOT=$(curl -s -m 3 http://localhost:8090/health 2>/dev/null || echo 'DOWN')

echo ""
echo "Evolution GO :8080 -> $EVO"
echo "Pizza Bot    :8090 -> $BOT"

# wait for WhatsApp connection (max 45s)
APIKEY=$(grep '^EVOLUTION_API_KEY=' bot/.env | cut -d= -f2)
WA='connecting...'
for i in $(seq 1 45); do
  INST=$(curl -s -m 4 -H "apikey: $APIKEY" http://localhost:8080/instance/all 2>/dev/null | \
    grep -o '"connected":[a-z]*' | head -1)
  [ "$INST" = '"connected":true' ] && { WA="OCP connected"; break; }
  sleep 1
done
[ "$WA" = "OCP connected" ] || WA="not yet connected ($INST) - check journalctl --user -u evolution-go"
echo "WhatsApp     -> $WA"
