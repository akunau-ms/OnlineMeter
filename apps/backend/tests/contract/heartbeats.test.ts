import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.js";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

describe("heartbeats REST contract", () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ctx = await createTestApp("test-heartbeats-contract");
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("returns an empty array (not an error) for a monitor with no heartbeats yet", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "fresh", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;

    const res = await app.inject({ method: "GET", url: `/api/monitors/${id}/heartbeats` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns recorded heartbeats in chronological order", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "with-history", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;

    await prisma.heartbeat.create({
      data: { monitorId: id, status: "up", responseTimeMs: 20, message: "OK" },
    });
    await prisma.heartbeat.create({
      data: { monitorId: id, status: "down", responseTimeMs: null, message: "timeout" },
    });

    const res = await app.inject({ method: "GET", url: `/api/monitors/${id}/heartbeats` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0].status).toBe("up");
    expect(body[1].status).toBe("down");
  });

  it("returns 404 for an unknown monitor", async () => {
    const res = await app.inject({ method: "GET", url: "/api/monitors/nope/heartbeats" });
    expect(res.statusCode).toBe(404);
  });
});
