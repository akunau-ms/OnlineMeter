# Contributing

Thanks for considering a contribution. This document covers everything
you need to set up your environment, verify a change, and open a pull
request.

## Local environment setup

Requires Node.js 20+ and `pnpm`.

```bash
git clone <your fork's URL>
cd OnlineMeter
pnpm install
cp apps/backend/.env.example apps/backend/.env
pnpm --filter backend prisma:migrate   # creates apps/backend/prisma/dev.db
pnpm dev:backend                        # http://localhost:3000 (API + WebSocket)
pnpm dev:frontend                       # http://localhost:5173 (dashboard)
```

Open <http://localhost:5173> — the dashboard is the landing page. See the
main [README](./README.md) for a description of what the app does and its
project layout.

## Running checks before proposing a change

The same checks CI runs on every pull request:

```bash
pnpm lint    # ESLint across the whole monorepo
pnpm build   # typechecks and builds shared-types, backend, and frontend
pnpm test    # backend test suite (Vitest) + frontend (currently no test files)
```

If you're touching the Docker image or `docker/docker-compose.yml`, also
confirm it still builds:

```bash
docker build -f docker/Dockerfile .
```

All four must succeed locally before opening a pull request — CI will run
them again automatically, but catching a failure locally first saves a
round trip.

## Proposing a change

1. Fork the repository and branch from `main`.
2. Make your change. Keep it focused — a bug fix doesn't need unrelated
   cleanup, and a small feature doesn't need speculative extensibility for
   cases nobody asked for.
3. Run the checks above.
4. Open a pull request describing **what** changed and **why**. Link any
   related issue.
5. CI (lint, typecheck, tests, and a Docker build) runs automatically on
   your pull request — all of it must be green before merge.

## Project principles

A few things this project holds itself to — worth keeping in mind before
opening a pull request:

- **Self-hosting simplicity first.** No feature should require a mandatory
  external service; `docker compose up` must stay sufficient for a fully
  working instance.
- **Monolith-first.** The backend runs as a single process (API, WebSocket
  push, and the scheduler together) — don't split it into separate
  services without a strong reason.
- **Type-safe shared contracts.** Request/response and WebSocket payload
  shapes are defined once in `packages/shared-types` and imported by both
  sides — no hand-duplicated interfaces.
- **Test-backed reliability.** New monitor checkers, notification
  providers, and scheduler state transitions need an automated test; a bug
  fix should include a regression test.

If your change conflicts with one of these, either revise the approach or
explain in your pull request why the exception is warranted.

## License

By contributing, you agree that your contribution is licensed under this
project's [MIT License](./LICENSE).
