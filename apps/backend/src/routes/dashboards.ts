import type { FastifyPluginAsync } from "fastify";
import type { DashboardInput, DashboardWidgetInput, DashboardWidgetView, MonitorType } from "shared-types";
import { toDashboardDTO, toPublicStatusHeartbeatDTO } from "../mappers.js";
import { validateDashboardInput, validateWidgetInput } from "./validation.js";
import { evaluateTrigger } from "../triggers.js";
import { computeMonitorStats, type StatsHeartbeat } from "./monitor-stats.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_HEARTBEAT_LIMIT = 20;

/**
 * Builds one widget's read-shape (data-model.md `DashboardWidgetView`),
 * fetching just enough of its monitor's heartbeat history to compute the
 * stats `evaluateTrigger` needs (reuses `computeMonitorStats` rather than
 * re-deriving response-time/uptime logic — plan.md's Technical Context) and
 * the recent-history indicator (specs/028 research.md decision 3, mirrors
 * `GET /api/monitors`' `MonitorListItem.recentHeartbeats` bounding).
 */
async function toWidgetView(
  app: { prisma: import("@prisma/client").PrismaClient },
  widget: {
    id: string;
    triggerType: string;
    warningThreshold: number | null;
    criticalThreshold: number | null;
    position: number;
    monitor: {
      id: string;
      name: string;
      type: string;
      status: string;
      active: boolean;
      statusSince: Date;
      certificateExpiresAt: Date | null;
    };
  },
): Promise<DashboardWidgetView> {
  const now = Date.now();
  const [last20, last24h] = await Promise.all([
    app.prisma.heartbeat.findMany({
      where: { monitorId: widget.monitor.id },
      orderBy: { timestamp: "desc" },
      take: RECENT_HEARTBEAT_LIMIT,
    }),
    app.prisma.heartbeat.findMany({
      where: { monitorId: widget.monitor.id, timestamp: { gte: new Date(now - DAY_MS) } },
    }),
  ]);

  const stats = computeMonitorStats({
    latest: (last20[0] as StatsHeartbeat) ?? null,
    last24h: last24h as StatsHeartbeat[],
    last30d: [],
  });

  const severity = evaluateTrigger(
    {
      triggerType: widget.triggerType as DashboardWidgetView["triggerType"],
      warningThreshold: widget.warningThreshold,
      criticalThreshold: widget.criticalThreshold,
    },
    {
      status: widget.monitor.status as DashboardWidgetView["monitor"]["status"],
      active: widget.monitor.active,
      statusSince: widget.monitor.statusSince.toISOString(),
      certificateExpiresAt: widget.monitor.certificateExpiresAt
        ? widget.monitor.certificateExpiresAt.toISOString()
        : null,
    },
    { currentResponseTimeMs: stats.currentResponseTimeMs, uptime24h: stats.uptime24h },
  );

  return {
    id: widget.id,
    triggerType: widget.triggerType as DashboardWidgetView["triggerType"],
    warningThreshold: widget.warningThreshold,
    criticalThreshold: widget.criticalThreshold,
    position: widget.position,
    monitor: {
      id: widget.monitor.id,
      name: widget.monitor.name,
      type: widget.monitor.type as MonitorType,
      status: widget.monitor.status as DashboardWidgetView["monitor"]["status"],
      active: widget.monitor.active,
      recentHeartbeats: [...last20].reverse().map(toPublicStatusHeartbeatDTO),
    },
    severity,
  };
}

export const dashboardsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const dashboards = await app.prisma.dashboard.findMany({ orderBy: { createdAt: "asc" } });
    return dashboards.map(toDashboardDTO);
  });

  app.post<{ Body: Partial<DashboardInput> }>("/", async (request, reply) => {
    const errors = validateDashboardInput(request.body);
    if (errors.length > 0) return reply.status(400).send(errors);

    const created = await app.prisma.dashboard.create({ data: { name: request.body.name! } });
    return reply.status(201).send(toDashboardDTO(created));
  });

  app.put<{ Params: { id: string }; Body: Partial<DashboardInput> }>(
    "/:id",
    async (request, reply) => {
      const existing = await app.prisma.dashboard.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.status(404).send({ error: "Dashboard not found" });

      const errors = validateDashboardInput(request.body);
      if (errors.length > 0) return reply.status(400).send(errors);

      const updated = await app.prisma.dashboard.update({
        where: { id: existing.id },
        data: { name: request.body.name! },
      });
      return toDashboardDTO(updated);
    },
  );

  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const existing = await app.prisma.dashboard.findUnique({ where: { id: request.params.id } });
    if (!existing) return reply.status(404).send({ error: "Dashboard not found" });

    // DashboardWidget.dashboardId has onDelete: Cascade (schema.prisma) —
    // this never touches the Monitor rows the widgets referenced.
    await app.prisma.dashboard.delete({ where: { id: existing.id } });
    return reply.status(204).send();
  });

  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const dashboard = await app.prisma.dashboard.findUnique({
      where: { id: request.params.id },
      include: { widgets: { include: { monitor: true }, orderBy: { position: "asc" } } },
    });
    if (!dashboard) return reply.status(404).send({ error: "Dashboard not found" });

    const widgets = await Promise.all(dashboard.widgets.map((w) => toWidgetView(app, w)));
    return { ...toDashboardDTO(dashboard), widgets };
  });

  app.post<{ Params: { id: string }; Body: Partial<DashboardWidgetInput> }>(
    "/:id/widgets",
    async (request, reply) => {
      const dashboard = await app.prisma.dashboard.findUnique({ where: { id: request.params.id } });
      if (!dashboard) return reply.status(404).send({ error: "Dashboard not found" });

      if (!request.body.monitorId) {
        return reply.status(400).send([{ field: "monitorId", message: "monitorId is required" }]);
      }
      const monitor = await app.prisma.monitor.findUnique({
        where: { id: request.body.monitorId },
      });
      if (!monitor) return reply.status(404).send({ error: "Monitor not found" });

      const errors = validateWidgetInput(request.body, monitor.type as MonitorType);
      if (errors.length > 0) return reply.status(400).send(errors);

      const last = await app.prisma.dashboardWidget.findFirst({
        where: { dashboardId: dashboard.id },
        orderBy: { position: "desc" },
      });

      const created = await app.prisma.dashboardWidget.create({
        data: {
          dashboardId: dashboard.id,
          monitorId: monitor.id,
          triggerType: request.body.triggerType!,
          warningThreshold: request.body.warningThreshold ?? null,
          criticalThreshold: request.body.criticalThreshold ?? null,
          position: (last?.position ?? -1) + 1,
        },
        include: { monitor: true },
      });

      return reply.status(201).send(await toWidgetView(app, created));
    },
  );

  app.delete<{ Params: { id: string; widgetId: string } }>(
    "/:id/widgets/:widgetId",
    async (request, reply) => {
      const widget = await app.prisma.dashboardWidget.findUnique({
        where: { id: request.params.widgetId },
      });
      if (!widget || widget.dashboardId !== request.params.id) {
        return reply.status(404).send({ error: "Widget not found" });
      }

      await app.prisma.dashboardWidget.delete({ where: { id: widget.id } });
      return reply.status(204).send();
    },
  );
};
