import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import type { PrismaClient } from "@prisma/client";
import { createRealtimeServer, type AppSocketServer } from "./realtime/server.js";
import { registerRealtimeHandlers } from "./realtime/handlers.js";
import { monitorRoutes } from "./routes/monitors.js";
import { heartbeatRoutes } from "./routes/heartbeats.js";
import { monitorStatsRoutes } from "./routes/monitor-stats.js";
import { groupRoutes } from "./routes/groups.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { publicStatusRoutes } from "./routes/public-status.js";
import { notificationChannelRoutes } from "./routes/notification-channels.js";
import { configRoutes } from "./routes/config.js";
import type { Scheduler } from "./scheduler/index.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    io: AppSocketServer;
    scheduler: Scheduler;
    /** Read-only demo mode (specs/021) — decorated once at build time so
     * both the write-blocking hook and GET /api/config read the same
     * value, without either re-reading `config.ts`/`process.env`. */
    demoMode: boolean;
  }
}

export interface BuildAppOptions {
  prisma: PrismaClient;
  createScheduler: (app: FastifyInstance) => Scheduler;
  /** Read-only demo mode (specs/021) — an explicit option rather than a
   * bare `config.demoMode` read, so tests can construct both states in
   * the same run (research.md decision 2). Off by default. */
  demoMode?: boolean;
}

export function buildApp({
  prisma,
  createScheduler,
  demoMode = false,
}: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: true });

  app.decorate("prisma", prisma);
  app.decorate("demoMode", demoMode);

  const io = createRealtimeServer(app.server);
  app.decorate("io", io);

  const scheduler = createScheduler(app);
  app.decorate("scheduler", scheduler);

  registerRealtimeHandlers(app);

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    app.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({ error: error.message ?? "Internal Server Error" });
  });

  // Read-only demo mode (specs/021): a single method+prefix check covers
  // every current AND future mutating endpoint (research.md decision 1) —
  // never trust the client/UI alone (Constitution Principle VI).
  if (demoMode) {
    app.addHook("onRequest", async (request, reply) => {
      if (request.method !== "GET" && request.url.startsWith("/api/")) {
        return reply
          .status(403)
          .send({ error: "This is a read-only demo — changes are disabled." });
      }
    });
  }

  app.register(monitorRoutes, { prefix: "/api/monitors" });
  app.register(heartbeatRoutes, { prefix: "/api/monitors" });
  app.register(monitorStatsRoutes, { prefix: "/api/monitors" });
  app.register(groupRoutes, { prefix: "/api/groups" });
  app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  app.register(publicStatusRoutes, { prefix: "/api/public" });
  app.register(notificationChannelRoutes, { prefix: "/api/notification-channels" });
  app.register(configRoutes, { prefix: "/api/config" });

  app.get("/health", async () => ({ status: "ok" }));

  // Serves the built frontend from this same process/port when present
  // (Docker image / `pnpm build`), per plan.md's single-container design.
  // In local dev the frontend runs separately under Vite, so this is a
  // no-op when the dist directory hasn't been built.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.resolve(__dirname, "../../frontend/dist");
  if (fs.existsSync(frontendDist)) {
    app.register(fastifyStatic, { root: frontendDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api")) {
        reply.status(404).send({ error: "Not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  app.addHook("onClose", async () => {
    scheduler.stopAll();
    await io.close();
  });

  return app;
}
