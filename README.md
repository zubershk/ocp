# Orange Cheese Pizza — Online Ordering System

Full-stack pizza ordering platform with WhatsApp integration, real-time order management, and a production-ready admin dashboard. Built for small food businesses that want an online ordering presence without paying third-party commissions.

## What This Does

**For customers:**
- Browse the full menu with real product photos, prices, and dietary info (veg/non-veg)
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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go 1.21 + Gin web framework |
| Database | PostgreSQL 14+ |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | React Context + TanStack Query |
| WhatsApp | Evolution GO (self-hosted WhatsApp API) |
| Animations | GSAP (GreenSock) |
| PWA | Service Worker + Web Manifest |

## Project Structure

```
Tech-OCP/
├── bot/                          # Go backend
│   ├── main.go                   # Entry point, routes, graceful shutdown
│   ├── config/config.go          # Environment variable loading
│   ├── database/database.go      # PostgreSQL connection pool
│   ├── models/models.go          # Data structures
│   ├── handlers/
│   │   ├── api_handler.go        # Public menu/order API, CORS
│   │   ├── webhook_handler.go    # Evolution GO WhatsApp webhook
│   │   ├── auth_handler.go       # WhatsApp OTP login
│   │   └── rate_limit.go         # IP-based rate limiting
│   ├── admin/
│   │   └── admin_handler.go      # Admin CRUD, analytics, team, audit
│   ├── services/
│   │   ├── menu_service.go       # Menu CRUD, item lookups
│   │   ├── order_service.go      # WhatsApp order processing
│   │   ├── website_order_service.go  # Web order creation, pricing
│   │   ├── customer_service.go   # Customer lookup, phone canonicalization
│   │   ├── customer_auth_service.go  # OTP/session management
│   │   └── live_chat_service.go  # WhatsApp message persistence
│   ├── migrations/               # 13 SQL migration files
│   ├── uploads/                  # Menu item product photos
│   ├── .env.example              # Environment template
│   └── go.mod / go.sum
├── frontend/                     # React frontend
│   ├── src/
│   │   ├── pages/                # Home, Menu, Product, Cart, Checkout, etc.
│   │   ├── components/           # Reusable UI components
│   │   │   ├── ui/               # Button, Card, Badge, Modal, etc.
│   │   │   └── layout/           # Navbar, Footer
│   │   ├── context/              # Cart, Toast, Auth contexts
│   │   ├── hooks/                # Custom hooks (GSAP, geolocation, etc.)
│   │   ├── services/             # API calls, cart persistence
│   │   ├── data/                 # Static data (menu fallback, outlets, offers)
│   │   └── types/                # TypeScript interfaces
│   ├── public/                   # PWA manifest, service worker, offline page
│   ├── package.json
│   └── vite.config.ts
├── start-ocp.sh                  # Production startup script
├── OCP-ControlPanel.ps1          # Windows control panel
└── .gitignore
```

## Prerequisites

- **Node.js** 18+ and npm
- **Go** 1.21+
- **PostgreSQL** 14+
- **Evolution GO** WhatsApp API instance (running on port 8080)
- **Windows** or **Linux** (scripts provided for both)

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/Tech-OCP.git
cd Tech-OCP
```

### 2. Database

Create the database and run migrations:

```bash
createdb orange_cheese_pizza_bot
psql -d orange_cheese_pizza_bot -f bot/migrations/001_initial_schema.sql
psql -d orange_cheese_pizza_bot -f bot/migrations/002_seed_data.sql
# ... run remaining migration files in order (003 through 013)
```

Or use the startup script which handles this automatically.

### 3. Backend

```bash
cd bot
cp .env.example .env
# Edit .env with your database URL, Evolution API keys, and admin key
go mod tidy
go build -o bot-ocp .
```

Generate a secure admin key:
```bash
openssl rand -hex 16
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev      # Development server on :5173
npm run build    # Production build
```

### 5. Environment Variables

**bot/.env** — Backend configuration:

| Variable | Description | Example |
|----------|-------------|---------|
| `BOT_PORT` | API server port | `8090` |
| `BOT_DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/orange_cheese_pizza_bot?sslmode=disable` |
| `EVOLUTION_API_URL` | Evolution GO API base URL | `http://localhost:8080` |
| `EVOLUTION_API_KEY` | Global Evolution API key | Your key |
| `EVOLUTION_INSTANCE` | WhatsApp instance name | `OCP` |
| `EVOLUTION_INSTANCE_TOKEN` | Instance auth token (UUID) | Your UUID |
| `BOT_ADMIN_KEY` | Admin dashboard password (hex string) | `openssl rand -hex 16` |
| `RESTAURANT_WHATSAPP_NUMBER` | Number for order notifications | `919876543210` |
| `DELIVERY_FEE` | Default delivery fee | `0` |
| `LOG_LEVEL` | Logging level | `info` |

## Running in Production

```bash
# Option 1: Startup script (handles DB setup + binary compilation)
chmod +x start-ocp.sh
./start-ocp.sh

# Option 2: Manual
cd bot && go build -o bot-ocp . && ./bot-ocp
```

The backend serves the API on `:8090`. The frontend is built to `frontend/dist/` and served separately (nginx, Vite preview, etc.).

For development, run both simultaneously:
```bash
# Terminal 1: Backend
cd bot && go run .

# Terminal 2: Frontend (proxies /api to :8090)
cd frontend && npm run dev
```

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/menu` | Full menu with categories |
| `POST` | `/api/orders` | Place a new order |
| `GET` | `/api/orders/:id` | Get order status |
| `GET` | `/health` | Health check |

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
| `PATCH` | `/admin/orders/:id` | Update order status |
| `GET` | `/admin/menu` | Menu items with full details |
| `POST` | `/admin/menu` | Create menu item |
| `PATCH` | `/admin/menu/:id` | Update menu item |
| `DELETE` | `/admin/menu/:id` | Delete menu item |
| `POST` | `/admin/upload` | Upload product photo |
| `GET` | `/admin/analytics` | Sales/order analytics |
| `GET` | `/admin/team` | List team members |
| `POST` | `/admin/team` | Add team member |
| `GET` | `/admin/audit` | Audit log |
| `GET` | `/admin/settings` | Restaurant settings |
| `PUT` | `/admin/settings` | Update restaurant settings |
| `GET` | `/admin/chat` | WhatsApp chat history |

### Webhook

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook/evolution` | Evolution GO event receiver |

## Menu Images

Upload product photos to `bot/uploads/`. The backend stores image paths in the database. To bulk-upload:

```bash
# Place images in bot/uploads/ with filenames matching item slugs
# Or use the admin dashboard to upload individual photos
```

93 of 98 menu items have real product photos. Items without photos fall back to the default image.

## Admin Dashboard

Access at `your-domain/admin` (or `localhost:5173/admin` in development).

Login with your `BOT_ADMIN_KEY`. The key is stored in browser localStorage only.

**Tabs:**
- **Orders** — Live order queue with status controls and sound alerts
- **Menu Studio** — Add/edit/delete menu items with image upload
- **Live Chat** — WhatsApp conversation viewer
- **Analytics** — Sales charts, daily/weekly/monthly breakdowns
- **Team** — Manage staff accounts with role-based access
- **Settings** — Restaurant name, hours, delivery config, tax settings
- **Audit Log** — Who did what, when

**Roles:**
- `owner` — Full access to everything
- `manager` — Can manage orders, menu, team, settings
- `kitchen` — Can view/update order status only
- `viewer` — Read-only access

## WhatsApp Integration

This system uses **Evolution GO** as the WhatsApp API gateway.

**How it works:**
1. Customer places an order on the website
2. Backend creates the order and sends a WhatsApp notification to the restaurant
3. When order status changes (Preparing → Out for Delivery), a WhatsApp message is sent to the customer
4. Incoming WhatsApp messages are persisted in the database for the admin Live Chat tab

**Setup:**
1. Install Evolution GO and create an instance named `OCP`
2. Scan the QR code with the restaurant's WhatsApp number
3. Set the webhook URL in Evolution GO to `http://YOUR_SERVER:8090/webhook/evolution`
4. Configure the instance token and API key in `bot/.env`

## Windows Control Panel

For Windows users, a PowerShell control panel is included:

```powershell
# Right-click OCP-ControlPanel.ps1 → Run with PowerShell
# Or from terminal:
.\OCP-ControlPanel.ps1
```

Provides menu options to start/stop services, view logs, and manage the system.

## License

Private — for Orange Cheese Pizza internal use. Not licensed for redistribution.
