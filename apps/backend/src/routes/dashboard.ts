import type { FastifyPluginAsync } from "fastify";
import type { DashboardTrendPoint } from "shared-types";

export interface TrendHeartbeat {
  status: "up" | "down";
  responseTimeMs: number | null;
  timestamp: Date;
}

function dayKey(timestamp: Date): string {
  return timestamp.toISOString().slice(0, 10);
}

/**
 * Pure aggregation, deliberately separated from the Prisma query in the
 * route below so it's unit-testable without a database (specs/002's
 * computeMonitorStats precedent). Groups heartbeats across every monitor by
 * calendar day (UTC); a day with zero heartbeats is omitted rather than
 * represented as a fabricated zero point (contracts/rest-api.md).
 */
export function computeDashboardTrend(heartbeats: TrendHeartbeat[]): DashboardTrendPoint[] {
  const byDay = new Map<string, TrendHeartbeat[]>();
  for (const heartbeat of heartbeats) {
    const key = dayKey(heartbeat.timestamp);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(heartbeat);
    else byDay.set(key, [heartbeat]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayHeartbeats]) => {
      const withResponseTime = dayHeartbeats
        .map((h) => h.responseTimeMs)
        .filter((v): v is number => v !== null);
      const avgResponseTimeMs =
        withResponseTime.length === 0
          ? null
          : Math.round(withResponseTime.reduce((a, b) => a + b, 0) / withResponseTime.length);
      const upCount = dayHeartbeats.filter((h) => h.status === "up").length;
      const uptimePercent = Math.round((upCount / dayHeartbeats.length) * 1000) / 10;

      return { date, avgResponseTimeMs, uptimePercent };
    });
}

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30 };

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { range?: string } }>("/trend", async (request) => {
    const days = RANGE_DAYS[request.query.range ?? "7d"] ?? 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const heartbeats = await app.prisma.heartbeat.findMany({
      where: { timestamp: { gte: since } },
      select: { status: true, responseTimeMs: true, timestamp: true },
    });

    return computeDashboardTrend(heartbeats as TrendHeartbeat[]);
  });
};
