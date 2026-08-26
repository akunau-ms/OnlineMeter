import type { FastifyPluginAsync } from "fastify";
import type { MonitorStats } from "shared-types";

export interface StatsHeartbeat {
  status: "up" | "down";
  responseTimeMs: number | null;
  timestamp: Date;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function uptimePercent(heartbeats: StatsHeartbeat[]): number | null {
  if (heartbeats.length === 0) return null;
  const upCount = heartbeats.filter((h) => h.status === "up").length;
  return Math.round((upCount / heartbeats.length) * 1000) / 10;
}

/**
 * Pure computation, deliberately separated from the Prisma queries in the
 * route below so it's unit-testable without a database (data-model.md
 * MonitorStats notes; research.md decision 4). Every field is `null` when
 * its window has no heartbeats, never a fabricated 0 (FR-014).
 */
export function computeMonitorStats(params: {
  latest: StatsHeartbeat | null;
  last24h: StatsHeartbeat[];
  last30d: StatsHeartbeat[];
}): MonitorStats {
  return {
    currentResponseTimeMs: params.latest?.responseTimeMs ?? null,
    avgResponseTimeMs24h: average(
      params.last24h.map((h) => h.responseTimeMs).filter((v): v is number => v !== null),
    ),
    uptime24h: uptimePercent(params.last24h),
    uptime30d: uptimePercent(params.last30d),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const monitorStatsRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>("/:id/stats", async (request, reply) => {
    const monitor = await app.prisma.monitor.findUnique({ where: { id: request.params.id } });
    if (!monitor) return reply.status(404).send({ error: "Monitor not found" });

    const now = Date.now();
    const [latest, last30d] = await Promise.all([
      app.prisma.heartbeat.findFirst({
        where: { monitorId: monitor.id },
        orderBy: { timestamp: "desc" },
      }),
      app.prisma.heartbeat.findMany({
        where: { monitorId: monitor.id, timestamp: { gte: new Date(now - 30 * DAY_MS) } },
        orderBy: { timestamp: "asc" },
      }),
    ]);

    const since24h = new Date(now - DAY_MS);
    const last24h = last30d.filter((h) => h.timestamp >= since24h);

    return computeMonitorStats({
      latest: latest as StatsHeartbeat | null,
      last24h: last24h as StatsHeartbeat[],
      last30d: last30d as StatsHeartbeat[],
    });
  });
};
