# OCP Production Deployment on AWS Free Tier

Deploy Orange Cheese Pizza online so real customers can order — using AWS Free Tier services (~$0 for 12 months).

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Phase 1 — Launch EC2 Instance](#phase-1-launch-ec2-instance)
4. [Phase 2 — Connect & Install Software](#phase-2-connect--install-software)
5. [Phase 3 — Build for Linux](#phase-3-build-for-linux)
6. [Phase 4 — PostgreSQL Setup](#phase-4-postgresql-setup)
7. [Phase 5 — Environment Files](#phase-5-environment-files)
8. [Phase 6 — Run as Systemd Services](#phase-6-run-as-systemd-services)
9. [Phase 7 — Frontend Hosting](#phase-7-frontend-hosting)
10. [Phase 8 — Domain & SSL](#phase-8-domain--ssl)
11. [Phase 9 — WhatsApp / Evolution GO](#phase-9-whatsapp--evolution-go)
12. [Phase 10 — Firewall & Security](#phase-10-firewall--security)
13. [Phase 11 — AWS Free Tier Cost Warnings](#phase-11-aws-free-tier-cost-warnings)
14. [Quick Start Command Summary](#quick-start-command-summary)
15. [Troubleshooting](#troubleshooting)

---

## Overview

OCP is a full-stack food ordering platform:

| Component | Technology | Runs On |
|-----------|-----------|---------|
| Bot API | Go 1.25 + Gin | EC2 t2.micro/t3.micro |
| Frontend | React 19 + Vite | EC2 (Nginx) or Vercel |
| Database | PostgreSQL 16 | EC2 (self-hosted) or RDS |
| WhatsApp Gateway | Evolution GO | EC2 |
| Campaign Runner | Express.js | EC2 (optional) |
| Reverse Proxy | Nginx | EC2 |
| SSL | Certbot / ACM | Free |

**Free Tier eligibility:** EC2 t2.micro/t3.micro = 750 hours/month (enough for 24/7 for 12 months).

---

## Prerequisites

- AWS account with Free Tier eligibility
- Credit card on file (AWS requires this for identity verification, but you won't be charged within Free Tier limits)
- Local machine with Git, Go, Node.js (for building Linux binaries before pushing, or build directly on EC2)

---

## Phase 1 — Launch EC2 Instance

1. **AWS Console** → **EC2** → **Launch Instance**
2. **Name:** `ocp-server`
3. **AMI:** Ubuntu 22.04 LTS (Free tier eligible)
4. **Instance type:** `t2.micro` or `t3.micro` (Free tier eligible)
5. **Key pair:** Create new → download `.pem` file (**keep this safe — you cannot recover it**)
6. **Network settings:**
   - Auto-assign public IP: **Enable**
   - Security group: Create new → allow:
     - SSH (22) from your IP
     - HTTP (80) from 0.0.0.0/0
     - HTTPS (443) from 0.0.0.0/0
     - Custom TCP 8090 (Bot API) from 0.0.0.0/0 *(or restrict to your IP)*
     - Custom TCP 8080 (Evolution GO) from your IP only
     - Custom TCP 3001 (Campaign runner) from 0.0.0.0/0
7. **Storage:** 8 GB GP3 (Free tier covers up to 30 GB)
8. **Launch**

> **Note:** Note down the Public IPv4 address after launch — you'll need it for DNS and SSH.

---

## Phase 2 — Connect & Install Software

```bash
# From your local machine
ssh -i /path/to/your-key.pem ubuntu@<YOUR-EC2-PUBLIC-IP>

# On the server
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx postgresql postgresql-contrib build-essential

# Install Go
wget https://go.dev/dl/go1.25.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.25.0.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# Install Node.js (v24 LTS)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# Clone the repository
git clone https://github.com/zubershk/ocp.git
cd ocp
```

---

## Phase 3 — Build for Linux

**Critical:** EC2 runs Linux. If you built binaries on Windows, they won't run. Build for Linux:

### Option A: Build on EC2 (recommended — simplest)

```bash
cd ocp

# Backend
cd bot
GOOS=linux GOARCH=amd64 go build -o bot-ocp-linux .
cd ..

# Evolution GO
cd evolution-go
GOOS=linux GOARCH=amd64 go build -o evolution-go-linux ./cmd/evolution-go/
cd ..

# Frontend
cd frontend
npm ci --omit=dev
npm run build
cd ..

# Campaign runner (optional)
cd campaign-runner
npm ci --omit=dev
npm run build
cd ..

# Make binaries executable
chmod +x bot/bot-ocp-linux evolution-go/evolution-go-linux
```

### Option B: Build locally & push

```powershell
# On Windows
cd bot
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -o bot-ocp-linux .
cd ..

cd evolution-go
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -o evolution-go-linux ./cmd/evolution-go/
cd ..

cd frontend
npm ci --omit=dev
npm run build
cd ..

git add .
git commit -m "build: add Linux binaries for AWS"
git push origin master
```

Then on EC2: `git pull` and the binaries are already there.

---

## Phase 4 — PostgreSQL Setup

**Option A: Self-hosted on EC2 (Recommended — free forever)**

```bash
# Create databases
sudo -u postgres psql -c "CREATE DATABASE ocp;"
sudo -u postgres psql -c "CREATE USER ocp WITH PASSWORD '<strong-password>';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ocp TO ocp;"

# Evolution databases
sudo -u postgres psql -c "CREATE DATABASE evogo_auth OWNER ocp;"
sudo -u postgres psql -c "CREATE DATABASE evogo_users OWNER ocp;"

# Apply migrations (in order)
cd ocp/bot/migrations
for f in *.sql; do
  sudo -u ocp psql -d ocp -f "$f"
done
cd ../..
```

**Option B: RDS db.t2.micro** (Free tier: 750 hours/month for 12 months, then ~$15-25/month)

Use the RDS console to create a PostgreSQL instance, then update `BOT_DATABASE_URL` in `bot/.env`.

---

## Phase 5 — Environment Files

### `bot/.env`

```env
BOT_PORT=8090
BOT_ADMIN_KEY=<generate-secure-32-hex>
BOT_DATABASE_URL=postgresql://ocp:<password>@localhost:5432/ocp?sslmode=disable

EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=<secure-hex>
EVOLUTION_INSTANCE=restaurant
EVOLUTION_INSTANCE_TOKEN=<from-Evolution-GO-instance>
EVOLUTION_WEBHOOK_SECRET=<secure-hex>

OTP_PEPPER=<secure-hex>
LOG_LEVEL=info

INITIAL_ORG_NAME=Your Pizza Shop
INITIAL_ORG_SLUG=your-pizza-shop
INITIAL_CURRENCY=INR
INITIAL_TIMEZONE=Asia/Kolkata
INITIAL_OUTLET_NAME=Main Outlet
```

### `evolution-go/.env`

```env
SERVER_PORT=8080
POSTGRES_AUTH_DB=postgresql://ocp:<password>@localhost:5432/evogo_auth?sslmode=disable
POSTGRES_USERS_DB=postgresql://ocp:<password>@localhost:5432/evogo_users?sslmode=disable
DATABASE_SAVE_MESSAGES=false
CLIENT_NAME=evolution
GLOBAL_API_KEY=<secure-hex>
WADEBUG=INFO
LOGTYPE=console
WEBHOOK_FILES=true
CONNECT_ON_STARTUP=true
OS_NAME=Evolution GO
```

### `frontend/.env`

```env
VITE_API_BASE_URL=https://api.yourdomain.com
```

*(Use `http://<EC2-IP>:8090` before you have a domain)*

### Generate secure hex secrets

```bash
# On the server or locally
openssl rand -hex 16
# Run 5x for: BOT_ADMIN_KEY, EVOLUTION_API_KEY, EVOLUTION_WEBHOOK_SECRET, OTP_PEPPER, GLOBAL_API_KEY
```

---

## Phase 6 — Run as Systemd Services

Create systemd service files so everything survives reboots:

### Bot service

```bash
sudo tee /etc/systemd/system/ocp-bot.service <<EOF
[Unit]
Description=OCP Bot API
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/ocp/bot
ExecStart=/home/ubuntu/ocp/bot/bot-ocp-linux
Environment=BOT_PORT=8090
Environment=BOT_DATABASE_URL=postgresql://ocp:<password>@localhost:5432/ocp?sslmode=disable
Environment=EVOLUTION_WEBHOOK_SECRET=<secret>
Environment=OTP_PEPPER=<pepper>
Environment=EVOLUTION_INSTANCE_TOKEN=<instance-token>
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

### Evolution GO service

```bash
sudo tee /etc/systemd/system/ocp-evolution.service <<EOF
[Unit]
Description=Evolution GO WhatsApp Gateway
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/ocp/evolution-go
ExecStart=/home/ubuntu/ocp/evolution-go/evolution-go-linux -dev
Environment=GLOBAL_API_KEY=<secure-hex>
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

### Enable & start

```bash
sudo systemctl daemon-reload
sudo systemctl enable ocp-bot ocp-evolution
sudo systemctl start ocp-bot ocp-evolution

# Check status
sudo systemctl status ocp-bot
sudo systemctl status ocp-evolution

# Verify health
curl http://localhost:8090/health
# Should return: {"status":"ok"}
```

---

## Phase 7 — Frontend Hosting

### Option A: Serve from EC2 via Nginx (Simplest — all on one server)

```bash
sudo cp -r /home/ubuntu/ocp/frontend/dist/* /var/www/html/

sudo tee /etc/nginx/sites-available/default <<EOF
server {
    listen 80 default_server;
    server_name _;
    root /var/www/html;
    index index.html;
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Option B: Vercel (Free, separate from EC2)

1. Install Vercel CLI: `npm i -g vercel`
2. `cd frontend && vercel --prod`
3. Set `VITE_API_BASE_URL` in Vercel dashboard to your API URL
4. Redeploy

---

## Phase 8 — Domain & SSL

### Buy a domain
- Route 53, Namecheap, Cloudflare (~$12/year)
- Or use EC2 Public IP directly (not recommended for production)

### Route 53 DNS records

| Record | Type | Value |
|--------|------|-------|
| `yourdomain.com` | A | `<EC2-Public-IP>` |
| `www.yourdomain.com` | CNAME | `yourdomain.com` |
| `api.yourdomain.com` | A | `<EC2-Public-IP>` |
| `evo.yourdomain.com` | A | `<EC2-Public-IP>` |

### SSL with Certbot (Free)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

Certbot auto-configures Nginx and sets up auto-renewal.

### Update Nginx for HTTPS

Certbot should do this automatically. Verify:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Phase 9 — WhatsApp / Evolution GO (Required for Real OTP Delivery)

**Without this step, OTPs only appear in `bot/bot.log.err` (dev mode) and are NOT sent to phones.**

1. Open `http://<EC2-PUBLIC-IP>:8080/manager`
2. Login with `GLOBAL_API_KEY` from `evolution-go/.env`
3. **Activate license** — register an email or set `EVOLUTION_OPERATOR_EMAIL`
4. **Create instance**: POST `/instance/create`
5. **Connect WhatsApp**: GET `/instance/qr` → scan QR with your phone (WhatsApp → Linked Devices → Link a Device)
6. Wait until status shows **LoggedIn: True**
7. Copy the **instance token**
8. Add to `bot/.env`: `EVOLUTION_INSTANCE_TOKEN=<your-instance-token>`
9. `sudo systemctl restart ocp-bot`

Now OTPs are delivered to real WhatsApp phones. ✅

---

## Phase 10 — Firewall & Security

### AWS Security Group (EC2 Console)

| Port | Service | Source |
|------|---------|--------|
| 22 | SSH | Your IP only |
| 80 | HTTP | 0.0.0.0/0 |
| 443 | HTTPS | 0.0.0.0/0 |
| 8080 | Evolution GO | Your IP only (admin) |
| 8090 | Bot API | 0.0.0.0/0 (or restrict) |
| 3001 | Campaign | 0.0.0.0/0 |

### OS Firewall (ufw)

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8090/tcp
sudo ufw allow 3001/tcp
sudo ufw enable
```

### Security Checklist

- [ ] `.env` files have `600` permissions
- [ ] `BOT_ADMIN_KEY` is strong (32+ hex chars)
- [ ] `EVOLUTION_WEBHOOK_SECRET` matches Evolution GO config
- [ ] Evolution GO manager restricted to your IP
- [ ] SSL certificate active
- [ ] Database backups scheduled
- [ ] Log rotation configured
- [ ] AWS Billing Alert set to $0 (see Phase 11)

---

## Phase 11 — AWS Free Tier Cost Warnings

⚠️ **Set up AWS Billing Alerts immediately:**

1. AWS Console → **Billing** → **Budgets** → **Create budget**
2. Set monthly budget to $0.00
3. Set alert threshold to 1% (or $0.01)
4. This prevents surprise bills after 12 months

### After 12 months (estimated monthly cost)

| Service | Cost |
|---------|------|
| EC2 t3.micro | ~$8-15 |
| PostgreSQL (self-hosted on EC2) | $0 (already running) |
| S3 + CloudFront | ~$0-2 |
| Route 53 | ~$0.50 |
| Domain (~$12/year) | ~$1 |
| **Total** | **~$10-20/month** |

**If you use RDS instead of self-hosted PostgreSQL:** +$15-25/month

**To stay free forever:** Self-host PostgreSQL on EC2 (Phase 4, Option A).

---

## Quick Start Command Summary

```bash
# On EC2
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx postgresql postgresql-contrib build-essential
wget https://go.dev/dl/go1.25.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.25.0.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

git clone https://github.com/zubershk/ocp.git
cd ocp

# Build
cd bot && GOOS=linux GOARCH=amd64 go build -o bot-ocp-linux . && cd ..
cd evolution-go && GOOS=linux GOARCH=amd64 go build -o evolution-go-linux ./cmd/evolution-go/ && cd ..
cd frontend && npm ci --omit=dev && npm run build && cd ..

# Database
sudo -u postgres psql -c "CREATE DATABASE ocp;"
sudo -u postgres psql -c "CREATE USER ocp WITH PASSWORD '<password>';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ocp TO ocp;"
sudo -u postgres psql -c "CREATE DATABASE evogo_auth OWNER ocp;"
sudo -u postgres psql -c "CREATE DATABASE evogo_users OWNER ocp;"
cd bot/migrations
for f in *.sql; do sudo -u ocp psql -d ocp -f "$f"; done
cd ../..

# Configure .env files (see Phase 5)

# Systemd services (see Phase 6)
sudo systemctl daemon-reload
sudo systemctl enable ocp-bot ocp-evolution
sudo systemctl start ocp-bot ocp-evolution

# Nginx (see Phase 7)
sudo cp -r frontend/dist/* /var/www/html/
# ... configure nginx ...

# Certbot (see Phase 8)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com

# Verify
curl http://localhost:8090/health
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Bot won't start | Check `BOT_DATABASE_URL` and PostgreSQL is running (`sudo systemctl status postgresql`) |
| Frontend blank | Check `VITE_API_BASE_URL` points to correct API URL; check Nginx config |
| OTP not arriving | Check `bot/bot.log.err` for dev-mode code; connect Evolution GO WhatsApp instance |
| Nginx 502 | Verify backend service is running (`sudo systemctl status ocp-bot`) |
| Permission denied on .bin | `chmod +x bot-ocp-linux evolution-go-linux` |
| SSL cert failed | Verify DNS points to EC2 IP and ports 80/443 are open |

---

## Customer Experience After Deployment

- **Customers visit** `https://yourdomain.com`
- **Browse menu**, filter by category/dietary, search with autocomplete
- **Place order** with phone OTP login (code arrives on WhatsApp)
- **Track order** in real-time via `/r/order/<id>` with live status updates
- **Rate delivered orders** with per-item reviews
- **Reorder** from account page `/r/account`
- **Admin** manages everything at `https://api.yourdomain.com/admin`

---

## Files in This Repo Related to Deployment

| File | Purpose |
|------|---------|
| `AWS_DEPLOYMENT.md` | This guide |
| `Deploy-Windows.ps1` | Native Windows deployment script |
| `DEPLOYMENT-Windows.md` | Windows deployment guide |
| `setup.sh` | Linux setup wizard (interactive) |
| `install.sh` | Quick installer (clones repo + runs setup) |
| `docker-compose.yml` | Docker Compose (alternative deployment) |
| `Vulnscan_results.md` | Security audit report |

---

*Last updated: November 2026*  
*OCP — Orange Cheese Pizza • zubershk/ocp@master*