# OnlineMeter

🔗 **[Live demo](https://onlinemeter-demo.onrender.com)** — read-only,
just to look around (it resets periodically and you can't add/change
anything).

A self-hosted alternative to stuff like UptimeRobot or Uptime Kuma — keep
an eye on your servers and services without handing the data to anyone
else.

It checks HTTP(S), TCP, ping, DNS, keyword-match, and Docker container
targets on whatever interval you set, and pushes status updates to the
dashboard live over WebSocket (no refresh-and-pray). Also in the box:
response-time/uptime stats, a heads-up before your HTTPS certs expire,
monitor groups, Basic Auth support for targets that need it, and
light/dark/system theming.

## Quickstart

### Docker (recommended)

```bash
docker compose -f docker/docker-compose.yml up --build
```

Once it's up, open <http://localhost:3000>. Everything lives in
`./docker/data` — it's just a SQLite file.

### Running it locally

You'll need Node.js 20+ and `pnpm`.

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
pnpm --filter backend prisma:migrate   # sets up apps/backend/prisma/dev.db
pnpm dev:backend                        # http://localhost:3000 (API + WebSocket)
pnpm dev:frontend                       # http://localhost:5173 (the dashboard)
```

Head to <http://localhost:5173> — that's the dashboard. Hit "Add monitor"
to set one up (there's a "More options" toggle if the target needs Basic
Auth), and you'll see its status update live as checks come in.

Docker container monitoring is opt-in, since it needs the Docker socket
mounted into whatever's running this app — there's a commented-out
example for that in `docker/docker-compose.yml`.

## Tests

```bash
pnpm test
```

## Project layout

```text
apps/backend            Fastify API + Socket.IO + scheduler (Prisma/SQLite)
apps/frontend           React + Vite dashboard (shadcn/ui, TanStack Query)
packages/shared-types    Types shared between backend and frontend
docker/                  Dockerfile + docker-compose.yml
```
