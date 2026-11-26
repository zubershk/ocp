# Agent Guide — OCP (Orange Cheese Pizza)

## Versioning

OCP uses [Semantic Versioning](https://semver.org/): `vMAJOR.MINOR.PATCH` (e.g. `v1.0.0`, `v1.1.0`, `v2.0.0`).

| Segment | When to bump | Resets |
|---------|-------------|--------|
| **MAJOR** | Breaking changes (removed features, changed API, breaking DB migrations) | Minor & Patch → `0` |
| **MINOR** | New backward-compatible features | Patch → `0` |
| **PATCH** | Bug fixes, security patches, docs-only changes | — |

### Cutting a release

1. Choose the next version tag (e.g. `v1.0.0` for the first stable release).
2. Create and push the tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. The push triggers `.github/workflows/release.yml` (triggered on tags matching `v*`), which:
   - Builds & pushes Docker images to GHCR (`ghcr.io/zubershk/ocp:...-bot`, `-frontend`, `-campaign`)
   - Creates a GitHub Release with auto-generated notes
4. Verify the release at `github.com/zubershk/ocp/releases`.
5. The README Release badge (`img.shields.io/github/v/release/zubershk/ocp`) auto-flips from red to green showing the version.

### Rules

- Never retag or force-push a release tag — once pushed, treat it as immutable.
- Tag only clean commits. Do not tag a working tree with uncommitted changes unless you intend those changes to be part of the release.
- Start at `v1.0.0` for the first stable release; use `v0.x.y` only if you want pre-1.0 flexibility with breaking changes.

## Release badge (README.md)

The README contains this badge on line 8:

```markdown
[![Release](https://img.shields.io/github/v/release/zubershk/ocp)](https://github.com/zubershk/ocp/releases)
```

It shows red ("no releases or repo not found") until at least one `v*.*.*` tag exists. Cutting a release (above) resolves it.

## Repository structure (summary)

- `bot/` — Go backend API server (Gin, PostgreSQL)
- `frontend/` — React 19 + Vite storefront + admin dashboard
- `campaign-runner/` — Express + React WhatsApp marketing tool
- `evolution-go/` — WhatsApp API gateway
- `.github/workflows/` — CI (`ci.yml`), Release (`release.yml`), deploys
- `docs/` — Deployment, load test, production checklist, dependabot triage
- `deploy/vps/` — Single-VPS Docker Compose + Caddy stack
- `northflank/` — Recommended free Northflank Sandbox template
