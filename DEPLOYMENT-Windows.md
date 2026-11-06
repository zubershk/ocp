# OCP Production Deployment Guide (Native Windows)

Production-ready deployment of Orange Cheese Pizza on Windows without WSL2 or Docker.

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Bot API | 8090 | Go backend — orders, auth, admin, WhatsApp webhook |
| Frontend | 5173 | React/Vite customer-facing site |
| Campaign Runner | 3001 | Express.js WhatsApp marketing campaigns |
| PostgreSQL | 5432 | Database (already installed) |
| Evolution GO | 8080 | WhatsApp gateway (required for real OTP delivery) |
| Nginx | 80/443 | Reverse proxy + SSL (optional but recommended) |

---

## 1. Prerequisites (Native Windows)

Install these once on the server:

| Software | Version | Download |
|----------|---------|----------|
| Node.js | 24.x LTS | https://nodejs.org/ |
| Go | 1.25+ | https://go.dev/dl/ |
| PostgreSQL | 16 | https://www.postgresql.org/download/windows/ |
| Nginx (optional) | 1.24+ | https://nginx.org/en/download.html |
| Git | 2.x | https://git-scm.com/download/win |

Add to PATH:
- `C:\Program Files\nodejs\`
- `C:\Program Files\Go\bin\`
- `C:\Program Files\PostgreSQL\16\bin\`

---

## 2. Clone the Repository

```powershell
git clone https://github.com/zubershk/ocp.git
cd ocp
git checkout master
```

---

## 3. Configure Environment (`.env`)

Create `bot/.env` and `frontend/.env` from the examples. **Never commit real secrets.**

### `bot/.env` — Backend configuration

```powershell
# Server
BOT_PORT=8090
BOT_ADMIN_KEY=<generate-with-openssl-rand-hex-16>

# Database (PostgreSQL)
BOT_DATABASE_URL=postgresql://ocp:<strong-password>@localhost:5432/ocp?sslmode=disable

# Evolution GO (WhatsApp gateway)
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=<generate-with-openssl-rand-hex-16>
EVOLUTION_INSTANCE=<instance-name>
EVOLUTION_INSTANCE_TOKEN=<from-Evolution-GO-instance>
EVOLUTION_WEBHOOK_SECRET=<generate-with-openssl-rand-hex-16>

# Auth
OTP_PEPPER=<generate-with-openssl-rand-hex-16>

# Security
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
LOG_LEVEL=info

# Tenant bootstrap (first-run only)
INITIAL_ORG_NAME=Your Pizza Shop
INITIAL_ORG_SLUG=your-pizza-shop
INITIAL_CURRENCY=INR
INITIAL_TIMEZONE=Asia/Kolkata
INITIAL_OUTLET_NAME=Main Outlet
```

### `frontend/.env` — Frontend configuration

```powershell
VITE_API_BASE_URL=https://api.yourdomain.com
```

### Generate secrets

```powershell
# Run in PowerShell to generate secure secrets
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes(16) | ForEach-Object { $_.ToString("X2") } -join ''
# Run 4x for: BOT_ADMIN_KEY, EVOLUTION_API_KEY, EVOLUTION_WEBHOOK_SECRET, OTP_PEPPER
```

---

## 4. Database Setup

Create the `ocp` database and run migrations:

```powershell
# Create database (run as postgres user)
$env:PGPASSWORD='postgres'
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE ocp;"
psql -U postgres -h localhost -p 5432 -c "CREATE USER ocp WITH PASSWORD '<strong-password>';"
psql -U postgres -h localhost -p 5432 -c "GRANT ALL PRIVILEGES ON DATABASE ocp TO ocp;"

# Run migrations
cd bot
$env:BOT_DATABASE_URL='postgresql://ocp:<strong-password>@localhost:5432/ocp?sslmode=disable'
# Migrations are in bot/migrations/ — apply in order (001 to latest)
```

Apply migrations in order:
```powershell
Get-ChildItem bot/migrations/*.sql | Sort-Object Name | ForEach-Object {
    $env:PGPASSWORD='<strong-password>'
    psql -U ocp -h localhost -p 5432 -d ocp -f $_.FullName
}
```

---

## 5. Build All Services

### Backend (Go)

```powershell
cd C:\Users\HOME\Downloads\ocp\bot
go build -o bot-ocp.exe .
```

Output: `bot/bot-ocp.exe`

### Frontend (Vite)

```powershell
cd C:\Users\HOME\Downloads\ocp\frontend
npm ci --omit=dev
npm run build
```

Output: `frontend/dist/` — static files served by Nginx or any static host.

### Campaign Runner

```powershell
cd C:\Users\HOME\Downloads\ocp\campaign-runner
npm ci --omit=dev
npm run build
```

Output: `campaign-runner/dist/` or start with `npm start`.

### Evolution GO

```powershell
cd C:\Users\HOME\Downloads\ocp\evolution-go
go build -o evolution-go.exe ./cmd/evolution-go/
```

---

## 6. Process Management (Windows Services)

Use **NSSM** (Non-Sucking Service Manager) to run services as Windows services:

```powershell
# Install NSSM: https://nssm.cc/download
nssm install ocp-bot "C:\Users\HOME\Downloads\ocp\bot\bot-ocp.exe"
nssm set ocp-bot AppDirectory "C:\Users\HOME\Downloads\ocp\bot"
nssm set ocp-bot AppEnvironmentExtra BOT_DATABASE_URL=postgresql://...
nssm start ocp-bot

nssm install ocp-campaign "node.exe"
nssm set ocp-campaign AppDirectory "C:\Users\HOME\Downloads\ocp\campaign-runner"
nssm set ocp-campaign AppParameters "server.js"
nssm start ocp-campaign

nssm install ocp-evolution "C:\Users\HOME\Downloads\ocp\evolution-go\evolution-go.exe"
nssm set ocp-evolution AppDirectory "C:\Users\HOME\Downloads\ocp\evolution-go"
nssm set ocp-evolution AppParameters "-dev"
nssm start ocp-evolution
```

---

## 7. Nginx Reverse Proxy + SSL

Install Nginx and configure:

```nginx
# C:\nginx\conf\nginx.conf
events { worker_connections 1024; }

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile        on;
    keepalive_timeout  65;

    # Frontend (customer site)
    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com;
        location / {
            root C:/Users/HOME/Downloads/ocp/frontend/dist;
            index index.html;
            try_files $uri $uri/ /index.html;
        }
    }

    # Bot API
    server {
        listen 80;
        server_name api.yourdomain.com;
        location / {
            proxy_pass http://127.0.0.1:8090;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }

    # Campaign Runner
    server {
        listen 80;
        server_name campaigns.yourdomain.com;
        location / {
            proxy_pass http://127.0.0.1:3001;
            proxy_set_header Host $host;
        }
    }

    # Evolution GO (admin only — restrict by IP in production)
    server {
        listen 80;
        server_name evo.yourdomain.com;
        location / {
            proxy_pass http://127.0.0.1:8080;
            # Add IP allowlist here for security
        }
    }
}
```

### SSL with Certbot (Let's Encrypt)

```powershell
# Install Certbot for Windows: https://certbot.eff.org/instructions?ws=other&os=windows
certbot certonly --standalone -d yourdomain.com -d api.yourdomain.com -d campaigns.yourdomain.com
```

Then update Nginx to listen on 443 with the SSL certificates.

---

## 8. WhatsApp / Evolution GO Setup (Required for Real OTP Delivery)

1. Start Evolution GO: `evolution-go.exe -dev`
2. Open `http://localhost:8080/manager`
3. Login with `GLOBAL_API_KEY` from `.env`
4. Activate license (register email or set `EVOLUTION_OPERATOR_EMAIL`)
5. Create instance: POST `/instance/create` with your instance name and token
6. Connect instance: GET `/instance/qr` → scan QR with WhatsApp on your phone
7. Copy the instance token to `bot/.env` as `EVOLUTION_INSTANCE_TOKEN`
8. Restart the bot service

**Until WhatsApp is connected, OTPs are logged to `bot/bot.log.err`** (dev mode fallback).

---

## 9. Firewall Rules (Windows)

```powershell
# Allow HTTP/HTTPS
New-NetFirewallRule -DisplayName "OCP HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "OCP HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

# Allow API (if accessed directly)
New-NetFirewallRule -DisplayName "OCP Bot API" -Direction Inbound -Protocol TCP -LocalPort 8090 -Action Allow

# Allow Campaign Runner
New-NetFirewallRule -DisplayName "OCP Campaign" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
```

---

## 10. First-Run Setup

1. Start PostgreSQL service
2. Start bot service → runs migrations automatically on startup
3. Start frontend (served by Nginx)
4. Start Evolution GO → connect WhatsApp instance
5. Open `https://yourdomain.com` → place a test order
6. Open `https://api.yourdomain.com/admin` → login with `BOT_ADMIN_KEY`
7. Configure: brand, menu, crusts, contact, footer, outlets, delivery hours

---

## 11. Daily Operations

```powershell
# Check service status
nssm status ocp-bot
nssm status ocp-campaign
nssm status ocp-evolution

# View logs
Get-Content C:\Users\HOME\Downloads\ocp\bot\bot.log -Tail 20
Get-Content C:\Users\HOME\Downloads\ocp\bot\bot.log.err -Tail 20

# Restart services
nssm restart ocp-bot
nssm restart ocp-campaign
```

---

## 12. Backup Strategy

```powershell
# Database backup (daily)
$date = Get-Date -Format "yyyyMMdd"
pg_dump -U ocp -h localhost -p 5432 -d ocp > "C:\Backups\ocp_$date.sql"

# Uploads backup
Copy-Item -Recurse C:\Users\HOME\Downloads\ocp\bot\uploads C:\Backups\uploads_$date
```

---

## 13. Security Checklist for Production

- [ ] `.env` files have `600` permissions (readable only by owner)
- [ ] `BOT_ADMIN_KEY` is strong (32+ hex chars)
- [ ] `EVOLUTION_WEBHOOK_SECRET` is set and matches Evolution GO config
- [ ] Nginx rate limiting on `/api/auth/send-otp` (3 per minute)
- [ ] Nginx rate limiting on `/api/orders` (20 per minute)
- [ ] SSL certificates active (Let's Encrypt)
- [ ] Evolution GO manager access restricted to admin IPs
- [ ] Database backups scheduled
- [ ] Log rotation configured for `bot.log` and `bot.log.err`
- [ ] `GLOBAL_API_KEY` in Evolution GO `.env` is not the default value

---

## 14. Customer Experience Summary

Once deployed:

- **Customers visit** `https://yourdomain.com`
- **Browse menu**, filter by category/dietary, search with autocomplete
- **Place order** with phone OTP login (code arrives on WhatsApp or in dev-mode log)
- **Track order** in real-time via `/r/order/<id>` with live status updates
- **Rate delivered orders** with per-item reviews
- **Reorder** from account page `/r/account`
- **Admin** manages everything at `https://api.yourdomain.com/admin`

---

## 15. Troubleshooting

| Issue | Fix |
|-------|-----|
| OTP not arriving | Check `bot/bot.log.err` for dev-mode code; connect Evolution GO WhatsApp instance |
| Bot won't start | Check `BOT_DATABASE_URL` and PostgreSQL is running |
| Frontend blank | Check `VITE_API_BASE_URL` points to correct API URL |
| Campaign runner fails | Check `campaign-runner/.env` and Node modules installed |
| Nginx 502 | Verify backend service is running on expected port |
