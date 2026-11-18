# Production go-live checklist

The code is ready; these are the deployment steps that remain. Run them in staging first.

**Deployment paths:** see `docs/DEPLOYMENT.md` for the full hybrid (Vercel +
Fly.io + Neon/Supabase + R2) and single-VPS (Docker Compose + Caddy) guides. The
checks below apply to both.

## 1. Validate config before deploying

```bash
# Static topology check (no Docker daemon needed)
cd bot && go run ./scripts/validate_infra -root ..
```

It verifies `depends_on` targets, named volumes, bind-mount sources, Dockerfile
paths, required env vars, nginx brace balance, and that every upstream host is
a real compose service. With `-preflight` it also checks the current environment
for missing secrets and unsafe defaults (exits non-zero on failure).

## 2. Required secrets (non-negotiable)

| Var | Notes |
|---|---|
| `DB_PASSWORD` | Postgres + PgBouncer + campaign + evolution all use it |
| `BOT_ADMIN_KEY` | >= 24 random chars |
| `EVOLUTION_WEBHOOK_SECRET` | shared with the WhatsApp provider |
| `CAMPAIGN_ENCRYPTION_KEY` | required if campaign state holds credentials |
| `OTP_PEPPER` | OTP hashes become unpeppered if empty |
| `CORS_ALLOWED_ORIGINS` | real storefront/admin domains, no wildcards |

## 3. Scale settings (from the 1000-user load test — see LOAD_TEST.md)

```bash
BOT_REPLICAS=3                      # behind bot-lb
RATE_LIMIT_BACKEND=postgres         # shared counters across replicas
API_RATE_LIMIT_PER_MIN=300          # counts writes only; reads bypass
PUBLIC_READ_CACHE_TTL_SECS=15       # 0 disables — do NOT disable at scale
ETAG_ENABLED=1
BIZ_CONFIG_CACHE_TTL_SECS=60
PG_PUBSUB_ENABLED=true              # SSE fan-out across replicas
PG_PHONE_LOCKS_ENABLED=true         # duplicate-order prevention
BROADCAST_ASYNC=1
ORDER_STREAM_RESYNC_SECS=0          # push-only; 0 avoids per-tracker polling
STORAGE_BACKEND=s3                  # local uploads are not shared across replicas
```

**Set `TRUSTED_PROXIES` to the LB subnet/CIDR.** Otherwise `c.ClientIP()` is the
load balancer's IP, so every shopper shares one rate-limit bucket.

**Set `SINGLE_TENANT_MODE=false` for SaaS.** In single-tenant mode an unscoped
request falls back to the bootstrap restaurant.

## 4. Start and verify the stack

Docker is not available in the development sandbox, so this step is still
outstanding. In staging:

```bash
docker compose config          # renders the final merged config
docker compose up -d --build
docker compose ps              # every service healthy / init exited 0
curl -fsS http://localhost:8090/health
curl -fsS http://localhost:8090/ready
curl -fsS http://localhost:8090/metrics | head
```

Then confirm:
- `bot-init` exited 0 before `bot` replicas started (migrations ran once).
- `/metrics` shows `ocp_db_pool_in_use` below `DB_MAX_OPEN_CONNS`.
- Two `bot` replicas: create an order via one and watch the SSE event arrive
  through the other (validates `LISTEN/NOTIFY` fan-out).
- Parallel duplicate order submits for one phone yield exactly one order
  (validates advisory phone locks).

## 5. Load test

```bash
cd scripts/loadtest
go run . -base http://staging:8090 -users 1000 -duration 5m
go run . -base http://staging:8090 -users 1000 -duration 5m -with-admin -admin-key "$BOT_ADMIN_KEY"
```

Target: zero HTTP 5xx/429, p95 < 500ms for shopper reads, DB pool not pinned at
max for sustained periods. Add a write-heavy order-creation profile in staging.

## 6. Storage / backups

- Point `STORAGE_*` at S3/MinIO/R2; `go test ./services -run TestS3StorageBackend`
  verifies the abstraction against a mock. Test a real upload/list/delete once.
- Schedule `scripts/backup.sh` and verify `scripts/restore.sh` against a scratch DB.
- Pin the unpinned images flagged `TF-PIN` to digests before production.

## 7. Known residual items

- GitHub Dependabot: 6 of 8 advisories fixed in the working tree; the 2
  `picomatch` alerts have no upstream patch and are documented as dev-only in
  `docs/DEPENDABOT_TRIAGE.md` (dismissal recommended but not executed).
- Campaign cache is eventually consistent across replicas (CAS rejects a stale
  writer and refreshes it rather than silently clobbering; see the concurrency
  test). Sub-second cross-replica edit propagation would need a semantic merge.
