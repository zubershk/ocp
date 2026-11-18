# Dependabot Security Advisory Triage

Date: 2026-11-18
Repository: `zubershk/ocp` (master)
Query: `gh api repos/zubershk/ocp/dependabot/alerts?per_page=100&state=open` — **authentication succeeded**, 8 open alerts (5 high, 3 moderate). Final re-query after all edits: **still 8 open** (see "GitHub state" below).

## Blunt summary

- **7 of 8 advisories are fixed in the working tree.** One (`#235`) was fixed in the first pass; six more were fixed after my scope was expanded to cover `evolution-go/evolution-go-manager/`.
- **2 advisories (`#283/#284`, picomatch) cannot be fixed by upgrade.** No patched version exists. I recommend formal dismissal as dev-only / not exploitable, with evidence below — **I did not execute the dismissal**, only documented the rationale.
- **GitHub still reports all 8 as open.** Nothing was committed or pushed, so Dependabot has not re-scanned. Do not interpret the live API result as "nothing was done" — but also do not claim the alerts are closed. They are not closed on GitHub.

## Advisory table — final state

| # | Sev | Package | Old → new version | Manifest | Local status |
|---|-----|---------|-------------------|----------|--------------|
| 235 | moderate | `uuid` (GHSA-w5hq-g745-h8pq / CVE-2026-41907) | `8.3.2` → `11.1.1` | `campaign-runner/package-lock.json` | **FIXED** — npm `overrides` `"uuid": "^11.1.1"` |
| 240 | high | `source-map-js` (GHSA-68fv-2mgg-jv7q / CVE-2026-93749) | `1.2.1` → `1.2.2` | `evolution-go/evolution-go-manager/pnpm-lock.yaml` | **FIXED** — stale `1.2.1` removed from both lock files via overrides; only `1.2.2` remains |
| 272 | high | `zod` (GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404) | `3.25.76` → `4.6.7` | `evolution-go/evolution-go-manager/package-lock.json` | **FIXED** — override forces single zod `4.6.7`; transitive `3.25.76` gone |
| 273 | high | `zod` (same GHSA/CVE) | `3.25.76` → `4.6.7` | `evolution-go/evolution-go-manager/pnpm-lock.yaml` | **FIXED** — same, single zod `4.6.7` |
| 280 | moderate | `minimatch` (GHSA-g3hv-75wg-m249 / CVE-2026-118764) | `10.2.6` → `11.0.9` | `evolution-go/evolution-go-manager/package-lock.json` | **FIXED** — override, single minimatch `11.0.9` (>= patched `11.0.1`) |
| 281 | moderate | `minimatch` (same GHSA/CVE) | `10.2.6` → `11.0.9` | `evolution-go/evolution-go-manager/pnpm-lock.yaml` | **FIXED** — same |
| 283 | high | `picomatch` (GHSA-fc5q-39xc-vjpf / CVE-2026-112366) | `4.0.7` → *(no patch exists)* | `evolution-go/evolution-go-manager/package-lock.json` | **DISMISSAL RECOMMENDED** — dev/build-only, no upstream patch; rationale below |
| 284 | high | `picomatch` (same GHSA/CVE) | `4.0.7` → *(no patch exists)* | `evolution-go/evolution-go-manager/pnpm-lock.yaml` | **DISMISSAL RECOMMENDED** — same |

## Changes made

### `campaign-runner/` (first pass)

- `package.json` — npm `overrides`: `"uuid": "^11.1.1"`.
- `package-lock.json` — regenerated; `uuid` 8.3.2 → 11.1.1.

`uuid` is transitive via `exceljs@4.4.0` (`uuid: ^8.3.0`), so a top-level `npm install uuid@...` would have left the nested vulnerable copy. exceljs uses `const { v4: uuidv4 } = require('uuid')` — a named export still present in uuid 11.x.

### `evolution-go/evolution-go-manager/` (expanded pass)

- `package.json` — npm `overrides` for `minimatch ^11.0.1`, `source-map-js ^1.2.2`, `zod ^4.6.6`; added `react-is@19.2.0` as a devDependency (see below).
- `pnpm-workspace.yaml` — pnpm 11 ignores `pnpm.overrides` in `package.json`, so the same three overrides live under the top-level `overrides:` key here. This is the pnpm 11 location.
- `package-lock.json` — regenerated with `npm install --legacy-peer-deps` (needed for a pre-existing eslint 10 / eslint-plugin-react-hooks 5 peer conflict). Result: single minimatch `11.0.9`, single zod `4.6.7`, single source-map-js `1.2.2`.
- `pnpm-lock.yaml` — regenerated with `pnpm install --lockfile-only`, then validated with `pnpm install --frozen-lockfile`. Same clean result: minimatch `11.0.9`, zod `4.6.7`, source-map-js `1.2.2`. No hand-editing of lock files.

`@evoapi/design-system@0.0.5` (and the newest `0.0.6`) both declare `zod: ^3.25.67`, so upgrading the design system would not remove the vulnerable transitive zod. The override was the only viable route; `tsc -b` and the production build both pass with zod 4.6.7, so it is compatible in practice.

**`react-is` note:** the original HEAD lock auto-installed `react-is@19.2.0` as a peer of recharts. `npm install --legacy-peer-deps` (required by the pre-existing eslint peer conflict) drops auto-installed peers, which broke the build with `Rolldown failed to resolve import "react-is" from recharts/es6/util/ReactUtils.js`. I added it explicitly as a devDependency at the original version to restore the build. This is a build fix, not a security change.

`bot/go.mod` was already compliant (`go 1.27.4`, `klauspost/compress v1.20.2`) and was not touched. `.github/workflows/ci.yml` was not touched.

## Verification results

All commands exit 0 unless noted.

| Command | Directory | Result |
|---|---|---|
| `node --check server/index.js` | `campaign-runner/` | PASS |
| `npm test` | `campaign-runner/` | PASS — 10/10 tests, 0 fail |
| `npm run build` | `frontend/` | PASS |
| `npx oxlint` | `frontend/` | PASS — 0 errors (warnings only) |
| `go build ./...` | `bot/` | PASS |
| `go vet ./...` | `bot/` | PASS |
| `go test -p 1 ./... -count=1` (with required env vars) | `bot/` | PASS — all packages ok |
| `govulncheck -scan module` | `bot/` | PASS — "No vulnerabilities found." |
| `npm run build` (tsc -b + vite build) | `evolution-go-manager/` | PASS — 4535 modules, built in 6.69s |
| `npm run lint` | `evolution-go-manager/` | PASS — 0 errors, 1 pre-existing warning |
| `pnpm install --frozen-lockfile` | `evolution-go-manager/` | PASS — lockfile up to date |
| `pnpm run build` | `evolution-go-manager/` | PASS — 5077 modules, built in 3.69s |
| `pnpm run lint` | `evolution-go-manager/` | PASS — 0 errors, 1 pre-existing warning |
| `npm audit` | `evolution-go-manager/` | 11 high, 0 moderate — all pre-existing, see below |
| `pnpm audit` | `evolution-go-manager/` | **1 high — picomatch only**; zod, minimatch and source-map-js findings are gone |

There is no `test` script in `evolution-go-manager/package.json`, so none was run there.

`npm audit`'s 11 highs are `vite`, `@vitejs/plugin-react`, `fdir`, `tinyglobby`, `picomatch`, and six `typescript-eslint`/`@typescript-eslint/*` packages. I verified against `git show HEAD:...package-lock.json` that those versions (`typescript-eslint 8.69.0`, `vite 8.3.5`, `@vitejs/plugin-react 6.1.1`) are unchanged from HEAD — these are pre-existing advisories, not regressions. npm's proposed fix is a major downgrade (`vite` → 6.2.7), so I did not apply it. They are not among the 8 Dependabot alerts.

## Formal dismissal rationale: picomatch #283 / #284

**Recommendation:** dismiss both alerts on GitHub with reason **"Not used"** (dev-only dependency / not exploitable). The rationale is substantiated as follows.

1. **No patched version exists.** `first_patched_version` is `null` in the GitHub advisory, the vulnerable range is `<= 4.0.7`, and `npm view picomatch version` / `npm view picomatch versions` show 4.0.7 as the newest published release. `npm view picomatch@4.0.8` returns **404**. pnpm's advisory metadata claims "patched >=4.0.8", but that release does not exist in the registry — pnpm's data is ahead of reality. There is no version to upgrade to.
2. **The vulnerable code is not shipped.** `pnpm why picomatch` shows the only paths are:
   - `vite → picomatch`
   - `vite → tinyglobby → picomatch`
   - `vite → tinyglobby → fdir → picomatch`
   - `typescript-eslint → @typescript-eslint/typescript-estree → tinyglobby → picomatch`
   All are build/lint tooling. `vite` and `typescript-eslint` are devDependencies; `@tailwindcss/vite` is a Vite build plugin. A search of `src/` for `picomatch`, `tinyglobby`, `fdir`, or `vite` imports returns **zero matches**, and a search of the produced `dist/*.js` bundle for `picomatch` / `analyzeRepeatedExtglob` / `extglob` returns **zero matches**. The vulnerable ReDoS code is therefore never in the browser payload.
3. **No attacker-controlled glob input.** GHSA-fc5q-39xc-vjpf requires supplying crafted extglob patterns such as `+(*)` to `analyzeRepeatedExtglob`. The application accepts no glob patterns from users; all glob inputs here are static build-tool configuration controlled by the developer.

**Caveat, stated plainly:** this is a dev-time supply-chain risk. A compromised or malicious build input could still trigger it on developer machines or CI. Dismissal is justified on exploitability in the shipped product, not on the absence of risk everywhere. If policy requires zero outstanding dev-tool advisories regardless of reachability, leave both alerts open and track the upstream fix instead. I did **not** dismiss them via API.

## GitHub state — not closed

Final live query still returns all 8 alerts as `open`. Dependabot re-scans on push/schedule; since this work is deliberately uncommitted and unpushed (standing instruction), no alert can transition to `fixed` yet. Whenever these changes are eventually committed and pushed, expect `#235`, `#240`, `#272`, `#273`, `#280`, `#281` to clear on re-scan and `#283`/`#284` to remain until dismissed.

## Files changed by me

- `campaign-runner/package.json`
- `campaign-runner/package-lock.json`
- `evolution-go/evolution-go-manager/package.json`
- `evolution-go/evolution-go-manager/package-lock.json`
- `evolution-go/evolution-go-manager/pnpm-lock.yaml`
- `evolution-go/evolution-go-manager/pnpm-workspace.yaml`
- `docs/DEPENDABOT_TRIAGE.md` (this file)

No commits, no pushes. No changes to `.github/workflows/ci.yml`, `bot/*.go`, or `campaign-runner/server/index.js`.

> Note: other files (`bot/config/config.go`, `bot/handlers/rate_limit.go`, `bot/main.go`, `campaign-runner/server/index.js`, `campaign-runner/server/cache-concurrency.test.mjs`, `scripts/loadtest/`) were already modified/untracked by the parent session during this work. I did not touch them.
