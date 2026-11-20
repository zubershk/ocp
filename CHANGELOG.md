# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/). Release notes are also generated on
GitHub Releases when a `v*` tag is pushed.

## [Unreleased]

### Added
- Northflank free Sandbox deployment template (`northflank/template.json`) with
  bot + Evolution GO + managed Postgres, native GitHub auto-deploy.
- Single-VPS production stack (`deploy/vps/`) with Caddy automatic TLS, bootstrap
  and deploy scripts with secret guards and backup cron.
- Vercel (frontend) and Fly.io (backend, legacy) deploy workflows, opt-in via
  repository variables.
- Daemon-free infrastructure validator (`bot/scripts/validate_infra`) wired into
  CI as the `infra-config` job.
- Reproducible 1000-user load harness (`scripts/loadtest`) and `docs/LOAD_TEST.md`.
- Mock-S3 storage tests and injectable storage provider.
- Two-replica campaign concurrency test (advisory lock + `xmin` CAS).
- Production checklist, deployment guide and dependency-triage docs.
- 21 real product screenshots embedded throughout the README.

### Changed
- Global `/api/*` rate limiter now counts writes only (safe reads bypass), so
  shoppers behind one NAT/CGNAT IP are not throttled.
- Anonymous storefront GETs served from a 15s read-through cache.
- Single access log line per request; single-tenant fallback warning once.
- Campaign same-key writes use optimistic concurrency instead of
  last-writer-wins.
- README expanded into a product-style open-source overview with a maintainer
  section, roadmap and dynamic badges.

### Security
- Resolved 6 Dependabot JS advisories (uuid, zod, minimatch, source-map-js) and
  applied all pending Go/frontend/campaign dependency bumps; 0 open advisories.
- `govulncheck`, CodeQL SAST, gitleaks and fail-closed `npm audit` green in CI.

## [Earlier]

The project began as a self-hosted pizza ordering system with WhatsApp ordering,
a real-time admin dashboard and a POS. See the git history for the full record.
