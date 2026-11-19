# Orange Cheese Pizza — Online Ordering System

[![CI](https://github.com/zubershk/ocp/actions/workflows/ci.yml/badge.svg)](https://github.com/zubershk/ocp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](docker-compose.yml)
[![Deploy docs](https://img.shields.io/badge/docs-deployment-blue.svg)](docs/DEPLOYMENT.md)

Full-stack food ordering platform with WhatsApp integration, real-time order management, a production-ready admin dashboard, and a WhatsApp marketing campaign runner. Built for small food businesses that want an online ordering presence without paying third-party commissions.

**The storefront home page** (`/r`) — customers browse categories and popular items, with live prices and ratings:

![OCP storefront home page showing pizza categories and popular items](docs/screenshots/storefront-home.png)

### Quick Start

```bash
git clone https://github.com/zubershk/ocp.git && cd ocp && bash setup.sh && docker compose up -d
```

Or install to a custom directory:

```bash
curl -fsSL https://raw.githubusercontent.com/zubershk/ocp/master/install.sh | bash
```

### Deploy to Cloud

OCP needs always-on processes with persistent Postgres connections — PostgreSQL `LISTEN/NOTIFY` SSE fan-out, advisory phone locks, and background broadcast workers cannot run in a pure serverless frontend deploy. Three production paths are supported; pick the one that suits you:

| Option | Best for | Cost at low traffic | Guide |
|--------|----------|---------------------|-------|
| **Northflank free Sandbox (recommended)** — bot + Evolution GO + managed Postgres; frontend on Vercel; campaign runner omitted | Free, managed, zero-ops, WhatsApp included | ~$17.37/mo of resources under the $20 Sandbox cap; frontend free on Vercel | [northflank/README.md](northflank/README.md) · [DEPLOYMENT.md § Option 0](docs/DEPLOYMENT.md) |
| **Hybrid** — Vercel frontend + Fly.io backend + Neon/Supabase + R2 (Fly backend is *legacy*) | Managed infra / global edge | Vercel/Neon/R2 free tiers; Fly has no free tier | [DEPLOYMENT.md § Option 1](docs/DEPLOYMENT.md) |
| **Single VPS** — Docker Compose + Caddy with automatic TLS | Full control, one box | $0 on Oracle always-free ARM, else ~$5–10/mo | [DEPLOYMENT.md § Option 2](docs/DEPLOYMENT.md) · [deploy/vps/](deploy/vps/) |

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/zubershk/ocp&env=VITE_API_BASE_URL)

The frontend deploys to Vercel for Options 0 and 1. Import the repository at the **root** (the root `vercel.json` builds `frontend/`) and set `VITE_API_BASE_URL` in the Vercel project *before* the build — Vite inlines it at build time.

**CI deploys are opt-in:** the `Deploy frontend to Vercel` and `Deploy backend to Fly.io` workflows are skipped unless `DEPLOY_VERCEL_ENABLED` / `DEPLOY_FLY_ENABLED` are set to `true` (with the matching `VERCEL_*` / `FLY_API_TOKEN` secrets), so a push never fails just because deploy credentials are absent. Northflank is the exception — it auto-deploys on push to `master` via native Git integration.

Before go-live, work through the [production checklist](docs/PRODUCTION_CHECKLIST.md), run the [1000-user load test](docs/LOAD_TEST.md), and review the [infrastructure validator](#infrastructure-validation).

---

## What This Does

The open-source landing page (`/`):

![OCP landing page](docs/screenshots/landing.png)
*Open-source, free-forever landing page with links to the live demo and docs.*

**For customers:**
- Browse the full menu with real product photos, prices, and dietary info
- Filter by category, spice level, budget, or family packs
- Search with autocomplete — recent searches saved, popular items highlighted, keyboard navigation
- Customise pizzas (size, crust, toppings) and see price updates live
- Place orders with address autocomplete (Nominatim-powered) and delivery radius check
- Pay by cash or UPI on arrival
- Track order status in real-time via Server-Sent Events (push, no polling) with a visual timeline and per-step timestamps
- Rate delivered orders with overall + per-item stars (verified purchase, moderated before going public)
- Browse verified customer reviews with live rating aggregates on every product
- WhatsApp OTP login — no passwords, just a 6-digit code
- View order history and reorder past orders
- PWA support — works offline, installs to home screen, push notification ready

**For the restaurant:**
- Real-time order dashboard with an SSE event stream and sound alerts
- Menu management — add/edit/delete items, upload product photos, manage categories and crust variants
- Order lifecycle: New → Confirmed → Preparing → Ready → Out for Delivery → Delivered (with cancel)
- WhatsApp notifications sent automatically on every status change
- Customer chat via WhatsApp — reads incoming messages, persists conversation history, send replies from admin
- Team management with role-based access (owner, manager, kitchen, viewer)
- Analytics dashboard with daily/weekly/monthly sales and order stats
- Restaurant settings (name, hours, delivery fee, tax) editable from admin
- Audit log tracking every admin action with timestamp and IP
- Rate limiting on auth and order endpoints to prevent abuse
- Broadcast messages to customers (max 200 recipients per batch, 4096 char limit)

**Fully configurable — every detail is editable from the admin dashboard:**

- **Brand settings** — logo, favicon, primary/secondary/accent colors, heading and body fonts with live preview
- **Content pages** — About, Terms, Privacy, FAQ managed via CMS editor with meta tags
- **Offers & promotions** — create deals with badges, codes, discount amounts, min order; live on the homepage strip and Offers page
- **Banner carousel** — add/edit home page banners with background colors, CTA buttons and images
- **Family packs page** — promo card text plus pack list (titles, subtitles, menu-item slugs, active flags); prices stay live from menu items
- **Reviews moderation** — approve or hide verified-purchase reviews before they go public
- **Crust management** — full admin UI: create/edit/delete crusts with per-size extra charges
- **Menu item flags** — spicy, Jain, new badge, availability, and hide-crust-selector for fixed bundles
- **SEO settings** — meta title, description, OG image, favicon
- **Social links** — Instagram, Facebook, Twitter, YouTube, WhatsApp
- **Footer** — copyright text, tagline, delivery hours, outlet info — all dynamic
- **Bot message templates** — every WhatsApp response stored in DB, editable via admin with live WhatsApp preview, variable reference ({name}, {order_number}, {brand_name}, etc.), per-message reset to defaults
- **Business configuration** — sizes, payment methods, category icons, order prefix, currency, delivery fee, min order — all configurable for any business type
- **Menu categories** — names, descriptions, sort order, icons configurable from admin

**WhatsApp Campaign Runner:**
- Bulk send WhatsApp messages to customers
- Campaign wizard with WhatsApp-style live preview
- Customer segments via tags (regular, vip, etc.)
- Message templates with merge tags ({name}, {discount}, {brand_name})
- Media library for campaign images
- Scheduled campaigns with auto-trigger
- Live progress tracking with per-recipient status
- Connects to the Go bot — no direct Evolution GO access needed

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.27.4 + Gin web framework |
| Database | PostgreSQL 16.4 (alpine, compose) — requires 16+ |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS + shadcn/ui (admin dashboard) |
| State | React Context + TanStack Query |
| Animations | GSAP (GreenSock) |
| WhatsApp | Evolution GO (self-hosted WhatsApp API) |
| Campaigns | Express.js + React (standalone tool) |
| PWA | Service Worker + Web Manifest + Push Notifications |

**Why these choices:**
- **Go + Gin** — fast, single binary deployment, great for APIs handling concurrent orders
- **PostgreSQL** — reliable, handles concurrent writes well, runs migrations cleanly
- **React 19 + Vite** — instant HMR, type safety with TypeScript, fast dev cycle
- **Tailwind CSS** — consistent design system without shipping bloated CSS
- **TanStack Query** — server state, caching, polling for real-time order updates
- **GSAP** — smooth scroll-triggered animations on the customer site
- **Evolution GO** — self-hosted WhatsApp API, source included, no vendor dependency
- **Express.js** — campaign runner is a separate tool, doesn't bloat the Go backend

---

## Project Structure

```
Tech-OCP/
├── bot/                          # Go backend (OCP API server)
│   ├── main.go                   # Entry point, routes, graceful shutdown
│   ├── config/config.go          # Environment variable loading
│   ├── database/database.go      # PostgreSQL connection pool
│   ├── models/models.go          # Data structures
│   ├── handlers/
│   │   ├── api_handler.go        # Public menu/order API, CORS, security headers
│   │   ├── webhook_handler.go    # Evolution GO WhatsApp webhook
│   │   ├── auth_handler.go       # WhatsApp OTP login
│   │   ├── site_settings_handler.go  # Site settings, pages, categories, offers, banners, packs API
│   │   ├── review_handler.go     # Verified-purchase reviews + moderation
│   │   ├── rate_limit.go         # Shared Postgres + write-only global limiter
│   │   ├── public_cache.go       # Short-TTL read-through cache for public GETs
│   │   ├── metrics.go            # Prometheus /metrics endpoint
│   │   └── etag.go               # Strong ETag / 304 revalidation
│   ├── admin/
│   │   └── admin_handler.go      # Admin CRUD, analytics, team, audit, broadcast
│   ├── services/
│   │   ├── menu_service.go       # Menu CRUD, item lookups
│   │   ├── order_service.go      # WhatsApp order processing
│   │   ├── website_order_service.go  # Web order creation, pricing, idempotency
│   │   ├── customer_service.go   # Customer lookup, phone canonicalization
│   │   ├── customer_auth_service.go  # OTP/session management (transactional)
│   │   ├── conversation_engine.go    # WhatsApp conversation state machine
│   │   ├── conversation_handlers.go  # Conversation action handlers
│   │   ├── bot_message_service.go    # Template rendering engine (DB + fallback)
│   │   ├── bot_message_defaults.go   # Compiled-in default messages
│   │   ├── business_config.go        # Sizes, payments, icons from DB
│   │   ├── live_chat_service.go  # WhatsApp message persistence
│   │   ├── evolution_client.go   # Evolution GO HTTP client
│   │   ├── whatsapp_cart_service.go  # Persistent WhatsApp cart
│   │   ├── pubsub.go             # PostgreSQL LISTEN/NOTIFY cross-replica SSE fan-out
│   │   ├── phone_lock.go         # Advisory per-phone locks (duplicate-order prevention)
│   │   ├── storage.go            # Injectable local/S3 object storage provider
│   │   ├── storage_s3_test.go    # Mock-S3 put/list/delete tests
│   │   ├── image_policy.go       # Image URL allowlist / SSRF guards
│   │   └── scale_config.go       # Env-driven scale knobs
│   ├── scripts/
│   │   └── validate_infra/        # Daemon-free config validator (CI infra-config job)
│   ├── migrations/               # SQL migration files (001→051)
│   ├── uploads/                  # Menu item product photos
│   ├── .env.example              # Environment template
│   └── go.mod / go.sum
├── frontend/                     # React frontend (customer site + admin)
│   ├── src/
│   │   ├── pages/                # 20+ pages (see full list below)
│   │   ├── components/           # Reusable UI components
│   │   │   ├── ui/               # 18 components (see full list below)
│   │   │   └── layout/           # Navbar, Footer
│   │   ├── context/              # Cart, Toast, Auth, Restaurant, SiteSettings, Crusts
│   │   ├── hooks/                # GSAP, geolocation, flying cart, push notifications
│   │   ├── services/             # API calls, cart persistence
│   │   ├── data/                 # Static fallback data (~100+ menu items, offers, blog)
│   │   └── types/                # TypeScript interfaces
│   ├── public/                   # PWA manifest, service worker, offline page, favicon
│   ├── vercel.json               # Vercel deployment config with security headers
│   ├── package.json
│   └── vite.config.ts
├── campaign-runner/              # WhatsApp marketing campaign tool
│   ├── server/
│   │   └── index.js              # Express API — customers, campaigns, templates
│   ├── src/
│   │   └── App.jsx               # React dashboard — 6 tabs
│   ├── package.json
│   └── vite.config.js
├── evolution-go/                 # WhatsApp API gateway (Evolution GO)
│   ├── cmd/evolution-go/main.go  # Entry point
│   ├── pkg/                      # Core library (chat, message, instance, etc.)
│   ├── docs/                     # Swagger API docs
│   ├── docker/                   # Docker compose configs
│   └── go.mod / go.sum
├── docs/
│   ├── ARCHITECTURE.md           # System diagram, data flow, security model
│   ├── DEPLOYMENT.md             # All production deployment paths
│   ├── LOAD_TEST.md              # 1000-user load harness + results
│   ├── PRODUCTION_CHECKLIST.md   # Pre-go-live validation
│   └── DEPENDABOT_TRIAGE.md      # Security advisory history
├── northflank/                   # Recommended free deployment
│   ├── template.json             # Northflank IaC template (bot + Evolution + Postgres)
│   └── README.md                 # Import/run guide
├── deploy/vps/                   # Single-VPS production stack
│   ├── setup.sh                  # Bootstrap (Docker, firewall, secrets, backup cron)
│   ├── deploy.sh                 # Validate + build + start + health check
│   ├── docker-compose.prod.yml   # Caddy + host-port hardening override
│   ├── Caddyfile                 # Hostname routing + auto TLS
│   └── .env.example              # Production env template
├── scripts/
│   ├── loadtest/                 # Stdlib 1000-user load harness (own go.mod)
│   ├── backup.sh                 # pg_dump + retention + optional S3 offsite
│   └── restore.sh                # Destructive restore with confirmation
├── vercel.json                   # Frontend Vercel config (root build command)
├── fly.bot.toml                  # Fly.io bot service (legacy path)
├── fly.campaign.toml             # Fly.io campaign service (legacy path)
├── fly.evolution.toml            # Fly.io Evolution service (legacy path)
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                # CI: build, vet, tests, SAST, secret scan, infra validation
│   │   ├── release.yml           # Docker publish + GitHub release on tags
│   │   ├── deploy-frontend-vercel.yml   # Opt-in Vercel deploy
│   │   └── deploy-backend-fly.yml       # Opt-in Fly deploy (legacy)
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   └── feature_request.yml
│   └── PULL_REQUEST_TEMPLATE.md
├── docker-compose.yml            # One-command full stack
├── setup.sh                      # Interactive setup wizard
├── install.sh                    # One-liner installer
├── .env.example                  # All environment variables documented
├── CONTRIBUTING.md               # How to contribute
├── LICENSE                       # MIT
├── start-ocp.sh                  # Production startup script (Linux/WSL)
├── OCP-ControlPanel.bat          # Windows control panel launcher
├── OCP-ControlPanel.ps1          # Windows control panel (GUI)
└── .gitignore
```

---

## Prerequisites

- **Docker** and **Docker Compose** (recommended — the compose stack pins PostgreSQL 16.4 and all service images)
- Manual development: **Go 1.27.4+**, **Node.js 24+**, **PostgreSQL 16+**
  - Go 1.27.4 is what CI installs and what `bot/Dockerfile` builds with
  - Node 24 is what CI and the frontend/campaign build stages use (the campaign *runtime* image is Node 20.19)
  - `openssl` is used by `setup.sh` to generate secrets

---

## Quick Start (Docker)

One command to run everything:

```bash
git clone https://github.com/zubershk/ocp.git
cd ocp
bash setup.sh
docker compose up -d
```

That's it. The setup wizard generates secrets, creates `.env`, and prints your admin key.

**Services after startup:**

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Customer site + admin dashboard |
| Bot API | http://localhost:8090 | Backend API |
| Evolution GO | http://localhost:8080 | WhatsApp gateway |
| Campaign Runner | http://localhost:3001 | WhatsApp marketing tool |

**Useful commands:**

```bash
docker compose up -d          # Start all services
docker compose logs -f        # View live logs
docker compose logs -f bot    # View bot logs only
docker compose down           # Stop all services
docker compose down -v        # Stop and delete data
docker compose build          # Rebuild after code changes
```

---

## Setup (Manual / Development)

If you prefer running without Docker:

### 1. Clone and configure

```bash
git clone https://github.com/zubershk/ocp.git
cd ocp
cp .env.example .env
# Edit .env with your values (or run: bash setup.sh)
```

### 2. Database

```bash
createdb ocp
# Migrations run automatically when the bot starts
```

The bot runs 51 migrations (001→051) on startup covering:

| Migration | What it creates |
|-----------|----------------|
| 001 | Core tables — customers, menu_items, orders, order_items |
| 002 | Admin users with hashed keys and roles |
| 003 | Live chat message persistence |
| 004 | Restaurant settings (name, hours, fees) |
| 005 | Audit log |
| 006 | Menu variants (size/crust pricing) |
| 007 | Order access tokens (IDOR protection) |
| 008 | Bot message templates |
| 009 | Customer sessions |
| 010 | Delivery zone configuration |
| 011 | WhatsApp cart storage |
| 012 | Idempotency keys (duplicate order prevention) |
| 013 | Human-friendly order IDs (OCP-YYYYMMDD-NNNN) |
| 014 | Site settings (banners, offers, contacts) |
| 015 | Site pages (FAQ, Privacy, Terms) |
| 016 | Business config (sizes, payments, fees) |
| 017 | Family packs page config (promo card + pack list) |
| 018 | Item `no_crust` flag (hide crust selector for bundles) |
| 019→051 | Verified-purchase reviews, crusts, tenant foundation/enforcement, POS schema/permissions, WhatsApp cart tenant, onboarding, indexes, broadcast queue + idempotency, campaign state, and later hardening migrations (see `bot/migrations/` for the authoritative list) |

### 3. Backend

```bash
cd bot
go mod tidy
go build -o bot-ocp .
./bot-ocp
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev      # Development server on :5173
```

### 5. Campaign Runner (optional)

```bash
cd campaign-runner
npm install
npm run dev      # Server on :3001 + frontend on :5174
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `BOT_PORT` | API server port | `8090` |
| `BOT_DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/orange_cheese_pizza_bot?sslmode=disable` |
| `EVOLUTION_API_URL` | Evolution GO API base URL | `http://localhost:8080` |
| `EVOLUTION_API_KEY` | Global Evolution API key | Your key |
| `EVOLUTION_INSTANCE` | WhatsApp instance name | `OCP` |
| `EVOLUTION_INSTANCE_TOKEN` | Instance auth token (UUID) | Your UUID |
| `EVOLUTION_WEBHOOK_SECRET` | **Required.** Webhook verification secret | `openssl rand -hex 16` |
| `BOT_ADMIN_KEY` | Admin dashboard password (hex string) | `openssl rand -hex 16` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins | `https://your-app.vercel.app` |
| `RESTAURANT_WHATSAPP_NUMBER` | Number for order notifications | `919876543210` |
| `DELIVERY_FEE` | Default delivery fee | `0` |
| `OTP_PEPPER` | **Required.** Hash pepper for OTPs and sessions — must differ from `BOT_ADMIN_KEY` | `openssl rand -hex 32` |
| `SINGLE_TENANT_MODE` | Single-restaurant mode; must be `true` in `GIN_MODE=release` or `/api/*` returns "tenant required" | `true` |
| `TRUSTED_PROXIES` | LB/proxy CIDRs so `ClientIP()` is correct for rate limiting | `172.16.0.0/12` |
| `RATE_LIMIT_BACKEND` | `postgres` shares counters across replicas | `postgres` |
| `API_RATE_LIMIT_PER_MIN` | Global **write-only** budget per IP (safe reads bypass) | `300` |
| `PUBLIC_READ_CACHE_TTL_SECS` | Read-through cache TTL for anonymous storefront GETs; `0` disables | `15` |
| `ETAG_ENABLED` | Strong ETag + 304 revalidation for small GET JSON | `1` |
| `BIZ_CONFIG_CACHE_TTL_SECS` | Business-config cache TTL (cross-replica convergence window) | `60` |
| `TENANT_CACHE_TTL_SECS` | Tenant lookup cache TTL | `300` |
| `PG_PUBSUB_ENABLED` | Postgres `LISTEN/NOTIFY` cross-replica SSE fan-out (needs a **direct** DB connection, no pooler) | `1` |
| `PG_PHONE_LOCKS_ENABLED` | Advisory per-phone locks (duplicate-order prevention) | `true` |
| `BROADCAST_ASYNC` | Durable DB-queue broadcasts (returns `202 + job_id`) | `1` |
| `BROADCAST_WORKERS` | Bounded broadcast queue workers | `8` |
| `ORDER_STREAM_RESYNC_SECS` | Order SSE DB re-poll; `0` = push-only (recommended at scale) | `0` |
| `METRICS_ENABLED` | Prometheus `/metrics` endpoint | `1` |
| `STORAGE_BACKEND` | `local` (single node) or `s3` (R2/S3/MinIO; required for shared replicas) | `local` |
| `STORAGE_ENDPOINT` / `STORAGE_BUCKET` / `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | S3-compatible storage credentials (R2 endpoint is host-only, no `https://`) | — |
| `STORAGE_PUBLIC_URL` | CDN/public base URL prepended to object keys | `https://cdn.example.com` |
| `IMAGE_ALLOWLIST` | Comma-separated **hostnames** allowed in WhatsApp image URLs (empty = uploads only) | `cdn.example.com` |
| `PGSSLMODE` | `disable` for local Docker Postgres; `require` for managed Postgres (default in root `.env.example`) | `require` |

See [.env.example](.env.example), [bot/.env.example](bot/.env.example), and [deploy/vps/.env.example](deploy/vps/.env.example) for the full, grouped lists.

---

## Running in Production

### Linux / WSL (systemd)

```bash
# Build and install as systemd user service
cd bot && go build -o bot-ocp .

# Create service file at ~/.config/systemd/user/orange-cheese-pizza-bot.service
# Then:
systemctl --user daemon-reload
systemctl --user start orange-cheese-pizza-bot
systemctl --user status orange-cheese-pizza-bot
```

### Windows Control Panel

```powershell
# Right-click OCP-ControlPanel.bat → Run as administrator
# Or from PowerShell:
.\OCP-ControlPanel.ps1
```

The control panel shows status for all 4 services (Evolution GO, Bot, Campaign Runner, Frontend) with Start All / Stop All / Restart buttons, live log viewer, and website/admin shortcuts.

### Manual

```bash
cd bot && go build -o bot-ocp . && ./bot-ocp
```

### Deploying Frontend to Vercel

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) and import the `zubershk/ocp` repo — **keep the root directory as the repo root** (the root `vercel.json` runs `npm --prefix frontend ci` and `npm --prefix frontend run build`, output `frontend/dist`)
3. Add the environment variable `VITE_API_BASE_URL` = your backend URL **before** deploying — Vite inlines it at build time; leaving it unset throws at startup and produces a blank page
4. Deploy

Vercel config includes security headers (HSTS, CSP, X-Frame-Options), SPA routing rewrites, and 1-year immutable asset caching. See [docs/DEPLOYMENT.md § Option 0](docs/DEPLOYMENT.md) for the full walkthrough.

### Deploying Backend

The Go backend needs always-on processes with PostgreSQL access. Concrete, validated paths (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)):

- **Northflank free Sandbox (recommended)** — bot + Evolution GO + managed Postgres via [northflank/template.json](northflank/template.json); frontend on Vercel. Campaign runner is omitted on the free tier.
- **VPS** — Docker Compose + Caddy with automatic TLS via [deploy/vps/](deploy/vps/); run as systemd, or use the provided `start-ocp.sh` / control panel.
- **Fly.io (legacy)** — always-on Machines via `fly.*.toml`; Fly no longer has a free tier.
- **Your own machine** — local development only.

Set `CORS_ALLOWED_ORIGINS` to include your Vercel domain, and `TRUSTED_PROXIES` to your proxy/LB CIDR so rate limiting keys on the real client IP.

---

## Scaling & operations

The compose stack is horizontally scalable. All cross-replica shared state lives in PostgreSQL, so no sticky sessions are needed:

- **PgBouncer** (transaction pooling) sits in front of Postgres so `BOT_REPLICAS` can grow without exhausting connections. Point clients at `pgbouncer:6432`.
- **One-shot `bot-init`** runs migrations + bootstrap seeds before replicas start; app replicas set `SKIP_MIGRATIONS=1`. The advisory lock is held on a dedicated connection with a configurable `MIGRATION_LOCK_TIMEOUT_SECS`.
- **`bot-lb`** round-robins across replicas with SSE-safe proxy timeouts; the frontend nginx proxies to it (`worker_connections 8192`).
- **Cross-replica realtime** uses PostgreSQL `LISTEN/NOTIFY` (`PG_PUBSUB_ENABLED`): SSE events pushed on one replica reach subscribers on all others.
- **Phone-level serialisation** uses advisory locks (`PG_PHONE_LOCKS_ENABLED`) so duplicate WhatsApp taps on different replicas cannot double-create orders.
- **Rate limits are shared** (`RATE_LIMIT_BACKEND=postgres`) so limits hold across replicas; set `TRUSTED_PROXIES` to your LB subnet so `ClientIP()` is correct.
- **Broadcasts are async**: `POST /admin/broadcast/send` returns `202 {job_id}` immediately; a durable DB queue with bounded workers (`BROADCAST_WORKERS`) drains it, and `GET /admin/broadcast/jobs/:id` reports status. The campaign runner polls automatically.
- **Tenant/domain resolution is cached** (`TENANT_CACHE_TTL_SECS`); order SSE no longer polls the DB every 5s (`ORDER_STREAM_RESYNC_SECS=0` disables it).
- **Observability**: `GET /metrics` exposes Prometheus-format counters (requests/latency/5xx by route, DB pool usage, rate-limit rejects, SSE subscribers, goroutines). Disable with `METRICS_ENABLED=0`.
- **Backups**: schedule `scripts/backup.sh` (retention `BACKUP_RETENTION_DAYS`, optional `BACKUP_S3_BUCKET`); restore with `scripts/restore.sh`. Both are env-driven.
- **Admin key rotation**: `POST /admin/me/rotate-key` rotates a DB user's own key (returned once). The env `BOT_ADMIN_KEY` is break-glass only.

The scale settings above were validated by the [1000-user load test](docs/LOAD_TEST.md). Two findings changed the defaults: the global `/api/*` limiter now counts **only writes** (`API_RATE_LIMIT_PER_MIN`) so shoppers behind one NAT IP are not all throttled, and a 15s `PUBLIC_READ_CACHE_TTL_SECS` read-through cache keeps storefront GETs off the DB pool. Keeping `ETAG_ENABLED=1` plus setting `TRUSTED_PROXIES` are also required for production. See [Load Test](#load-test) for the measured results and [Production Checklist](docs/PRODUCTION_CHECKLIST.md) for the full go-live list.

All new knobs are documented in `.env.example` (root) and `bot/.env.example`.

## Security

The codebase has been audited and hardened for production use:

- **Webhook authentication** — HMAC-SHA256 signature verification; rejects webhooks when `EVOLUTION_WEBHOOK_SECRET` is empty
- **Admin key comparison** — constant-time via `crypto/subtle` to prevent timing attacks; keys stored as SHA-256 hashes
- **Rate limiting** — Postgres-backed shared counters (`RATE_LIMIT_BACKEND=postgres`) that hold across replicas; IP-based windows on endpoint groups:
  - `/auth/send-otp` — 3 requests/min
  - `/auth/verify-otp` — 10 requests/min
  - `/api/*` — global **write-only** budget (`API_RATE_LIMIT_PER_MIN`, default 300); safe GET/HEAD/OPTIONS reads bypass it so shoppers behind one NAT/CGNAT IP are not throttled — every state-changing endpoint keeps its own strict limit
  - `/admin/*` — failed admin-key attempts only (10/60s by default); legitimate polling is never throttled
  - `/api/orders` — 20 requests/min
  - `/webhook/*` — 300 requests/min
- **OTP verification** — transactional with `SELECT ... FOR UPDATE` to prevent brute-force race conditions; 3 max attempts, 30s cooldown between sends
- **Request body limits** — 1MB global max to prevent OOM
- **Error sanitization** — internal errors logged server-side, generic messages returned to clients
- **Security headers** — HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy on every response
- **CORS** — explicit origin allowlist (no wildcards)
- **Input validation** — all fields length-bounded, numeric ranges checked, enums enforced
- **SQL injection** — 100% parameterized queries across all handlers
- **XSS prevention** — no `dangerouslySetInnerHTML`, React auto-escaping, CSP `script-src 'self'`
- **File uploads** — content-type sniffing, any image type, 5MB limit (6MB body cap), random filenames (no path traversal)
- **Session tokens** — 192-bit entropy, SHA-256 hashed at rest, 30d sliding TTL (half-life renewal), server-side invalidation on logout
- **IDOR protection** — order access requires access token or Bearer ownership (no sequential IDs exposed)
- **Idempotency** — unique key per order creation request prevents duplicate orders
- **Memory management** — conversation locks cleaned up every 30 minutes
- **Docker security** — required env vars (no defaults), locked CORS, minimal base images (alpine)

**Automated security checks in CI** (`ci.yml`, all fail-closed):

- **`govulncheck -scan module`** — Go dependency vulnerability scan on every push/PR (reported "No vulnerabilities found" in the latest run)
- **CodeQL SAST** — static analysis for Go and JavaScript/TypeScript
- **gitleaks** — full-history secret scan plus per-job scans
- **`npm audit --omit=dev --audit-level=high`** — frontend and campaign, retried on registry outages then fails closed
- **Tenant-isolation guard** — fails the build if a `handlers/*.go` file reintroduces `ResolveRestaurant(0)` on a request path

The dependency-advisory history (6 resolved advisories, 2 dev-only picomatch alerts with dismissal rationale) is tracked in [docs/DEPENDABOT_TRIAGE.md](docs/DEPENDABOT_TRIAGE.md). All open Dependabot PRs have been consolidated and applied; the repo currently has **0 open advisories**.

---

## Load Test

A dependency-free Go harness in [`scripts/loadtest/`](scripts/loadtest/) drives concurrent HTTP traffic at a running bot and reports status counts, latency percentiles, peak DB pool usage (from `/metrics`), and a machine-readable `loadtest-summary.json`. It needs no k6 or external tooling.

```bash
cd scripts/loadtest

# 1000 shoppers for 30s
go run . -base http://localhost:8090 -users 1000 -duration 30s

# Include admin dashboard endpoints in the mix
go run . -base http://localhost:8090 -users 1000 -duration 30s \
  -with-admin -admin-key "$OCP_ADMIN_KEY"
```

Flags: `-base` (default `http://localhost:8090`), `-users` (default 100), `-duration` (default 20s), `-admin-key` (falls back to `OCP_ADMIN_KEY`), `-with-admin` (default false). The harness warms up via `/health`, then ramps virtual users that mix the public storefront endpoints with optional admin reads.

**Final results — 1000 concurrent users** (bot and generator on the same machine, so numbers are conservative):

| Scenario | Users | RPS | HTTP status | Network errors | p95 | p99 |
|----------|------:|----:|-------------|---------------:|----:|----:|
| Shoppers only | 1000 | **13,700** | **100% 200** | 728 (0.18%) | 160 ms | 380 ms |
| With admin traffic | 1000 | **6,769** | **100% 200** | 133 (0.06%) | 785 ms | 3.2 s |

Zero HTTP error responses — the "network errors" were client-side 10s timeout tails, not server failures.

**Bottlenecks the test found and fixed:**

| Before | After | Change |
|--------|-------|--------|
| 94.6% HTTP 429 at 100 users | 100% 200 | Global limiter now counts writes only (`RateLimitSkipSafe` + `API_RATE_LIMIT_PER_MIN`) |
| 594 RPS, 3,691 ms p95, DB pool pinned at 25/25 | 13,700 RPS, 160 ms p95 | `PUBLIC_READ_CACHE_TTL_SECS=15` read-through cache for public GETs |
| Duplicate access logs per request | One structured line | `gin.New()` + `gin.Recovery()` instead of `gin.Default()` |
| Tenant fallback warning on every request | Once per process | `sync.Once` guard |
| Harness deadlock above ~3k RPS | Stable | Concurrent result consumption |

**Interpretation and caveats:** single-node local test (no geographic distribution), no 1000-user *write* storm, and the Docker/PgBouncer and S3 paths were not exercised here. For production keep `PUBLIC_READ_CACHE_TTL_SECS=15`, `ETAG_ENABLED=1`, `RATE_LIMIT_BACKEND=postgres`, set `TRUSTED_PROXIES`, and run multiple bot replicas behind `bot-lb` + PgBouncer. Full methodology, progression table, and notes are in [docs/LOAD_TEST.md](docs/LOAD_TEST.md).

---

## Infrastructure validation

A daemon-free Go validator in [`bot/scripts/validate_infra/`](bot/scripts/validate_infra/) checks the whole deployment surface without needing Docker, PgBouncer, or cloud credentials. It runs in CI as the `infra-config` job on every push and pull request.

```bash
cd bot
go run ./scripts/validate_infra -root ..
go run ./scripts/validate_infra -root .. -preflight   # additionally check local env values
```

It verifies:

- **Docker Compose** — `depends_on` targets, named volumes, bind-mount sources, Dockerfile paths, required `${VAR:?}` env vars
- **nginx configs** — brace balance, upstream hosts resolve to real services
- **Vercel** — `vercel.json` is valid JSON with the right `outputDirectory` and SPA rewrite
- **Fly.io** — TOML syntax, always-on guarantees (`auto_stop_machines = false`, `min_machines_running >= 1`), health checks, Dockerfile paths
- **GitHub workflows** — YAML parses for the deploy workflows and the VPS compose override
- **Caddy / VPS** — Caddyfile braces and proxy targets; the VPS env template covers every required variable
- **Northflank** — the template is valid v1.2 JSON with exactly 2 services, a Postgres addon, **no connection pooler** (it would break `LISTEN`), correct build contexts, and all secret arguments declared

`-preflight` additionally checks the current environment for missing secrets and unsafe defaults (`SINGLE_TENANT_MODE`, `TRUSTED_PROXIES`, short admin key, empty `OTP_PEPPER`, `PUBLIC_READ_CACHE_TTL_SECS=0`, etc.).

Before go-live, combine this with the [production checklist](docs/PRODUCTION_CHECKLIST.md).

---

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/menu` | Full menu with categories, filtered by category/search |
| `GET` | `/api/categories` | List all menu categories |
| `GET` | `/api/menu/:slug` | Get a single menu item by slug |
| `GET` | `/api/crusts` | Crust catalog with per-size prices |
| `GET` | `/api/crusts/:slug` | Get crust options for a given item |
| `POST` | `/api/orders` | Place a new order (idempotency key, DB pricing) |
| `GET` | `/api/orders/:id` | Get order details, items with slugs, and status timeline (`X-Order-Token` header) |
| `GET` | `/api/offers` | Active promo offers for the storefront |
| `GET` | `/api/banners` | Active homepage banners |
| `GET` | `/api/family-packs` | Offers page config (promo card + active packs) |
| `POST` | `/api/reviews` | Submit a verified review (delivered orders only, order token required) |
| `GET` | `/api/reviews` | Approved reviews (optional `?item=slug`, `?limit=`) |
| `GET` | `/api/reviews/summary` | Overall + per-item rating aggregates |
| `GET` | `/api/config` | Restaurant configuration |
| `GET` | `/api/outlets` | Outlet locations |
| `GET` | `/api/business-config` | Sizes, payments, icons, delivery config |
| `GET` | `/api/site-settings` | Brand, SEO, social, footer settings |
| `GET` | `/api/site-pages/:slug` | CMS page content |
| `GET` | `/api/menu-categories` | Menu categories with sort order |
| `GET` | `/api/contact-info` | Restaurant contact information |
| `GET` | `/health` | Health check |
| `GET` | `/ready` | Readiness (DB + Evolution status) |

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/send-otp` | Send WhatsApp OTP (rate limited: 3/min, 30s cooldown) |
| `POST` | `/api/auth/verify-otp` | Verify OTP, get session token (30d sliding TTL) |
| `GET` | `/api/auth/me` | Get current user profile |
| `GET` | `/api/auth/orders` | Get user's order history |
| `POST` | `/api/auth/logout` | Invalidate session |

### Admin (requires `X-Admin-Key` header)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/orders` | List all orders |
| `GET` | `/admin/orders/:id` | Get order details |
| `PATCH` | `/admin/orders/:id/status` | Update order status (triggers WhatsApp notification) |
| `GET` | `/admin/menu` | Menu items with full details |
| `POST` | `/admin/menu` | Create menu item |
| `PUT` | `/admin/menu/:id` | Update menu item |
| `DELETE` | `/admin/menu/:id` | Delete menu item |
| `POST` | `/admin/upload` | Upload product photo (any image type, 5MB max, content-type validated, 6MB body cap) |
| `GET` | `/admin/analytics` | Sales/order analytics (daily/weekly/monthly) |
| `GET` | `/admin/users` | List admin users |
| `POST` | `/admin/users` | Create admin user |
| `DELETE` | `/admin/users/:id` | Delete admin user |
| `GET` | `/admin/audit` | Audit log (who did what, when, from where) |
| `GET` | `/admin/config` | Restaurant settings |
| `PUT` | `/admin/config` | Update restaurant settings |
| `GET` | `/admin/conversations` | WhatsApp chat list |
| `GET` | `/admin/conversations/:phone/messages` | Chat messages |
| `POST` | `/admin/conversations/:phone/send` | Send chat message |
| `GET` | `/admin/customers` | List all customers |
| `POST` | `/admin/broadcast/send` | Bulk send WhatsApp messages (max 200 recipients) |
| `GET` | `/admin/me` | Current admin user info |
| `GET` | `/admin/site-settings` | All site settings |
| `PUT` | `/admin/site-settings/:key` | Update a site setting |
| `GET` | `/admin/site-pages` | List all CMS pages |
| `PUT` | `/admin/site-pages/:slug` | Create/update a page |
| `DELETE` | `/admin/site-pages/:slug` | Delete a page |
| `GET` | `/admin/menu-categories` | List all menu categories |
| `POST` | `/admin/menu-categories` | Create a category |
| `PUT` | `/admin/menu-categories/:id` | Update a category |
| `DELETE` | `/admin/menu-categories/:id` | Delete a category |
| `GET` | `/admin/offers` | Get offers configuration |
| `PUT` | `/admin/offers` | Update offers |
| `GET` | `/admin/banners` | Get banner configuration |
| `PUT` | `/admin/banners` | Update banners |
| `GET` | `/admin/bot-messages` | List all bot message templates |
| `GET` | `/admin/bot-messages/:key` | Get a bot message template |
| `PUT` | `/admin/bot-messages/:key` | Update a bot message template |
| `POST` | `/admin/bot-messages/reset/:key` | Reset a template to default |
| `POST` | `/admin/bot-messages/reset-all` | Reset all templates to defaults |
| `POST` | `/admin/bot-messages/preview/:key` | Render a template with sample data |
| `GET` | `/admin/business-config` | Get business configuration |
| `PUT` | `/admin/business-config` | Update business configuration |
| `POST` | `/admin/business-config/reload` | Reload config from DB |
| `GET` | `/admin/crusts` | List all crusts |
| `POST` | `/admin/crusts` | Create a crust |
| `PUT` | `/admin/crusts/:id` | Update a crust |
| `DELETE` | `/admin/crusts/:id` | Delete a crust |
| `GET` | `/admin/family-packs` | Get offers page config |
| `PUT` | `/admin/family-packs` | Update offers page config |
| `GET` | `/admin/reviews` | List reviews (optional `?pending=1`) |
| `PATCH` | `/admin/reviews/:id` | Approve or hide a review |

### Webhook

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook/evolution` | Evolution GO event receiver (HMAC-SHA256 verified, rate limited: 300/min) |
| `POST` | `/webhook/button` | Evolution GO button click receiver |

---

## Admin Dashboard

Access at `your-domain/admin` (or `localhost:5173/admin` in development).

Login with your `BOT_ADMIN_KEY`. The key is stored in browser localStorage only.

| Dashboard | Analytics | Catalog |
|:---:|:---:|:---:|
| ![Admin dashboard](docs/screenshots/admin-dashboard.png) | ![Admin analytics](docs/screenshots/admin-analytics.png) | ![Admin catalog](docs/screenshots/admin-catalog.png) |

| Live chat | Coupons | POS |
|:---:|:---:|:---:|
| ![Admin live chat](docs/screenshots/admin-chats.png) | ![Admin coupons](docs/screenshots/admin-coupons.png) | ![POS terminal](docs/screenshots/admin-pos.png) |

![Admin settings](docs/screenshots/admin-settings.png)
*Admin settings — restaurant config and site customization links.*

**Tabs:**
- **Orders** — Live order queue with status controls, sound alerts, filter by status (New, Confirmed, Cooking, Ready, En Route, Delivered, Completed, Cancelled)
- **Menu Studio** — Add/edit/delete menu items with image upload, manage categories; **Crusts tab** to create/edit/delete crusts with per-size pricing; per-item flags (spicy, Jain, new, available, hide-crust-selector)
- **Live Chat** — WhatsApp conversation viewer, read incoming messages, send replies directly from admin
- **Analytics** — Sales charts with daily/weekly/monthly breakdowns, order volume, revenue tracking
- **Team** — Manage staff accounts with role-based access
- **Settings** — Restaurant name, hours, delivery config + site customization links
- **Audit Log** — Who did what, when, from where (every admin action tracked)
- **Offers** — Promo cards with badges, codes, discounts, images
- **Banners** — Homepage carousel with CTA buttons and images
- **Packs** — Offers-page promo card text plus family pack list linked to live menu items
- **Reviews** — Moderate verified-purchase reviews (approve/hide) before they go public

**Site Customization (under Settings):**
- **Brand** — Logo, favicon, primary/secondary/accent colors, heading and body fonts with live preview
- **Business Config** — Sizes, payment methods, category icons, order prefix, currency, delivery fee, min order
- **Pages** — CMS editor for About, Terms, Privacy, FAQ with meta tags
- **Offers** — Create promotions with badges, codes, discount amounts, min order values
- **Banners** — Manage home page carousel with background colors and CTA buttons
- **Bot Messages** — Edit all WhatsApp bot responses with live phone preview and variable reference

**Roles:**
- `owner` — Full access to everything
- `manager` — Can manage orders, menu, team, settings
- `kitchen` — Can view/update order status only
- `viewer` — Read-only access

---

## Customer Site Pages

| Route | Page | Features |
|-------|------|----------|
| `/` | Landing | Hero, menu preview, location pill, banner carousel, GSAP animations |
| `/r` | Home | Food mood cards, category scroll, menu items, floating cart bar |
| `/r/menu` | Menu | Filter chips, search autocomplete, category tabs, item grid |
| `/r/menu/item/:id` | Product | Image zoom, crust selection (hidden for bundles), size picker, live ratings, add to cart with flying animation |
| `/r/cart` | Cart | Item list, quantity adjust, subtotal, tax, proceed to checkout |
| `/r/checkout` | Checkout | Address autocomplete (Nominatim), OTP flow, order summary, idempotency |
| `/r/order/:id` | Order Tracking | Real-time status timeline via SSE (push) with per-step timestamps, order details, review form on delivery |
| `/r/login` | Login | WhatsApp OTP send/verify, phone input |
| `/r/account` | Account | Profile, order history, logout |
| `/r/offers` | Offers | Admin-managed promos with copy-code buttons, live family packs with real prices |
| `/r/reviews` | Reviews | Verified customer reviews with rating summary |
| `/r/locations` | Locations | Outlet cards with address, hours, online ordering status |
| `/r/about` | About | Restaurant story (API-driven) |
| `/r/contact` | Contact | Contact form, map, restaurant info |
| `/r/faq` | FAQ | Accordion FAQ (API-driven with static fallback) |
| `/r/privacy` | Privacy | API-driven privacy policy content |
| `/r/terms` | Terms | API-driven terms of service content |
| `/r/reservations` | Reservations | Table booking form, time slots, guest count |

**Storefront in action:**

| Home | Menu | Product detail |
|:---:|:---:|:---:|
| ![Storefront home](docs/screenshots/storefront-home.png) | ![Storefront menu](docs/screenshots/storefront-menu.png) | ![Product detail](docs/screenshots/storefront-product.png) |

| Cart | Checkout | Login |
|:---:|:---:|:---:|
| ![Cart](docs/screenshots/storefront-cart.png) | ![Checkout](docs/screenshots/storefront-checkout.png) | ![Login](docs/screenshots/storefront-login.png) |

| Offers | Reviews |
|:---:|:---:|
| ![Offers](docs/screenshots/storefront-offers.png) | ![Reviews](docs/screenshots/storefront-reviews.png) |

---

## Frontend Components

### UI Components (`frontend/src/components/ui/`)

| Component | What it does |
|-----------|-------------|
| `AddressAutocomplete` | Nominatim-powered address search with city/postal code extraction |
| `Badge` | Status badges — success/warning/error/neutral/brand/veg/nonveg variants |
| `BannerCarousel` | Auto-rotating banner slider from site settings |
| `Button` | Primary/secondary/ghost/danger/outline variants with loading state |
| `Card` | Reusable card container with hover and padding options |
| `CategoryScroll` | Horizontal scrolling category navigation with arrow buttons |
| `ConfirmDialog` | Modal confirmation dialog with danger mode (replaces browser `confirm()`) |
| `FilterChips` | Horizontal scrollable filter pills for menu filtering |
| `FloatingCartBar` | Mobile sticky cart bar showing item count and subtotal |
| `FoodMoodCards` | Category grid ("What's on your mind?") with images |
| `ImageZoom` | Fullscreen image viewer with zoom in/out and pan |
| `Input` | Form input with label, error message, hint text, and icon support |
| `LocationPill` | Current location/outlet display pill |
| `Modal` | Overlay modal with sizes (sm/md/lg/full) and ESC key close |
| `OffersStrip` | Horizontal scrollable offers cards from site settings |
| `SearchAutocomplete` | Menu search with recent searches (localStorage), popular items, keyboard navigation |
| `Skeleton` | Loading placeholders — text/circular/rectangular/card variants |
| `StarRating` | Star rating display with half-star support |

### Contexts (`frontend/src/context/`)

| Context | What it provides |
|---------|-----------------|
| `AuthContext` | Customer authentication state, OTP flow, session management |
| `CartContext` | Shopping cart state (localStorage), add/remove/clear/calculate, variant-aware |
| `CrustContext` | Crust variant pricing and selection (fetched from API) |
| `RestaurantContext` | Restaurant info, outlets, delivery hours, operating hours (fetched from API) |
| `SiteSettingsContext` | Banners, offers, contacts, page content, CSS custom properties for brand colors |
| `ToastContext` | Toast notifications (success/error/info/warning) |

### Hooks (`frontend/src/hooks/`)

| Hook | What it does |
|------|-------------|
| `useFlyingCart` | Animated flying cart effect when adding item to cart |
| `useGeoLocation` | Browser geolocation with fallback to default location |
| `useGsap` | GSAP scroll-triggered animations — `useGsapReveal`, `useGsapFadeIn`, `useGsapCountUp` |
| `useMenu` | Menu data fetching with React Query (API first, static fallback) |
| `usePushNotifications` | Push notification subscription, permission management |

### Services (`frontend/src/services/`)

| Service | What it does |
|---------|-------------|
| `api.ts` | Base HTTP client with auth headers, error handling |
| `authService.ts` | OTP send/verify, session management |
| `cartService.ts` | Cart persistence operations |
| `menuService.ts` | Menu/category/crust data fetching |
| `orderService.ts` | Order creation, tracking, history |

---

## WhatsApp Conversation Flow

The bot handles a full stateful conversation over WhatsApp:

1. **Greeting** — Customer sends any message, bot responds with welcome + menu
2. **Category browsing** — Customer picks a category (Pizza, Sides, etc.)
3. **Item selection** — Customer picks an item from the category
4. **Size selection** — Regular / Medium / Large (configurable from admin)
5. **Crust selection** — Tossed, Thin, Cheese Burst, etc. (per-item, with pricing)
6. **Quantity** — Customer specifies how many
7. **Cart management** — Add more items, view cart, remove items, clear cart
8. **Checkout** — Confirm order, provide address, choose payment method
9. **Order placed** — Confirmation sent to customer + notification to restaurant

All message templates are stored in the database and editable from the admin Bot Messages panel with live WhatsApp preview.

---

## WhatsApp Integration

This system uses **Evolution GO** as the WhatsApp API gateway. The source code is included in `evolution-go/`.

**How it works:**
1. Customer places an order on the website
2. Backend creates the order and sends a WhatsApp notification to the restaurant
3. When order status changes (Preparing → Out for Delivery), a WhatsApp message is sent to the customer
4. Incoming WhatsApp messages are persisted in the database for the admin Live Chat tab
5. Campaign runner sends bulk messages through the bot's broadcast endpoint

**Setting up Evolution GO:**

```bash
cd evolution-go
cp .env.example .env
# Edit .env with your PostgreSQL connection and config

# Build and run
go build -o evolution-go ./cmd/evolution-go
./evolution-go

# Or use Docker (example compose files live under evolution-go/docker/examples/)
docker compose -f evolution-go/docker/examples/docker-compose.yml up -d
```

Evolution GO features:
- High-performance WhatsApp API built in Go
- QR code pairing for device linking
- Real-time event delivery (WebSocket, Webhook, AMQP/RabbitMQ, NATS)
- Text and media message sending (images, videos, audio, documents)
- Instance management, user management, label/tag management
- Group management, newsletter support, community management
- Swagger API documentation included

**Connecting to OCP:**
1. Open the Evolution GO manager at `http://localhost:8080/manager`
2. Create an instance named `OCP`
3. Scan the QR code with the restaurant's WhatsApp number
4. Set the webhook URL to `http://YOUR_SERVER:8090/webhook/evolution`
5. Set `EVOLUTION_WEBHOOK_SECRET` in `bot/.env` to the same value
6. Configure the instance token and API key in `bot/.env`

---

## Campaign Runner

A standalone WhatsApp marketing tool that connects to the Go bot.

```bash
cd campaign-runner
npm install
npm run dev
```

Open `http://localhost:5173` — go to Settings → enter Bot API URL (`http://localhost:8090`) and your admin key.

| Dashboard | Customers | Campaigns |
|:---:|:---:|:---:|
| ![Campaign dashboard](docs/screenshots/campaign-dashboard.png) | ![Campaign customers](docs/screenshots/campaign-customers.png) | ![Campaigns](docs/screenshots/campaign-campaigns.png) |

| Templates | Media |
|:---:|:---:|
| ![Message templates](docs/screenshots/campaign-templates.png) | ![Media library](docs/screenshots/campaign-media.png) |

**6 tabs:**
- **Dashboard** — Stats cards, 7-day activity chart, recent campaigns, tag breakdown
- **Customers** — Search, filter by tag, paginated table, CSV import/export, bulk operations
- **Campaigns** — 3-step wizard (Compose → Recipients → Review), WhatsApp-style live preview, scheduling, live progress with per-recipient status
- **Templates** — Reusable messages with merge tags ({name}, {discount}, {brand_name}), 6 presets
- **Media** — Upload images, grid gallery, copy URL
- **Settings** — Brand name/logo/color, bot connection, delay config

**How it sends:**
- Customers sync from the bot's PostgreSQL via `/admin/customers`
- Messages send through the bot's `/admin/broadcast/send` endpoint
- No direct Evolution GO access — all WhatsApp operations go through the bot

---

## PWA Features

- **Service Worker** — cache-first strategy for static assets, network fallback to offline page, skips API requests
- **Web Manifest** — standalone display mode, portrait orientation, brand orange theme (#ea580c)
- **Push Notifications** — browser push notification support with permission management
- **Offline Support** — cached assets serve when network is unavailable
- **Home Screen Install** — users can install the app to their home screen on mobile and desktop

---

## Static Fallback Data

When the API is unavailable (offline, slow network), the frontend falls back to static data:

| File | Items | What's in it |
|------|-------|-------------|
| `menu.ts` | ~100+ items | Full menu across all categories (Pizza, Burgers, Momos, Chicken, Pasta, Sides, etc.) |
| `categories.ts` | 12 categories | With icons and display names |
| `offers.ts` | 8 offers | BOGO, Family Packs (1-4), Cheese Burst, Fun Meal Box |
| `blog.ts` | 3 posts | Mozzarella story, Desi Tadka, Korean Spicy launch |

---

## Animations & UX

- **GSAP Scroll Animations** — elements reveal on scroll, fade in, count-up numbers
- **Flying Cart Animation** — item visually flies to cart when added
- **Mobile Floating Cart Bar** — sticky bottom bar showing item count and subtotal
- **Image Zoom** — fullscreen viewer with pinch-to-zoom on product images
- **Skeleton Loading** — shimmer placeholders while content loads
- **Toast Notifications** — non-intrusive success/error/info messages
- **Confirm Dialogs** — modal confirmations replacing browser `confirm()` calls
- **Search Autocomplete** — recent searches, popular items, keyboard navigation

---

## Docker

### Services

| Service | Base Image | Build | Port |
|---------|-----------|-------|------|
| Bot | golang:1.27.4-alpine3.21 → alpine:3.20.3 | `CGO_ENABLED=0` static build | :8090 |
| Frontend | node:24.20.0-alpine3.20 → nginx:1.27.1-alpine3.20 | `npm ci` + Vite build | :3000 |
| Campaign Runner | node:24.20.0-alpine3.20 (builder) → node:20.19.0-alpine3.20 (runtime) | `npm ci` + build | :3001 |
| Evolution GO | golang:1.25.0-alpine3.21 → alpine:3.21.3 | `CGO_ENABLED=1` with image libs | :8080 |
| PostgreSQL | postgres:16.4-alpine3.20 | — | :5432 |
| PgBouncer | edoburu/pgbouncer:v1.21.0-p1 | transaction pooling (`:6432`) | :6432 |
| bot-lb | nginx:1.27-alpine | round-robin across bot replicas | :80 |

### Docker Compose

- Volume persistence for uploads and database
- Network isolation between services
- Health checks on PostgreSQL
- Required environment variables (no insecure defaults)

---

## CI/CD

### Continuous integration (`ci.yml`)
Triggers on every push and pull request to `master`. All jobs are fail-closed:

- **`gitleaks`** — full-history secret scan
- **`sast`** — CodeQL static analysis for Go and JavaScript/TypeScript
- **`bot`** — Go build, `go vet`, `govulncheck -scan module`, DB-backed `go test -p 1 ./... -count=1` against a `postgres:16` service, plus the tenant-isolation source guard
- **`frontend`** — `npm audit --omit=dev --audit-level=high`, `npm run build` (tsc + Vite), `npm run lint` (oxlint), gitleaks
- **`campaign`** — `npm audit`, `npm run build`, gitleaks
- **`infra-config`** — daemon-free validation of compose, nginx, Vercel, Fly, Caddy, env templates, and the Northflank template (see [Infrastructure validation](#infrastructure-validation))

The CI workflow always runs so a push never fails simply because deploy credentials are absent.

### Deploy workflows (opt-in)
- `deploy-frontend-vercel.yml` — gated by `DEPLOY_VERCEL_ENABLED=true` + `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`
- `deploy-backend-fly.yml` (legacy) — gated by `DEPLOY_FLY_ENABLED=true` + `FLY_API_TOKEN`; deploys bot → campaign/Evolution
- Both use non-cancelling concurrency groups and `workflow_dispatch`; with the gate variables unset the jobs are **skipped, not failed**
- **Northflank** deploys via native Git integration (no GitHub Action) and auto-deploys on push to `master`

### Release pipeline (`release.yml`)
- Triggers on version tags (`v*`)
- Builds and publishes `bot`, `frontend`, and `campaign` images to `ghcr.io` with provenance and SBOM
- Creates a GitHub release with generated changelog

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code style, and PR guidelines.

## License

MIT — see [LICENSE](LICENSE) for details.
