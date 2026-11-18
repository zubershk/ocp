# Load test: 1000 concurrent users

Reproducible, stdlib-only harness: `scripts/loadtest` (no k3/k6/install needed).

```bash
# 1000 shoppers, 30s (default: public storefront reads only)
cd scripts/loadtest
go run . -base http://localhost:8090 -users 1000 -duration 30s

# conservative: also hammer the admin dashboard endpoints
go run . -base http://localhost:8090 -users 1000 -duration 30s \
  -with-admin -admin-key "$OCP_ADMIN_KEY"
```

It ramps N virtual users, mixes read-heavy public endpoints with optional admin
reads, polls `/metrics` for peak DB pool usage, and writes `loadtest-summary.json`.

## Environment

- Bot and load generator on the **same machine** (client and server compete for
  CPU; real clients would be separate hosts, so these numbers are conservative).
- Single bot replica, direct Postgres (no PgBouncer), `DB_MAX_OPEN_CONNS=25`.
- `ETAG_ENABLED=1`, `BIZ_CONFIG_CACHE_TTL_SECS=60`, `PUBLIC_READ_CACHE_TTL_SECS=15`,
  `LOG_LEVEL=error` for the timed runs.
- "Errors" below are **client-side network timeouts** (10s client timeout), not
  HTTP error responses. Every completed request returned HTTP 200.

## What the first run found (and what was fixed)

| Run | Users | RPS | HTTP status | Net errors | p95 | Root cause |
|---|---:|---:|---|---:|---:|---|
| Initial | 100 | 1,440 | 94.6% **429** | 0 | 222 ms | Global 120/min per-IP limiter throttled everyone behind one NAT IP |
| After read-limit fix | 100 | 867 | 100% 200 | 0 | 341 ms | All reads now actually reached the handlers |
| 1000 users, no cache | 1000 | 594 | 100% 200 | 2,499 | 3,691 ms | `/api/menu` ran 2 full DB queries per request; pool pinned at 25/25 |
| 1000 users, menu cache | 1000 | 1,307 | 100% 200 | 1,303 | 2,200 ms | Other public reads still uncached; per-request logs flooded disk |
| 1000 users, generic cache | 1000 | 1,415 | 100% 200 | 560 | 1,727 ms | Remaining log I/O + harness channel deadlock |
| **1000 shoppers, final** | **1000** | **13,700** | **100% 200** | **728 (0.18%)** | **160 ms** | — |
| **1000 + admin, final** | **1000** | **6,769** | **100% 200** | **133 (0.06%)** | **785 ms** | — |

### Fixes made as a direct result

1. **`API_RATE_LIMIT_PER_MIN` + `RateLimitSkipSafe`** — the global limiter now
   counts only writes; reads are ETag-cacheable and cheap. Per-endpoint write
   limits (orders, auth, contact, signup, reviews) are unchanged. This removes
   the shared-NAT/CGNAT throttle that made 95% of shoppers get 429.
2. **`PUBLIC_READ_CACHE_TTL_SECS` (default 15s)** — short-TTL read-through cache
   for anonymous storefront GETs, keyed by route + tenant. Successful admin
   writes invalidate it immediately; other replicas converge within the TTL.
   Auth, order, and coupon-validation paths are never cached. This is what took
   the 1000-user p95 from ~3.7s to ~160ms.
3. **One log line per request, not two** — replaced `gin.Default()` (its own
   access log) with `gin.New()` + `gin.Recovery()`, since `StructuredLogging`
   already emits a richer line.
4. **Single-tenant fallback warning now logs once per process** instead of on
   every request (thousands of identical lines/sec under load).
5. **Harness fix** — consume results concurrently; a full 100k channel used to
   deadlock workers above ~3k RPS and made a 30s test hang indefinitely.

## Interpretation

- **Zero HTTP errors at 1000 concurrent users.** All non-200 outcomes were
  client timeout tails on a machine running both ends; p99 was 380ms (shoppers)
  / 3.2s (with admin). At 13.7k RPS the remaining timeouts are 0.18%.
- DB pool still reaches 25/25 during cache misses and admin queries, but reads
  no longer queue behind it, which is why latency collapsed.
- For production: keep `PUBLIC_READ_CACHE_TTL_SECS=15`, `ETAG_ENABLED=1`,
  `RATE_LIMIT_BACKEND=postgres`, and set `TRUSTED_PROXIES` to the LB subnet.
  Run multiple `bot` replicas behind `bot-lb` + PgBouncer as in `docker-compose.yml`.

## Caveats

- This is a **single-node local test**, not a geographic/distributed load test.
- No 1000-user *write* storm (order creation) was run — write paths still have
  their per-endpoint limits and the phone advisory locks; that should be tested
  in staging against a realistic order mix.
- S3 uploads and the Docker/PgBouncer topology were not exercised here (no
  Docker/S3 service available in this environment).
