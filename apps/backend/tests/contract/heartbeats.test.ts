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

  it("returns only heartbeats within a custom from/to window (specs/025)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "custom-range", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;

    await prisma.heartbeat.create({
      data: {
        monitorId: id,
        status: "up",
        responseTimeMs: 10,
        message: "before window",
        timestamp: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await prisma.heartbeat.create({
      data: {
        monitorId: id,
        status: "up",
        responseTimeMs: 10,
        message: "inside window",
        timestamp: new Date("2026-01-05T00:00:00.000Z"),
      },
    });
    await prisma.heartbeat.create({
      data: {
        monitorId: id,
        status: "down",
        responseTimeMs: null,
        message: "after window",
        timestamp: new Date("2026-01-10T00:00:00.000Z"),
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/monitors/${id}/heartbeats?from=2026-01-02T00:00:00.000Z&to=2026-01-08T00:00:00.000Z`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].message).toBe("inside window");
  });

  it("ignores `range` when a valid from/to window is also present", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "custom-range-precedence", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;

    await prisma.heartbeat.create({
      data: {
        monitorId: id,
        status: "up",
        responseTimeMs: 10,
        message: "old",
        timestamp: new Date("2020-01-01T00:00:00.000Z"),
      },
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/monitors/${id}/heartbeats?range=1h&from=2019-01-01T00:00:00.000Z&to=2021-01-01T00:00:00.000Z`,
    });
    expect(res.statusCode).toBe(200);
    // With `range=1h` alone this would be empty; from/to must take precedence.
    expect(res.json()).toHaveLength(1);
  });

  it("rejects `to` before `from` with a ValidationFieldError[] 400", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "backwards-range", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;

    const res = await app.inject({
      method: "GET",
      url: `/api/monitors/${id}/heartbeats?from=2026-01-08T00:00:00.000Z&to=2026-01-02T00:00:00.000Z`,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ field: "to" });
  });

  it("rejects a malformed `from` with a ValidationFieldError[] 400", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "malformed-range", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;

    const res = await app.inject({
      method: "GET",
      url: `/api/monitors/${id}/heartbeats?from=not-a-date&to=2026-01-02T00:00:00.000Z`,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ field: "from" });
  });

  it("keeps existing range-only behavior completely unaffected", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "range-only", type: "http", target: "https://example.com" },
    });
    const id = created.json().id;

    await prisma.heartbeat.create({
      data: { monitorId: id, status: "up", responseTimeMs: 5, message: "OK" },
    });

    const res = await app.inject({ method: "GET", url: `/api/monitors/${id}/heartbeats?range=7d` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
  });
});
