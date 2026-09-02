# Orange Cheese Pizza — Online Ordering System

[![CI](https://github.com/zubershk/ocp/actions/workflows/ci.yml/badge.svg)](https://github.com/zubershk/ocp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-ready-blue.svg)](docker-compose.yml)

Full-stack food ordering platform with WhatsApp integration, real-time order management, a production-ready admin dashboard, and a WhatsApp marketing campaign runner. Built for small food businesses that want an online ordering presence without paying third-party commissions.

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

---

## What This Does

**For customers:**
- Browse the full menu with real product photos, prices, and dietary info
- Filter by category, spice level, budget, or family packs
- Search with autocomplete — recent searches saved, popular items highlighted, keyboard navigation
- Customise pizzas (size, crust, toppings) and see price updates live
- Place orders with address autocomplete (Nominatim-powered) and delivery radius check
- Pay by cash or UPI on arrival
- Track order status in real-time (10-second polling) with a visual timeline
- WhatsApp OTP login — no passwords, just a 6-digit code
- View order history and reorder past orders
- PWA support — works offline, installs to home screen, push notification ready

**For the restaurant:**
- Real-time order dashboard with live polling and sound alerts
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
- **Offers & promotions** — create deals with badges, codes, discount amounts, min order
- **Banner carousel** — add/edit home page banners with background colors and CTA buttons
- **SEO settings** — meta title, description, OG image, favicon
- **Social links** — Instagram, Facebook, Twitter, YouTube, WhatsApp
- **Footer** — copyright text, tagline, delivery hours, outlet info — all dynamic
- **Bot message templates** — every WhatsApp response stored in DB, editable via admin with live WhatsApp preview, variable reference ({name}, {order_number}, {brand_name}, etc.), per-message reset to defaults
- **Business configuration** — sizes, payment methods, category icons, order prefix, currency, delivery fee, min order — all configurable for any business type
- **Crust management** — crust names and per-size prices managed via admin CRUD API
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
| Backend | Go 1.21 + Gin web framework |
| Database | PostgreSQL 14+ |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS |
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
│   │   ├── site_settings_handler.go  # Site settings, pages, categories API
│   │   └── rate_limit.go         # IP-based rate limiting
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
│   │   ├── wa_emoji.go              # WhatsApp emoji constants
│   │   ├── live_chat_service.go  # WhatsApp message persistence
│   │   ├── evolution_client.go   # Evolution GO HTTP client
│   │   └── whatsapp_cart_service.go  # Persistent WhatsApp cart
│   ├── migrations/               # 16 SQL migration files
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

---

## Prerequisites

- **Docker** and **Docker Compose** (recommended)
- Or: **Node.js** 18+, **Go** 1.21+, **PostgreSQL** 14+

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

The bot runs 16 migrations on startup covering:

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
2. Go to [vercel.com](https://vercel.com) and import the `zubershk/ocp` repo
3. Set the root directory to `frontend`
4. Add environment variable: `VITE_API_BASE_URL` = your backend URL
5. Deploy

Vercel config includes security headers (HSTS, CSP, X-Frame-Options), SPA routing rewrites, and 1-year immutable asset caching.

### Deploying Backend

The Go backend needs to run on a server with PostgreSQL access. Options:
- **Railway** / **Render** — easy Go deployment with managed PostgreSQL
- **VPS** (DigitalOcean, Hetzner) — full control, run via systemd
- **Your own machine** — for local development only

Set `CORS_ALLOWED_ORIGINS` in `bot/.env` to include your Vercel domain.

---

## Security

The codebase has been audited and hardened for production use:

- **Webhook authentication** — HMAC-SHA256 signature verification; rejects webhooks when `EVOLUTION_WEBHOOK_SECRET` is empty
- **Admin key comparison** — constant-time via `crypto/subtle` to prevent timing attacks; keys stored as SHA-256 hashes
- **Rate limiting** — IP-based window counters on all endpoint groups:
  - `/auth/send-otp` — 3 requests/min
  - `/auth/verify-otp` — 10 requests/min
  - `/api/*` — 120 requests/min
  - `/admin/*` — 60 requests/min
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
- **File uploads** — content-type sniffing, 5MB limit, random filenames (no path traversal)
- **Session tokens** — 192-bit entropy, SHA-256 hashed at rest, 24-hour expiry, server-side invalidation on logout
- **IDOR protection** — order access requires access token or Bearer ownership (no sequential IDs exposed)
- **Idempotency** — unique key per order creation request prevents duplicate orders
- **Memory management** — conversation locks cleaned up every 30 minutes
- **Docker security** — required env vars (no defaults), locked CORS, minimal base images (alpine)

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
| `GET` | `/api/orders/:token` | Get order details by access token |
| `GET` | `/api/tracking/:token` | Public order tracking (status, ETA, items) |
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
| `POST` | `/api/auth/verify-otp` | Verify OTP, get session token (24h expiry) |
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
| `POST` | `/admin/upload` | Upload product photo (5MB max, content-type validated) |
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

### Webhook

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook/evolution` | Evolution GO event receiver (HMAC-SHA256 verified, rate limited: 300/min) |
| `POST` | `/webhook/button` | Evolution GO button click receiver |

---

## Admin Dashboard

Access at `your-domain/admin` (or `localhost:5173/admin` in development).

Login with your `BOT_ADMIN_KEY`. The key is stored in browser localStorage only.

**Tabs:**
- **Orders** — Live order queue with status controls, sound alerts, filter by status (New, Confirmed, Cooking, Ready, En Route, Delivered, Completed, Cancelled)
- **Menu Studio** — Add/edit/delete menu items with image upload, manage categories, configure crust variants with per-size pricing
- **Live Chat** — WhatsApp conversation viewer, read incoming messages, send replies directly from admin
- **Analytics** — Sales charts with daily/weekly/monthly breakdowns, order volume, revenue tracking
- **Team** — Manage staff accounts with role-based access
- **Settings** — Restaurant name, hours, delivery config + site customization links
- **Audit Log** — Who did what, when, from where (every admin action tracked)

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
| `/r/menu/:slug` | Product | Image zoom, crust selection, size picker, add to cart with flying animation |
| `/r/cart` | Cart | Item list, quantity adjust, subtotal, tax, proceed to checkout |
| `/r/checkout` | Checkout | Address autocomplete (Nominatim), OTP flow, order summary, idempotency |
| `/r/order/:token` | Order Tracking | Real-time status timeline (10s polling), order details, items |
| `/r/login` | Login | WhatsApp OTP send/verify, phone input |
| `/r/account` | Account | Profile, order history, logout |
| `/r/offers` | Offers | Family packs, BOGO, cheese burst deals, menu links |
| `/r/locations` | Locations | Outlet cards with address, hours, online ordering status |
| `/r/about` | About | Restaurant story (API-driven) |
| `/r/contact` | Contact | Contact form, map, restaurant info |
| `/r/faq` | FAQ | Accordion FAQ (API-driven with static fallback) |
| `/r/privacy` | Privacy | API-driven privacy policy content |
| `/r/terms` | Terms | API-driven terms of service content |
| `/r/reservations` | Reservations | Table booking form, time slots, guest count |

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

# Or use Docker
docker compose -f docker/examples/docker-compose.yml up -d
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
1. Open the Evolution GO manager at `http://localhost:8081`
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
| Bot | golang:1.21-alpine → alpine:3.19 | `CGO_ENABLED=0` static build | :8090 |
| Frontend | node:20-alpine → nginx:alpine | `npm ci` + Vite build | :3000 |
| Campaign Runner | node:20-alpine | `npm ci` + build | :3001 |
| Evolution GO | golang:1.25.0-alpine → alpine:3.19.1 | `CGO_ENABLED=1` with image libs | :8080 |
| PostgreSQL | postgres:14 | — | :5432 |

### Docker Compose

- Volume persistence for uploads and database
- Network isolation between services
- Health checks on PostgreSQL
- Required environment variables (no insecure defaults)

---

## CI/CD

### GitHub Actions (`ci.yml`)
- Triggers on every push and pull request
- Go build and `go vet`
- Frontend build and TypeScript check

### Release Pipeline (`release.yml`)
- Triggers on version tags
- Builds and publishes Docker images
- Creates GitHub release with changelog

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code style, and PR guidelines.

## License

MIT — see [LICENSE](LICENSE) for details.
