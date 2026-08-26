# Uptime Monitor

Self-hosted uptime monitoring: HTTP(S), TCP, Ping, DNS, Keyword-match, and
Docker container monitors, checked on a configurable interval, with an
aggregate overview dashboard and a live per-monitor detail view (WebSocket
push, no polling), response-time/uptime stats, HTTPS certificate-expiry
tracking, monitor groups, HTTP Basic Auth support for protected targets, and
light/dark/system theming.

## Quickstart

### Docker (recommended)

```bash
docker compose -f docker/docker-compose.yml up --build
```

Then open <http://localhost:3000>. Data persists in `./docker/data` (SQLite).

### Local development

Requires Node.js 20+ and `pnpm`.

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
pnpm --filter backend prisma:migrate   # creates apps/backend/prisma/dev.db
pnpm dev:backend                        # http://localhost:3000 (API + WebSocket)
pnpm dev:frontend                       # http://localhost:5173 (dashboard, proxies /api and /socket.io)
```

Open <http://localhost:5173> — the dashboard overview is the landing page.
Click "Add monitor" to create one (expand "More options" if the target sits
behind HTTP Basic Auth) and watch its status update live as checks run on
the configured interval. Docker container monitors are opt-in and require
mounting the Docker socket into the container running this app — see the
commented-out example in `docker/docker-compose.yml`.

## Tests

```bash
pnpm test
```

## Project layout

```text
apps/backend      Fastify API + Socket.IO + scheduler (Prisma/SQLite)
apps/frontend     React + Vite dashboard (shadcn/ui, TanStack Query)
packages/shared-types   Types shared between backend and frontend
docker/           Dockerfile + docker-compose.yml
```
