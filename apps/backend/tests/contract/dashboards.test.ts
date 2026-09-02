import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.js";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

async function createMonitor(
  app: FastifyInstance,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/monitors",
    payload: {
      name: "widget-target",
      type: "http",
      target: "https://example.com",
      ...overrides,
    },
  });
  return res.json().id;
}

describe("dashboards REST contract", () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ctx = await createTestApp("test-dashboards-contract");
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("GET /api/dashboards starts empty", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboards" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("POST /api/dashboards creates a dashboard", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/dashboards",
      payload: { name: "Docker Hosts" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe("Docker Hosts");
    expect(res.json().id).toBeTruthy();
  });

  it("POST /api/dashboards rejects an empty name with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/dashboards",
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("PUT /api/dashboards/:id renames, 404 for unknown id", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/dashboards",
      payload: { name: "Original" },
    });
    const id = created.json().id;

    const renamed = await app.inject({
      method: "PUT",
      url: `/api/dashboards/${id}`,
      payload: { name: "Renamed" },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe("Renamed");

    const missing = await app.inject({
      method: "PUT",
      url: "/api/dashboards/does-not-exist",
      payload: { name: "x" },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("DELETE /api/dashboards/:id removes it and its widgets, leaves monitors intact", async () => {
    const monitorId = await createMonitor(app);
    const dashboard = await app.inject({
      method: "POST",
      url: "/api/dashboards",
      payload: { name: "Doomed" },
    });
    const dashboardId = dashboard.json().id;

    await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashboardId}/widgets`,
      payload: { monitorId, triggerType: "status_down" },
    });

    const deleted = await app.inject({ method: "DELETE", url: `/api/dashboards/${dashboardId}` });
    expect(deleted.statusCode).toBe(204);

    const list = await app.inject({ method: "GET", url: "/api/dashboards" });
    expect(list.json().some((d: { id: string }) => d.id === dashboardId)).toBe(false);

    const monitor = await app.inject({ method: "GET", url: `/api/monitors/${monitorId}` });
    expect(monitor.statusCode).toBe(200);

    const missing404 = await app.inject({ method: "DELETE", url: "/api/dashboards/nope" });
    expect(missing404.statusCode).toBe(404);
  });

  it("POST /api/dashboards/:id/widgets adds a widget and 404s for unknown dashboard/monitor", async () => {
    const monitorId = await createMonitor(app);
    const dashboard = await app.inject({
      method: "POST",
      url: "/api/dashboards",
      payload: { name: "Widgets" },
    });
    const dashboardId = dashboard.json().id;

    const added = await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashboardId}/widgets`,
      payload: { monitorId, triggerType: "status_down" },
    });
    expect(added.statusCode).toBe(201);
    expect(added.json().monitor.id).toBe(monitorId);
    expect(added.json().triggerType).toBe("status_down");
    expect(added.json().severity).toBe("normal");

    const unknownDashboard = await app.inject({
      method: "POST",
      url: "/api/dashboards/nope/widgets",
      payload: { monitorId, triggerType: "status_down" },
    });
    expect(unknownDashboard.statusCode).toBe(404);

    const unknownMonitor = await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashboardId}/widgets`,
      payload: { monitorId: "nope", triggerType: "status_down" },
    });
    expect(unknownMonitor.statusCode).toBe(404);
  });

  it("rejects a triggerType incompatible with the monitor's type (FR-004)", async () => {
    const tcpMonitorId = await createMonitor(app, { type: "tcp", target: "example.com:80" });
    const dashboard = await app.inject({
      method: "POST",
      url: "/api/dashboards",
      payload: { name: "Applicability" },
    });
    const dashboardId = dashboard.json().id;

    const res = await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashboardId}/widgets`,
      payload: { monitorId: tcpMonitorId, triggerType: "certificate_expiry_days", criticalThreshold: 14 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()[0].field).toBe("triggerType");
  });

  it("rejects a widget with neither warningThreshold nor criticalThreshold set", async () => {
    const monitorId = await createMonitor(app);
    const dashboard = await app.inject({
      method: "POST",
      url: "/api/dashboards",
      payload: { name: "Threshold" },
    });
    const dashboardId = dashboard.json().id;

    const res = await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashboardId}/widgets`,
      payload: { monitorId, triggerType: "response_time_ms" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()[0].field).toBe("criticalThreshold");
  });

  it("accepts both warningThreshold and criticalThreshold, rejects them swapped (FR-005)", async () => {
    const monitorId = await createMonitor(app);
    const dashboard = await app.inject({
      method: "POST",
      url: "/api/dashboards",
      payload: { name: "Ordering" },
    });
    const dashboardId = dashboard.json().id;

    const ok = await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashboardId}/widgets`,
      payload: {
        monitorId,
        triggerType: "response_time_ms",
        warningThreshold: 500,
        criticalThreshold: 2000,
      },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().warningThreshold).toBe(500);
    expect(ok.json().criticalThreshold).toBe(2000);

    const swapped = await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashboardId}/widgets`,
      payload: {
        monitorId,
        triggerType: "response_time_ms",
        warningThreshold: 2000,
        criticalThreshold: 500,
      },
    });
    expect(swapped.statusCode).toBe(400);
    expect(swapped.json()[0].field).toBe("warningThreshold");
  });

  it("computes warning/critical severity for a response-time widget with both thresholds", async () => {
    const monitorId = await createMonitor(app, { name: "response-time-target" });
    await prisma.heartbeat.create({
      data: { monitorId, status: "up", responseTimeMs: 800, message: "OK" },
    });

    const dashboard = await app.inject({
      method: "POST",
      url: "/api/dashboards",
      payload: { name: "Severity" },
    });
    const dashboardId = dashboard.json().id;

    const widget = await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashboardId}/widgets`,
      payload: {
        monitorId,
        triggerType: "response_time_ms",
        warningThreshold: 500,
        criticalThreshold: 2000,
      },
    });
    expect(widget.json().severity).toBe("warning");

    await prisma.heartbeat.create({
      data: { monitorId, status: "up", responseTimeMs: 2500, message: "slow" },
    });
    const afterCritical = await app.inject({ method: "GET", url: `/api/dashboards/${dashboardId}` });
    expect(afterCritical.json().widgets[0].severity).toBe("critical");
  });

  it("GET /api/dashboards/:id returns widgets with a correctly computed severity", async () => {
    const downMonitorId = await createMonitor(app, { name: "down-one" });
    await prisma.monitor.update({
      where: { id: downMonitorId },
      data: { status: "down", statusSince: new Date() },
    });

    const dashboard = await app.inject({
      method: "POST",
      url: "/api/dashboards",
      payload: { name: "Live State" },
    });
    const dashboardId = dashboard.json().id;

    await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashboardId}/widgets`,
      payload: { monitorId: downMonitorId, triggerType: "status_down" },
    });

    const detail = await app.inject({ method: "GET", url: `/api/dashboards/${dashboardId}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().widgets).toHaveLength(1);
    expect(detail.json().widgets[0].severity).toBe("critical");
    expect(detail.json().widgets[0].monitor.status).toBe("down");

    const missing = await app.inject({ method: "GET", url: "/api/dashboards/nope" });
    expect(missing.statusCode).toBe(404);
  });

  it("DELETE /api/dashboards/:id/widgets/:widgetId removes just that widget", async () => {
    const monitorId = await createMonitor(app);
    const dashboard = await app.inject({
      method: "POST",
      url: "/api/dashboards",
      payload: { name: "Remove Widget" },
    });
    const dashboardId = dashboard.json().id;

    const widget = await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashboardId}/widgets`,
      payload: { monitorId, triggerType: "status_down" },
    });
    const widgetId = widget.json().id;

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/dashboards/${dashboardId}/widgets/${widgetId}`,
    });
    expect(removed.statusCode).toBe(204);

    const detail = await app.inject({ method: "GET", url: `/api/dashboards/${dashboardId}` });
    expect(detail.json().widgets).toEqual([]);

    const monitor = await app.inject({ method: "GET", url: `/api/monitors/${monitorId}` });
    expect(monitor.statusCode).toBe(200);
  });

  it("deleting the underlying monitor removes its widgets from every dashboard (FR-008)", async () => {
    const monitorId = await createMonitor(app);
    const dashA = (
      await app.inject({ method: "POST", url: "/api/dashboards", payload: { name: "A" } })
    ).json();
    const dashB = (
      await app.inject({ method: "POST", url: "/api/dashboards", payload: { name: "B" } })
    ).json();

    await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashA.id}/widgets`,
      payload: { monitorId, triggerType: "status_down" },
    });
    await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashB.id}/widgets`,
      payload: { monitorId, triggerType: "docker_check_failing" },
    });

    await app.inject({ method: "DELETE", url: `/api/monitors/${monitorId}` });

    const detailA = await app.inject({ method: "GET", url: `/api/dashboards/${dashA.id}` });
    const detailB = await app.inject({ method: "GET", url: `/api/dashboards/${dashB.id}` });
    expect(detailA.json().widgets).toEqual([]);
    expect(detailB.json().widgets).toEqual([]);
  });

  it("keeps two dashboards fully isolated across rename/delete (spec.md US3)", async () => {
    const monitorId1 = await createMonitor(app, { name: "iso-1" });
    const monitorId2 = await createMonitor(app, { name: "iso-2" });

    const dashA = (
      await app.inject({ method: "POST", url: "/api/dashboards", payload: { name: "Iso A" } })
    ).json();
    const dashB = (
      await app.inject({ method: "POST", url: "/api/dashboards", payload: { name: "Iso B" } })
    ).json();

    await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashA.id}/widgets`,
      payload: { monitorId: monitorId1, triggerType: "status_down" },
    });
    await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashB.id}/widgets`,
      payload: { monitorId: monitorId2, triggerType: "status_down" },
    });

    await app.inject({
      method: "PUT",
      url: `/api/dashboards/${dashA.id}`,
      payload: { name: "Iso A Renamed" },
    });

    const bBeforeDelete = await app.inject({ method: "GET", url: `/api/dashboards/${dashB.id}` });
    expect(bBeforeDelete.json().name).toBe("Iso B");
    expect(bBeforeDelete.json().widgets).toHaveLength(1);

    await app.inject({ method: "DELETE", url: `/api/dashboards/${dashA.id}` });

    const bAfterDelete = await app.inject({ method: "GET", url: `/api/dashboards/${dashB.id}` });
    expect(bAfterDelete.statusCode).toBe(200);
    expect(bAfterDelete.json().name).toBe("Iso B");
    expect(bAfterDelete.json().widgets).toHaveLength(1);
    expect(bAfterDelete.json().widgets[0].monitor.id).toBe(monitorId2);
  });

  it("returns the widget's recent-history indicator bounded to 20, chronological order (specs/028 FR-007)", async () => {
    const monitorId = await createMonitor(app, { name: "history-target" });
    const statuses = ["up", "up", "down", "up", "down"];
    for (const status of statuses) {
      await prisma.heartbeat.create({ data: { monitorId, status, message: status } });
    }

    const dashboard = await app.inject({
      method: "POST",
      url: "/api/dashboards",
      payload: { name: "History" },
    });
    const dashboardId = dashboard.json().id;
    await app.inject({
      method: "POST",
      url: `/api/dashboards/${dashboardId}/widgets`,
      payload: { monitorId, triggerType: "status_down" },
    });

    const detail = await app.inject({ method: "GET", url: `/api/dashboards/${dashboardId}` });
    const recent = detail.json().widgets[0].monitor.recentHeartbeats;
    expect(recent).toHaveLength(statuses.length);
    expect(recent.map((h: { status: string }) => h.status)).toEqual(statuses);
    // chronological (oldest first) — timestamps must be non-decreasing
    for (let i = 1; i < recent.length; i++) {
      expect(new Date(recent[i].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(recent[i - 1].timestamp).getTime(),
      );
    }
  });
});
