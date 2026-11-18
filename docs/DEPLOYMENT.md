# Deployment guide

Two production paths are supported. Both keep the architecture intact —
Postgres `LISTEN/NOTIFY`, advisory phone locks, the broadcast queue and the
campaign scheduler all require **always-on processes with persistent DB
connections**, which is why a pure Vercel-serverless deployment is not viable
(see the justification at the end).

| | Option 1 — Hybrid | Option 2 — Single VPS |
|---|---|---|
| Frontend | Vercel (free) | Caddy on the VPS |
| Backend | Fly.io (always-on Machines) | Docker Compose on the VPS |
| Postgres | Neon / Supabase (free tier) | Local `postgres:16` container |
| Object storage | Cloudflare R2 (free tier) | Local `bot_uploads` volume |
| TLS | Vercel + Fly automated | Caddy + Let's Encrypt automated |
| Cost at low traffic | ~$0 | $0 (Oracle always-free) or ~$5–10/mo |
| Ops complexity | 4 services to configure | One box to maintain |
| Best for | Teams wanting managed infra / global edge | Simplest single-tenant deployment |

> **Deploys are opt-in in CI.** The two deploy workflows are skipped by default
> so a push to `master` never fails just because credentials are not configured
> yet. To enable:
> - Hybrid: set repository variable `DEPLOY_VERCEL_ENABLED=true` and secrets
>   `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`; set
>   `DEPLOY_FLY_ENABLED=true` and secret `FLY_API_TOKEN`.
> - Optional WhatsApp bridge: set `DEPLOY_EVOLUTION=false` to skip it.
> The always-green `CI` workflow runs on every push regardless.

---

## Option 1 — Hybrid (Vercel + Fly.io + Neon/Supabase + R2)

### 1. Postgres (Neon or Supabase)

1. Create a free project. Copy the **pooled** connection string.
2. Convert it for the Go services: `postgresql://…?sslmode=require`.
3. Both providers support `LISTEN/NOTIFY` and session advisory locks — required
   for cross-replica SSE fan-out and duplicate-order prevention.
4. Note Neon's scale-to-zero: set it to **disabled** (or choose Supabase) so the
   LISTEN connection is never dropped.

### 2. Object storage (Cloudflare R2)

Create a bucket and an S3 API token with `Object Read & Write`. You need the
account ID, bucket name, access key ID and secret.

### 3. Fly apps

```bash
fly apps create ocp-bot        # must match `app =` in fly.bot.toml
fly apps create ocp-campaign
fly apps create ocp-evolution  # skip if you don't use WhatsApp

# Volumes (one per region; use the same region as your app)
fly volumes create bot_uploads     --region sin --size 1 -a ocp-bot
fly volumes create campaign_data   --region sin --size 1 -a ocp-campaign
fly volumes create campaign_uploads --region sin --size 1 -a ocp-campaign
```

Set secrets (never commit these):

```bash
fly secrets set -a ocp-bot \
  BOT_DATABASE_URL='postgresql://…?sslmode=require' \
  BOT_ADMIN_KEY='<32+ random chars>' \
  OTP_PEPPER='<random>' \
  CORS_ALLOWED_ORIGINS='https://your-domain.vercel.app,https://yourdomain.com' \
  TRUSTED_PROXIES='<Fly egress CIDR — see note below>' \
  SINGLE_TENANT_MODE='true' \
  BASE_DOMAIN='yourdomain.com' \
  EVOLUTION_API_URL='https://ocp-evolution.fly.dev' \
  EVOLUTION_API_KEY='<key>' \
  EVOLUTION_WEBHOOK_SECRET='<secret>' \
  EVOLUTION_INSTANCE='OCP' \
  EVOLUTION_INSTANCE_TOKEN='<token>' \
  STORAGE_ENDPOINT='<account>.r2.cloudflarestorage.com' \
  STORAGE_BUCKET='<bucket>' \
  STORAGE_ACCESS_KEY='<key>' \
  STORAGE_SECRET_KEY='<secret>' \
  STORAGE_PUBLIC_URL='https://<r2-public-domain>' \
  RESTAURANT_WHATSAPP_NUMBER='<number>'

fly secrets set -a ocp-campaign \
  CAMPAIGN_DATABASE_URL='postgresql://…?sslmode=require' \
  BOT_API_URL='http://ocp-bot.flycast:8090' \
  BOT_ADMIN_KEY='<same as bot>' \
  CAMPAIGN_ENCRYPTION_KEY='<random>' \
  CORS_ALLOWED_ORIGINS='https://yourdomain.com'

fly secrets set -a ocp-evolution \
  DATABASE_CONNECTION_URI='postgresql://…?sslmode=require' \
  POSTGRES_USERS_DB='postgresql://…?sslmode=require' \
  POSTGRES_AUTH_DB='postgresql://…?sslmode=require' \
  SERVER_URL='https://ocp-evolution.fly.dev' \
  AUTHENTICATION_API_KEY='<key>' \
  CORS_ALLOWED_ORIGINS='https://yourdomain.com'
```

Deploy (the GH Action does this on push to `master`; manual commands below):

```bash
fly deploy --config fly.bot.toml --remote-only
fly deploy --config fly.campaign.toml --remote-only
fly deploy --config fly.evolution.toml --remote-only
```

> **`TRUSTED_PROXIES` note:** Fly's edge proxy sets `X-Forwarded-For`. Set this
> to Fly's current egress CIDRs (check `flyctl ips list` / Fly docs) so
> `c.ClientIP()` sees the real shopper IP. Leaving it empty makes every shopper
> share the proxy IP for rate limiting. Do **not** use `0.0.0.0/0` — that allows
> header spoofing.

### 4. Vercel

1. Import the repo into Vercel. Keep the **root directory as the repo root**
   (`vercel.json` handles the `frontend/` build).
2. Project settings → Environment Variables (Production):
   - `VITE_API_BASE_URL` = `https://ocp-bot.fly.dev`
     (this is **inlined at build time** — the GH Action runs `vercel build`, so
     it must be present in Vercel's project env, not just in the runner).
   - Do **not** set `VITE_CAMPAIGN_ADMIN_KEY` in production — it is a dev-only
     auto-fill for the campaign UI.
3. GitHub repo secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
4. Push to `master` → `.github/workflows/deploy-frontend-vercel.yml` deploys.
5. Add your custom domain in Vercel and point DNS at it.

### 5. Verify

```bash
curl -fsS https://ocp-bot.fly.dev/health
curl -fsS https://ocp-bot.fly.dev/ready
curl -fsS https://ocp-bot.fly.dev/metrics | head
curl -fsSI https://your-domain.vercel.app/   # expect 200 + security headers
```

Then run the load test against `https://ocp-bot.fly.dev` (see `LOAD_TEST.md`).

---

## Option 2 — Single VPS (Docker Compose + Caddy)

Works on any VPS with ~2 GB RAM; Oracle Cloud's always-free ARM VM is $0.

### 1. Bootstrap

```bash
# On the VPS, as a sudo-capable user:
git clone https://github.com/zubershk/ocp.git /srv/ocp
cd /srv/ocp
bash deploy/vps/setup.sh
```

`setup.sh` installs Docker + Compose, opens only 22/80/443, creates
`deploy/vps/.env` with **generated secrets**, and installs a nightly backup
cron. It will not overwrite an existing `.env`.

### 2. Configure

Edit `deploy/vps/.env`:

- `DOMAIN`, `WWW_DOMAIN`, `API_DOMAIN`, `CAMPAIGN_DOMAIN`, `EVOLUTION_DOMAIN`
- `VITE_API_BASE_URL=https://api.<your-domain>`
- `CORS_ALLOWED_ORIGINS` — add all your real HTTPS origins
- `TRUSTED_PROXIES=172.16.0.0/12` (Docker network — Caddy sets the real client IP)
- Keep `SINGLE_TENANT_MODE=true` unless you have configured tenant routing
  (subdomains via `BASE_DOMAIN`, or `VITE_TENANT_HEADER=1` on the frontend).
- Optionally delete the `evolution` service block from
  `deploy/vps/docker-compose.prod.yml` + `Caddyfile` if unused.

Point DNS A/AAAA records for all hostnames at the VPS IP. Caddy obtains
certificates automatically once ports 80/443 are reachable.

### 3. Deploy and verify

```bash
cd /srv/ocp
bash deploy/vps/deploy.sh
```

The script validates the merged compose config, builds, starts everything,
waits for health, and checks the public HTTPS endpoints. It refuses to run
with placeholder secrets.

Note: `deploy/vps/docker-compose.prod.yml` uses Compose's `!reset` tag to strip
the dev host ports — requires **Docker Compose v2.24+**.

### 4. Backups

`scripts/backup.sh` runs nightly at 02:00. Test a restore against a scratch DB:

```bash
bash scripts/restore.sh <backup-file>
```

---

## Why not Vercel alone?

Vercel Hobby runs stateless functions, not long-lived processes. The following
OCP features would break:

- `LISTEN/NOTIFY` SSE fan-out — needs a persistent Postgres connection
- Postgres advisory phone locks — session-scoped, die with each invocation
- Broadcast queue workers + campaign leader election — need always-on processes
- Local uploads — filesystem is read-only/ephemeral
- PgBouncer, Evolution GO and the nginx LB — no sidecars/containers on Hobby

A full serverless rewrite would mean replacing all four; the hybrid path keeps
the code unchanged and still gives you a free Vercel frontend.

## Rollback

- **Fly:** `fly deploy --config fly.bot.toml --remote-only` on the previous
  commit (Fly keeps the last images). `fly releases -a ocp-bot` lists them.
- **Vercel:** instant rollback via the Vercel dashboard Deployments tab, or
  re-run the deploy workflow on the previous commit.
- **VPS:** `git checkout <previous-tag>` then `bash deploy/vps/deploy.sh`.
  Restore Postgres with `scripts/restore.sh` if a migration needs reverting.
