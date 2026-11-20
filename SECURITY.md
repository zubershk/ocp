# Security Policy

## Supported versions

Security fixes are applied to the latest release and the `master` branch.

| Version | Supported |
|---------|-----------|
| Latest tag (`v*`) | Yes |
| `master` | Yes |
| Older tags | No — upgrade to the latest |

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

Report privately using GitHub's "Report a vulnerability" button on the
repository's Security tab, or contact the repository owner privately.

Include:

- A description of the issue and its impact
- Steps to reproduce (or a proof of concept)
- Affected component/version and, if known, the fix

You should receive an acknowledgement within a few days. We will coordinate a
fix and disclosure timeline with you before publishing anything.

## What's in scope

- The Go bot API (`bot/`), frontend (`frontend/`), campaign runner
  (`campaign-runner/`), and deployment configs
- Authentication, tenant isolation, injection, SSRF, file upload, and secret
  handling issues

Out of scope: findings in vendored/upstream Evolution GO that should go to that
project, and issues requiring unrealistic attacker access.

## Project security posture

- CI runs `govulncheck`, CodeQL SAST, gitleaks secret scanning and fail-closed
  `npm audit` on every push and PR.
- Dependency advisories and their dispositions are tracked in
  [docs/DEPENDABOT_TRIAGE.md](docs/DEPENDABOT_TRIAGE.md).
- Production hardening guidance is in
  [docs/PRODUCTION_CHECKLIST.md](docs/PRODUCTION_CHECKLIST.md).
