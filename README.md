# Orange Cheese Pizza — Online Ordering System

[![CI](https://github.com/zubershk/ocp/actions/workflows/ci.yml/badge.svg)](https://github.com/zubershk/ocp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](docker-compose.yml)

Full-stack pizza ordering platform with WhatsApp integration, real-time order management, a production-ready admin dashboard, and a WhatsApp marketing campaign runner. Built for small food businesses that want an online ordering presence without paying third-party commissions.

### Quick Start

```bash
git clone https://github.com/zubershk/ocp.git && cd ocp && bash setup.sh && docker compose up -d
```

Or install to a custom directory:

```bash
curl -fsSL https://raw.githubusercontent.com/zubershk/ocp/master/install.sh | bash
```

### Deploy to Cloud

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/zubershk/ocp/tree/master/frontend&env=VITE_API_BASE_URL)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/ocp)

## What This Does

**For customers:**
- Browse the full menu with real product photos, prices, and dietary info
- Filter by category, spice level, budget, or family packs
- Customise pizzas (size, crust, toppings) and see price updates live
- Place orders with address autocomplete and delivery radius check
- Pay by cash or UPI on arrival
- Track order status in real-time (10-second polling)
- WhatsApp OTP login — no passwords, just a 6-digit code
- View order history and reorder past orders
- PWA support — works offline, installs to home screen

**For the restaurant:**
- Real-time order dashboard with live polling and sound alerts
- Menu management — add/edit items, upload product photos, manage categories
- Order lifecycle: New → Preparing → Out for Delivery → Delivered
- WhatsApp notifications sent automatically on every status change
- Customer chat via WhatsApp (reads incoming messages, persists conversation history)
- Team management with role-based access (owner, manager, kitchen, viewer)
- Analytics dashboard with daily/weekly/monthly sales and order stats
- Restaurant settings (name, hours, delivery fee, tax) editable from admin
- Audit log tracking every admin action
- Rate limiting on auth and order endpoints to prevent abuse

**Fully configurable — every detail is editable from the admin dashboard:**

- **Brand settings** — logo, favicon, primary/secondary/accent colors, heading and body fonts
- **Content pages** — About, Terms, Privacy, FAQ managed via CMS editor
- **Offers & promotions** — create deals with badges, codes, discount amounts, min order
- **Banner carousel** — add/edit home page banners with background colors and CTA buttons
- **SEO settings** — meta title, description, OG image, favicon
- **Social links** — Instagram, Facebook, Twitter, YouTube, WhatsApp
- **Footer** — copyright text, tagline, delivery hours, outlet info — all dynamic
- **Notification templates** — customizable order status messages with merge tags

**WhatsApp Campaign Runner:**
- Bulk send WhatsApp messages to customers
- Campaign wizard with WhatsApp-style live preview
- Customer segments via tags (regular, vip, etc.)
- Message templates with merge tags ({name}, {discount}, {brand_name})
- Media library for campaign images
- Scheduled campaigns with auto-trigger
- Live progress tracking with per-recipient status
- Connects to the Go bot — no direct Evolution GO access needed

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.21 + Gin web framework |
| Database | PostgreSQL 14+ |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | React Context + TanStack Query |
| WhatsApp | Evolution GO (self-hosted WhatsApp API) |
| Campaigns | Express.js + React (standalone tool) |
| Animations | GSAP (GreenSock) |
| PWA | Service Worker + Web Manifest |

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
│   │   ├── site_settings_handler.go  # Site settings, pages, categories API
│   │   └── rate_limit.go         # IP-based rate limiting
│   ├── admin/
│   │   └── admin_handler.go      # Admin CRUD, analytics, team, audit, broadcast
│   ├── services/
│   │   ├── menu_service.go       # Menu CRUD, item lookups
│   │   ├── order_service.go      # WhatsApp order processing
│   │   ├── website_order_service.go  # Web order creation, pricing
│   │   ├── customer_service.go   # Customer lookup, phone canonicalization
│   │   ├── customer_auth_service.go  # OTP/session management (transactional)
│   │   ├── conversation_engine.go    # WhatsApp conversation state machine
│   │   └── live_chat_service.go  # WhatsApp message persistence
│   ├── migrations/               # 14 SQL migration files
│   ├── uploads/                  # Menu item product photos
│   ├── .env.example              # Environment template
│   └── go.mod / go.sum
├── frontend/                     # React frontend (customer site + admin)
│   ├── src/
│   │   ├── pages/                # Home, Menu, Product, Cart, Checkout, etc.
│   │   ├── components/           # Reusable UI components
│   │   │   ├── ui/               # Button, Card, Badge, Modal, ConfirmDialog
│   │   │   └── layout/           # Navbar, Footer
│   │   ├── context/              # Cart, Toast, Auth, Restaurant, SiteSettings
│   │   ├── hooks/                # Custom hooks (GSAP, geolocation, etc.)
│   │   ├── services/             # API calls, cart persistence
│   │   ├── data/                 # Static data (fallback outlets, restaurant)
│   │   └── types/                # TypeScript interfaces
│   ├── public/                   # PWA manifest, service worker, offline page
│   ├── vercel.json               # Vercel deployment config
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
│   └── ARCHITECTURE.md           # System diagram, data flow, security model
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                # Build + vet on every push/PR
│   │   └── release.yml           # Docker publish + GitHub release on tags
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

## Prerequisites

- **Docker** and **Docker Compose** (recommended)
- Or: **Node.js** 18+, **Go** 1.21+, **PostgreSQL** 14+

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
npm run dev      # Server on :3001 + frontend on :5173
```

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

The control panel shows status for all 3 services (Evolution GO, Bot, Campaign Runner) and provides Start/Stop/Restart buttons.

### Manual

```bash
cd bot && go build -o bot-ocp . && ./bot-ocp
```

### Deploying Frontend to Vercel

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) and import the `zubershk/ocp` repo
3. Set the root directory to `frontend`
4. Add environment variable: `VITE_API_BASE_URL` = your backend URL
5. Deploy

### Deploying Backend

The Go backend needs to run on a server with PostgreSQL access. Options:
- **Railway** / **Render** — easy Go deployment with managed PostgreSQL
- **VPS** (DigitalOcean, Hetzner) — full control, run via systemd
- **Your own machine** — for local development only

Set `CORS_ALLOWED_ORIGINS` in `bot/.env` to include your Vercel domain.

## Security

The codebase has been audited and hardened for production use:

- **Webhook authentication** — requires `EVOLUTION_WEBHOOK_SECRET` to be set; rejects webhooks when unconfigured
- **Admin key comparison** — constant-time via `crypto/subtle` to prevent timing attacks
- **Rate limiting** — IP-based window counters on all endpoints (auth, API, admin, webhooks)
- **OTP verification** — transactional with `SELECT ... FOR UPDATE` to prevent brute-force race conditions
- **Request body limits** — 1MB global max to prevent OOM
- **Error sanitization** — internal errors logged server-side, generic messages returned to clients
- **Security headers** — HSTS, CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy
- **CORS** — explicit origin allowlist (no wildcards)
- **Input validation** — all fields length-bounded, numeric ranges checked, enums enforced
- **SQL injection** — 100% parameterized queries across all handlers
- **XSS prevention** — no `dangerouslySetInnerHTML`, React auto-escaping, CSP `script-src 'self'`
- **File uploads** — content-type sniffing, 5MB limit, random filenames (no path traversal)
- **Session tokens** — 192-bit entropy, SHA-256 hashed at rest, server-side invalidation on logout
- **IDOR protection** — order access requires token or Bearer ownership
- **Memory management** — conversation locks cleaned up every 30 minutes
- **Docker security** — required env vars (no defaults), locked CORS, minimal base images

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/menu` | Full menu with categories |
| `POST` | `/api/orders` | Place a new order |
| `GET` | `/api/orders/:id` | Get order status |
| `GET` | `/api/config` | Restaurant configuration |
| `GET` | `/api/outlets` | Outlet locations |
| `GET` | `/api/site-settings` | Brand, SEO, social, footer settings |
| `GET` | `/api/site-pages/:slug` | CMS page content |
| `GET` | `/api/menu-categories` | Menu categories |
| `GET` | `/health` | Health check |
| `GET` | `/ready` | Readiness (DB + Evolution status) |

### Auth

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/send-otp` | Send WhatsApp OTP (rate limited: 3/min) |
| `POST` | `/api/auth/verify-otp` | Verify OTP, get session token |
| `GET` | `/api/auth/me` | Get current user profile |
| `GET` | `/api/auth/orders` | Get user's order history |
| `POST` | `/api/auth/logout` | Invalidate session |

### Admin (requires `X-Admin-Key` header)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/orders` | List all orders |
| `GET` | `/admin/orders/:id` | Get order details |
| `PATCH` | `/admin/orders/:id/status` | Update order status |
| `GET` | `/admin/menu` | Menu items with full details |
| `POST` | `/admin/menu` | Create menu item |
| `PUT` | `/admin/menu/:id` | Update menu item |
| `DELETE` | `/admin/menu/:id` | Delete menu item |
| `POST` | `/admin/upload` | Upload product photo |
| `GET` | `/admin/analytics` | Sales/order analytics |
| `GET` | `/admin/users` | List admin users |
| `POST` | `/admin/users` | Create admin user |
| `DELETE` | `/admin/users/:id` | Delete admin user |
| `GET` | `/admin/audit` | Audit log |
| `GET` | `/admin/config` | Restaurant settings |
| `PUT` | `/admin/config` | Update restaurant settings |
| `GET` | `/admin/conversations` | WhatsApp chat list |
| `GET` | `/admin/conversations/:phone/messages` | Chat messages |
| `POST` | `/admin/conversations/:phone/send` | Send chat message |
| `GET` | `/admin/customers` | List all customers |
| `POST` | `/admin/broadcast/send` | Bulk send WhatsApp messages |
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

### Webhook

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook/evolution` | Evolution GO event receiver (rate limited: 300/min) |
| `POST` | `/webhook/button` | Evolution GO button click receiver |

## Admin Dashboard

Access at `your-domain/admin` (or `localhost:5173/admin` in development).

Login with your `BOT_ADMIN_KEY`. The key is stored in browser localStorage only.

**Tabs:**
- **Orders** — Live order queue with status controls and sound alerts
- **Menu Studio** — Add/edit/delete menu items with image upload
- **Live Chat** — WhatsApp conversation viewer
- **Analytics** — Sales charts, daily/weekly/monthly breakdowns
- **Team** — Manage staff accounts with role-based access
- **Settings** — Restaurant name, hours, delivery config + site customization links
- **Audit Log** — Who did what, when

**Site Customization (under Settings):**
- **Brand** — Logo, favicon, primary/secondary/accent colors, heading and body fonts with live preview
- **Pages** — CMS editor for About, Terms, Privacy, FAQ with meta tags
- **Offers** — Create promotions with badges, codes, discount amounts, min order values
- **Banners** — Manage home page carousel with background colors and CTA buttons

**Roles:**
- `owner` — Full access to everything
- `manager` — Can manage orders, menu, team, settings
- `kitchen` — Can view/update order status only
- `viewer` — Read-only access

## Campaign Runner

A standalone WhatsApp marketing tool that connects to the Go bot.

```bash
cd campaign-runner
npm install
npm run dev
```

Open `http://localhost:5173` — go to Settings → enter Bot API URL (`http://localhost:8090`) and your admin key.

**6 tabs:**
- **Dashboard** — Stats cards, 7-day activity chart, recent campaigns, tag breakdown
- **Customers** — Search, filter by tag, paginated table, CSV import/export, bulk operations
- **Campaigns** — 3-step wizard (Compose → Recipients → Review), WhatsApp-style live preview, scheduling, live progress
- **Templates** — Reusable messages with merge tags ({name}, {discount}, {brand_name}), 6 presets
- **Media** — Upload images, grid gallery, copy URL
- **Settings** — Brand name/logo/color, bot connection, delay config

**How it sends:**
- Customers sync from the bot's PostgreSQL via `/admin/customers`
- Messages send through the bot's `/admin/broadcast/send` endpoint
- No direct Evolution GO access — all WhatsApp operations go through the bot

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

# Or use Docker
docker compose -f docker/examples/docker-compose.yml up -d
```

**Connecting to OCP:**
1. Open the Evolution GO manager at `http://localhost:8081`
2. Create an instance named `OCP`
3. Scan the QR code with the restaurant's WhatsApp number
4. Set the webhook URL to `http://YOUR_SERVER:8090/webhook/evolution`
5. Set `EVOLUTION_WEBHOOK_SECRET` in `bot/.env` to the same value
6. Configure the instance token and API key in `bot/.env`

## License

MIT — see [LICENSE](LICENSE) for details.
