# Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Devices                           │
│                    (Phone / Desktop Browser)                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (nginx)                         │
│                     React 19 + Vite + TypeScript                │
│                         Port 3000                               │
│                                                                 │
│  Customer Site: Home, Menu, Cart, Checkout, Order Tracking      │
│  Admin Dashboard: Orders, Menu, Chat, Settings, Analytics       │
└───────────┬──────────────────────┬──────────────────────────────┘
            │ /api/*               │ /admin/*
            ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Bot (Go/Gin)                             │
│                          Port 8090                              │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐     │
│  │  Handlers   │  │   Services   │  │      Admin         │     │
│  │  /api/*     │  │  menu        │  │  orders, menu      │     │
│  │  /auth/*    │  │  order       │  │  chat, settings    │     │
│  │  /webhook/* │  │  customer    │  │  analytics, team   │     │
│  │  /health    │  │  conversation│  │  audit, broadcast  │     │
│  └─────────────┘  └──────────────┘  └────────────────────┘     │
│                                                                 │
│  Security: Rate limiting, webhook auth, OTP hashing, CORS      │
└───────────┬──────────────────────────────────┬──────────────────┘
            │                                  │
            ▼                                  ▼
┌──────────────────────┐        ┌──────────────────────────────┐
│   PostgreSQL :5432   │        │    Evolution GO :8080        │
│                      │        │                              │
│  customers           │◄───────│  WhatsApp Business API       │
│  menu_items          │        │  Instance management         │
│  orders              │        │  Message sending/receiving   │
│  live_chat_messages  │        │  Webhook forwarding          │
│  admin_users         │        │                              │
│  settings            │        └──────────────────────────────┘
│  audit_log           │                    ▲
└──────────────────────┘                    │
                                            │
                                ┌───────────┴──────────────┐
                                │   WhatsApp Cloud         │
                                │   (User's phone)        │
                                └──────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   Campaign Runner :3001                         │
│                  Express + React (standalone)                   │
│                                                                 │
│  Connects to Bot API for customer data and message sending.    │
│  No direct Evolution GO access — all WhatsApp calls go         │
│  through the bot's broadcast endpoint.                         │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Customer Orders via WhatsApp

```
User sends WhatsApp message
    → Evolution GO receives it
    → Evolution GO forwards to bot webhook (/webhook/evolution)
    → Bot verifies webhook signature (HMAC-SHA256)
    → Conversation engine processes message
    → Bot sends reply via Evolution GO API
    → Evolution GO delivers to WhatsApp
```

### Customer Orders via Website

```
User adds items to cart (localStorage)
    → Proceeds to checkout
    → POST /api/auth/send-otp (receives OTP on WhatsApp)
    → POST /api/auth/verify-otp (receives session token)
    → POST /api/orders (with auth token)
    → Bot creates order in PostgreSQL
    → Bot sends confirmation via WhatsApp
```

### Admin Operations

```
Admin logs in at /admin
    → Enters admin key (X-Admin-Key header)
    → Bot verifies key (constant-time comparison)
    → Returns JWT session token
    → All subsequent requests use Authorization header
    → Every action logged to audit_log table
```

### Campaign Sending

```
Admin creates campaign in Campaign Runner
    → Campaign Runner calls GET /admin/customers (bot API)
    → Admin selects recipients, writes message
    → POST /admin/broadcast/send (bot API)
    → Bot normalizes phone numbers (10-digit → 91+ prefix)
    → Bot sends messages via Evolution GO (parallel, 50ms delay)
    → Each message persisted to live_chat_messages
    → Results returned to Campaign Runner
```

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `customers` | WhatsApp phone, name, conversation state |
| `menu_items` | Item name, price, description, category, image |
| `orders` | Customer order with status tracking |
| `order_items` | Individual items in an order |
| `live_chat_messages` | All WhatsApp messages (in/out) |
| `admin_users` | Admin credentials (hashed keys, roles) |
| `settings` | Restaurant config (name, hours, fees) |
| `audit_log` | Every admin action with timestamp |

## Security Model

- **Webhook**: HMAC-SHA256 signature verification (rejects when secret is empty)
- **Admin auth**: SHA-256 hashed keys, constant-time comparison
- **OTP**: SHA-256 hashed, `SELECT ... FOR UPDATE` to prevent race conditions
- **Rate limiting**: IP-based window counters (separate limits per endpoint group)
- **Sessions**: 24-hour expiry, validated on every request
- **Input validation**: Body size limits (1MB), broadcast caps (200 recipients)
- **Headers**: HSTS, CSP, X-Content-Type-Options, X-Frame-Options
