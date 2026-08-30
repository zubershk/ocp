# Contributing to OCP

Thanks for wanting to help. Here's how to get started.

## Development Setup

### Option 1: Docker (recommended)

```bash
git clone https://github.com/zubershk/ocp.git
cd ocp
bash setup.sh
docker compose up -d
```

### Option 2: Manual

```bash
# Bot
cd bot && go mod tidy && go run .

# Frontend
cd frontend && npm install && npm run dev

# Campaign Runner
cd campaign-runner && npm install && npm run dev
```

See README.md for full environment variable reference.

## Project Structure

```
ocp/
├── bot/                 # Go/Gin backend (port 8090)
│   ├── handlers/        # HTTP handlers
│   ├── services/        # Business logic
│   ├── admin/           # Admin API (auth, CRUD, broadcast)
│   ├── migrations/      # SQL migrations
│   └── uploads/         # Menu images
├── frontend/            # React 19 / Vite / TypeScript
│   └── src/
│       ├── pages/       # Route pages
│       ├── components/  # UI components
│       ├── context/     # React contexts
│       └── hooks/       # Custom hooks
├── campaign-runner/     # Express + React marketing tool
│   ├── server/          # API (connects to bot)
│   └── src/             # React dashboard
└── evolution-go/        # WhatsApp API gateway
```

## Making Changes

1. Fork the repo
2. Create a branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Test: `go build ./...` (bot) or `npm run build` (frontend/campaign)
5. Commit with a clear message
6. Push and open a PR

## Commit Messages

Keep them short and descriptive:

```
Bot: add search endpoint for customers
Frontend: fix cart total not updating on quantity change
Campaign: support scheduled sends
Docker: add health check for PostgreSQL
```

Prefix with the component: `Bot:`, `Frontend:`, `Campaign:`, `Docker:`, `Docs:`.

## Code Style

- **Go**: standard `gofmt`, no comments unless complex
- **React/TS**: functional components, hooks, no class components
- **CSS**: Tailwind utility classes, no inline styles
- **No emojis** in UI code or commit messages
- **No stock photo URLs** in the codebase

## Reporting Bugs

Use the [Bug Report](https://github.com/zubershk/ocp/issues/new?template=bug_report.yml) template.

## Requesting Features

Use the [Feature Request](https://github.com/zubershk/ocp/issues/new?template=feature_request.yml) template.

## License

By contributing, you agree your code is licensed under MIT.
