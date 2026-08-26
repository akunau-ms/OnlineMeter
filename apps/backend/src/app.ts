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
import type { Scheduler } from "./scheduler/index.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    io: AppSocketServer;
    scheduler: Scheduler;
  }
}

export interface BuildAppOptions {
  prisma: PrismaClient;
  createScheduler: (app: FastifyInstance) => Scheduler;
}

export function buildApp({ prisma, createScheduler }: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: true });

  app.decorate("prisma", prisma);

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

  app.register(monitorRoutes, { prefix: "/api/monitors" });
  app.register(heartbeatRoutes, { prefix: "/api/monitors" });
  app.register(monitorStatsRoutes, { prefix: "/api/monitors" });
  app.register(groupRoutes, { prefix: "/api/groups" });
  app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  app.register(publicStatusRoutes, { prefix: "/api/public" });
  app.register(notificationChannelRoutes, { prefix: "/api/notification-channels" });

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
