# Northflank free deployment (bot + Evolution)

This deploys the **bot** and **Evolution GO** on Northflank's free Sandbox,
with a small managed Postgres. The campaign runner and frontend are **not**
deployed here:

- **Frontend** → deploy separately on Vercel (see root `vercel.json` and
  `docs/DEPLOYMENT.md`); set `VITE_API_BASE_URL` to the bot's public URL.
- **Campaign runner** → intentionally omitted. The free Sandbox allows only
  **2 services + 1 database**, both consumed by the bot and Evolution. The
  bot's broadcast worker (`broadcast_jobs` table + `FOR UPDATE SKIP LOCKED`)
  still works without campaign-runner; campaign scheduling/UI does not.

## Cost (free Sandbox)

| Resource | Plan | $/mo |
|---|---|---|
| bot | `nf-compute-20` (0.2 vCPU / 512 MB) | 5.40 |
| Evolution | `nf-compute-20` | 5.40 |
| Postgres (10 GB) | `nf-compute-20` + disk | 6.57 |
| **Total** | | **~17.37** (under the $20 free cap) |

Egress is $0.06/GB and build time also counts toward the $20 cap. Keep traffic
modest. If Evolution needs more memory, move Postgres to an external free
provider (Nile/Aiven) and use `nf-compute-50` (1 GB) for Evolution.

## Prerequisites

1. Northflank account (free Sandbox, no card needed per pricing page).
2. GitHub account **linked to Northflank** with access to `zubershk/ocp`
   (required for CI auto-deploy).
3. A Cloudflare account with an R2 bucket + S3 API token (Object Read & Write)
   for uploads — or adapt `STORAGE_*` to Backblaze B2 (see `docs/DEPLOYMENT.md`).

## Step 1 — Set template secrets (argumentOverrides)

Northflank template `argumentOverrides` are stored **outside Git** — never
commit real secrets. In the template's **Settings → argument overrides**, set:

| Argument | Value |
|---|---|
| `BOT_ADMIN_KEY` | `openssl rand -hex 32` |
| `OTP_PEPPER` | `openssl rand -hex 32` |
| `EVOLUTION_WEBHOOK_SECRET` | `openssl rand -hex 16` |
| `EVOLUTION_API_KEY` | strong random key (shared bot ↔ Evolution) |
| `EVOLUTION_INSTANCE_TOKEN` | a UUID (`uuidgen` / `python -c "import uuid;print(uuid.uuid4())"`) |
| `RESTAURANT_WHATSAPP_NUMBER` | business number, international without `+` (e.g. `919876543210`) |
| `CORS_ALLOWED_ORIGINS` | `https://<your-vercel-domain>,https://<bot-domain>` |
| `STORAGE_ENDPOINT` | `<account-id>.r2.cloudflarestorage.com` (host only, no `https://`) |
| `STORAGE_BUCKET` | R2 bucket name |
| `STORAGE_ACCESS_KEY` | R2 S3 token access key ID |
| `STORAGE_SECRET_KEY` | R2 S3 token secret |
| `STORAGE_PUBLIC_URL` | `https://pub-<hash>.r2.dev` (dev) or a Cloudflare custom domain (prod) |
| `STORAGE_HOST` | **hostname only** from the above URL, e.g. `pub-<hash>.r2.dev` or `cdn.yourdomain.com` (no `https://`, no path) |
| `EVOLUTION_DOMAIN` | the Evolution public domain (custom domain or the `*.code.run` URL shown after first deploy) |
| `PROJECT_REGION` | e.g. `europe-west` (closest to your customers) |

Non-secret arguments (`REPO_URL`, `REPO_BRANCH`, `BOT_DOMAIN`) can stay at their
template defaults. Leave `BOT_DOMAIN` empty unless you add a custom domain.

> **Why `EVOLUTION_DOMAIN` matters:** the bot configures Evolution's webhook at
> startup using the public bot URL (internal DNS is used when Evolution's URL
> contains `evolution:`). Evolution's own `SERVER_URL` must be its real public
> URL — set it via `EVOLUTION_DOMAIN`. If you don't have a custom domain yet,
> deploy once, read the `*.code.run` URL from the Evolution service overview,
> then set this argument and re-run the template.

## Step 2 — Import and run the template

1. Northflank → **Templates** → **Create template** → **Import/Edit as code**.
2. Paste the contents of `northflank/template.json`.
3. Fill the `argumentOverrides` above in Settings.
4. **Run** the template. It creates: project → Postgres addon → secret group →
   waits for DB → bot service → Evolution service.
5. Both services build from GitHub on push to `master` (`disabledCI: false`),
   with path filters so only `bot/**` or `evolution-go/**` changes rebuild.

## Step 3 — Custom domains (optional but recommended)

Public ports get a `*.code.run` URL with automatic TLS out of the box. To use
your own domains:

1. Add the domain in Northflank → **Domains**, add the requested DNS records.
2. Verify ownership, then link the subdomain to the bot (8090) and Evolution
   (8080) ports. Certificates are issued automatically.
3. Update `CORS_ALLOWED_ORIGINS` and `EVOLUTION_DOMAIN` overrides and re-run the
   template.

## Step 4 — Verify

```bash
BOT=https://<bot-domain-or-code.run>
EVOLUTION=https://<evolution-domain-or-code.run>

curl -fsS $BOT/health                     # bot liveness
curl -fsS $BOT/ready                      # 200; check body's evolution.ok
curl -fsS $BOT/metrics | head             # Prometheus counters
curl -fsS $EVOLUTION/health               # Evolution liveness
```

Check the bot logs for `[pubsub] listening on ocp_events` (LISTEN/NOTIFY active)
and `Webhook configured` (Evolution reachable).

Then: create an order through the storefront (or `POST /api/orders`) and confirm
the WhatsApp notification is sent to `RESTAURANT_WHATSAPP_NUMBER`. Verify a
real R2 upload via `POST /admin/upload` (X-Admin-Key, multipart field `image`)
and that the returned URL is publicly reachable.

Finally run the load harness from `scripts/loadtest` against `$BOT`.

## Troubleshooting

- **`config.Validate` fatal on boot** — all of `BOT_DATABASE_URL`,
  `BOT_ADMIN_KEY`, `OTP_PEPPER`, `EVOLUTION_WEBHOOK_SECRET`, `EVOLUTION_API_URL`,
  `CORS_ALLOWED_ORIGINS` are required. The secret group supplies them.
- **`/api/orders` → 400 "tenant required"** — `SINGLE_TENANT_MODE` must be
  `true` (set in the secret group). The production image hard-codes
  `GIN_MODE=release`, where the default is multi-tenant.
- **Cross-replica events don't arrive** — do **not** enable the Postgres
  connection pooler; it breaks session-scoped `LISTEN`. The bot also needs
  `BOT_DATABASE_URL` with TLS (lib/pq defaults to `sslmode=require`).
- **Frontend blank page** — `VITE_API_BASE_URL` must be set in Vercel
  Production **before** the build (Vite inlines it).
- **Evolution build fails** — it is the heaviest image (CGO + ffmpeg +
  poppler). Verify the root-context build locally first if needed.
