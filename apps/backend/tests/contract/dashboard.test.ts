import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.js";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

describe("dashboard REST contract", () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ctx = await createTestApp("test-dashboard-contract");
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("GET /api/dashboard/trend returns an empty array with no heartbeats", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard/trend" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("defaults range to 7d and aggregates recorded heartbeats", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "trend-source", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;

    await prisma.heartbeat.create({
      data: { monitorId: id, status: "up", responseTimeMs: 50, message: "OK" },
    });
    await prisma.heartbeat.create({
      data: { monitorId: id, status: "up", responseTimeMs: 150, message: "OK" },
    });

    const res = await app.inject({ method: "GET", url: "/api/dashboard/trend?range=7d" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
    const today = body[body.length - 1];
    expect(today.avgResponseTimeMs).toBe(100);
    expect(today.uptimePercent).toBe(100);
  });

  it("accepts range=30d", async () => {
    const res = await app.inject({ method: "GET", url: "/api/dashboard/trend?range=30d" });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });
});
