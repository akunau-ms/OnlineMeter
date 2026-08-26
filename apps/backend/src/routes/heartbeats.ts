import type { FastifyPluginAsync } from "fastify";
import type { HeartbeatRange } from "shared-types";
import { toHeartbeatDTO } from "../mappers.js";

const RANGE_MS: Record<HeartbeatRange, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function isRange(value: unknown): value is HeartbeatRange {
  return typeof value === "string" && value in RANGE_MS;
}

export const heartbeatRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string }; Querystring: { range?: string } }>(
    "/:id/heartbeats",
    async (request, reply) => {
      const monitor = await app.prisma.monitor.findUnique({ where: { id: request.params.id } });
      if (!monitor) return reply.status(404).send({ error: "Monitor not found" });

      const range: HeartbeatRange = isRange(request.query.range) ? request.query.range : "24h";
      const since = new Date(Date.now() - RANGE_MS[range]);

      const heartbeats = await app.prisma.heartbeat.findMany({
        where: { monitorId: monitor.id, timestamp: { gte: since } },
        orderBy: { timestamp: "asc" },
      });

      return heartbeats.map(toHeartbeatDTO);
    },
  );
};
