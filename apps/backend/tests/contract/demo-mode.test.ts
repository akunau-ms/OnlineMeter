import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.js";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const READ_ONLY_ERROR = "This is a read-only demo — changes are disabled.";

describe("demo mode write-blocking (specs/021)", () => {
  describe("demoMode: true", () => {
    let ctx: Awaited<ReturnType<typeof createTestApp>>;
    let app: FastifyInstance;
    let prisma: PrismaClient;
    let monitorId: string;
    let groupId: string;
    let channelId: string;
    let dashboardId: string;

    beforeAll(async () => {
      ctx = await createTestApp("test-demo-mode-on", { demoMode: true });
      app = ctx.app;
      prisma = ctx.prisma;

      // Seed directly via Prisma — POST is blocked, so the API itself
      // can't be used to set up fixtures in a demo-mode instance.
      const group = await prisma.group.create({ data: { name: "Fixture Group" } });
      groupId = group.id;
      const monitor = await prisma.monitor.create({
        data: { name: "Fixture Monitor", type: "http", target: "https://example.com", groupId },
      });
      monitorId = monitor.id;
      const channel = await prisma.notificationChannel.create({
        data: { name: "Fixture Channel", url: "https://example.com/hook" },
      });
      channelId = channel.id;
      const dashboard = await prisma.dashboard.create({ data: { name: "Fixture Dashboard" } });
      dashboardId = dashboard.id;
      await prisma.dashboardWidget.create({
        data: { dashboardId, monitorId, triggerType: "status_down", position: 0 },
      });
    });

    afterAll(async () => {
      await ctx.cleanup();
    });

    it("blocks every monitor write", async () => {
      const create = await app.inject({
        method: "POST",
        url: "/api/monitors",
        payload: { name: "x", type: "http", target: "https://example.com" },
      });
      expect(create.statusCode).toBe(403);
      expect(create.json()).toEqual({ error: READ_ONLY_ERROR });

      const update = await app.inject({
        method: "PUT",
        url: `/api/monitors/${monitorId}`,
        payload: { name: "changed" },
      });
      expect(update.statusCode).toBe(403);

      const pause = await app.inject({ method: "POST", url: `/api/monitors/${monitorId}/pause` });
      expect(pause.statusCode).toBe(403);

      const resume = await app.inject({ method: "POST", url: `/api/monitors/${monitorId}/resume` });
      expect(resume.statusCode).toBe(403);

      const del = await app.inject({ method: "DELETE", url: `/api/monitors/${monitorId}` });
      expect(del.statusCode).toBe(403);
    });

    it("blocks every group write", async () => {
      const create = await app.inject({ method: "POST", url: "/api/groups", payload: { name: "x" } });
      expect(create.statusCode).toBe(403);

      const update = await app.inject({
        method: "PUT",
        url: `/api/groups/${groupId}`,
        payload: { name: "changed" },
      });
      expect(update.statusCode).toBe(403);

      const del = await app.inject({ method: "DELETE", url: `/api/groups/${groupId}` });
      expect(del.statusCode).toBe(403);
    });

    it("blocks every notification-channel write, including test-send", async () => {
      const create = await app.inject({
        method: "POST",
        url: "/api/notification-channels",
        payload: { name: "x", url: "https://example.com/hook" },
      });
      expect(create.statusCode).toBe(403);

      const update = await app.inject({
        method: "PUT",
        url: `/api/notification-channels/${channelId}`,
        payload: { enabled: false },
      });
      expect(update.statusCode).toBe(403);

      const test = await app.inject({
        method: "POST",
        url: `/api/notification-channels/${channelId}/test`,
      });
      expect(test.statusCode).toBe(403);

      const del = await app.inject({
        method: "DELETE",
        url: `/api/notification-channels/${channelId}`,
      });
      expect(del.statusCode).toBe(403);
    });

    it("blocks every dashboard write, including widget sub-resources (specs/027-029)", async () => {
      const create = await app.inject({
        method: "POST",
        url: "/api/dashboards",
        payload: { name: "x" },
      });
      expect(create.statusCode).toBe(403);
      expect(create.json()).toEqual({ error: READ_ONLY_ERROR });

      const update = await app.inject({
        method: "PUT",
        url: `/api/dashboards/${dashboardId}`,
        payload: { name: "changed" },
      });
      expect(update.statusCode).toBe(403);

      const addWidget = await app.inject({
        method: "POST",
        url: `/api/dashboards/${dashboardId}/widgets`,
        payload: { monitorId, triggerType: "status_down" },
      });
      expect(addWidget.statusCode).toBe(403);

      const del = await app.inject({ method: "DELETE", url: `/api/dashboards/${dashboardId}` });
      expect(del.statusCode).toBe(403);
    });

    it("leaves every read endpoint fully working", async () => {
      const monitors = await app.inject({ method: "GET", url: "/api/monitors" });
      expect(monitors.statusCode).toBe(200);
      expect(monitors.json()).toHaveLength(1);

      const groups = await app.inject({ method: "GET", url: "/api/groups" });
      expect(groups.statusCode).toBe(200);
      expect(groups.json()).toHaveLength(1);

      const channels = await app.inject({ method: "GET", url: "/api/notification-channels" });
      expect(channels.statusCode).toBe(200);
      expect(channels.json()).toHaveLength(1);

      const publicStatus = await app.inject({ method: "GET", url: "/api/public/status" });
      expect(publicStatus.statusCode).toBe(200);

      const dashboards = await app.inject({ method: "GET", url: "/api/dashboards" });
      expect(dashboards.statusCode).toBe(200);
      expect(dashboards.json()).toHaveLength(1);

      const dashboardDetail = await app.inject({
        method: "GET",
        url: `/api/dashboards/${dashboardId}`,
      });
      expect(dashboardDetail.statusCode).toBe(200);
      expect(dashboardDetail.json().widgets).toHaveLength(1);
    });
  });

  describe("demoMode: false (default) — regression guard for FR-002/SC-003", () => {
    let ctx: Awaited<ReturnType<typeof createTestApp>>;
    let app: FastifyInstance;

    beforeAll(async () => {
      ctx = await createTestApp("test-demo-mode-off");
      app = ctx.app;
    });

    afterAll(async () => {
      await ctx.cleanup();
    });

    it("allows normal writes exactly as every prior feature already relies on", async () => {
      const create = await app.inject({
        method: "POST",
        url: "/api/monitors",
        payload: { name: "x", type: "http", target: "https://example.com" },
      });
      expect(create.statusCode).toBe(201);

      const id = create.json().id;
      const update = await app.inject({
        method: "PUT",
        url: `/api/monitors/${id}`,
        payload: { name: "changed" },
      });
      expect(update.statusCode).toBe(200);

      const del = await app.inject({ method: "DELETE", url: `/api/monitors/${id}` });
      expect(del.statusCode).toBe(204);
    });
  });
});
