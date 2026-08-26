import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.js";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

describe("monitor stats REST contract", () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ctx = await createTestApp("test-monitor-stats-contract");
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("returns all-null fields for a monitor with no heartbeats yet", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "fresh", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;

    const res = await app.inject({ method: "GET", url: `/api/monitors/${id}/stats` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      currentResponseTimeMs: null,
      avgResponseTimeMs24h: null,
      uptime24h: null,
      uptime30d: null,
    });
  });

  it("computes stats from recorded heartbeats", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "with-history", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;

    await prisma.heartbeat.create({
      data: { monitorId: id, status: "up", responseTimeMs: 50, message: "OK" },
    });
    await prisma.heartbeat.create({
      data: { monitorId: id, status: "up", responseTimeMs: 150, message: "OK" },
    });

    const res = await app.inject({ method: "GET", url: `/api/monitors/${id}/stats` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currentResponseTimeMs).toBe(150);
    expect(body.avgResponseTimeMs24h).toBe(100);
    expect(body.uptime24h).toBe(100);
    expect(body.uptime30d).toBe(100);
  });

  it("returns 404 for an unknown monitor", async () => {
    const res = await app.inject({ method: "GET", url: "/api/monitors/does-not-exist/stats" });
    expect(res.statusCode).toBe(404);
  });
});
