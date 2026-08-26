# syntax=docker/dockerfile:1

FROM node:20-slim AS base
# Prisma's query/schema engines need OpenSSL at runtime; node:20-slim doesn't
# ship it by default (Debian bookworm-slim), so Prisma falls back to a
# guessed engine build and fails to load without this.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter shared-types build \
 && pnpm --filter backend prisma:generate \
 && pnpm --filter backend build \
 && pnpm --filter frontend build

FROM base AS runtime
ENV NODE_ENV=production
ENV DATABASE_URL="file:/app/data/prod.db"
ENV PORT=3000

COPY --from=build /app/apps/backend/dist apps/backend/dist
COPY --from=build /app/apps/backend/node_modules apps/backend/node_modules
COPY --from=build /app/apps/backend/prisma apps/backend/prisma
COPY --from=build /app/apps/backend/package.json apps/backend/package.json
COPY --from=build /app/apps/frontend/dist apps/frontend/dist
COPY --from=build /app/packages/shared-types packages/shared-types
COPY --from=build /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml* ./
COPY --from=build /app/node_modules node_modules

RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3000

CMD ["sh", "-c", "cd apps/backend && node_modules/.bin/prisma migrate deploy && node dist/index.js"]
