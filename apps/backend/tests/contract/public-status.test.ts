import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.js";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

describe("public status page REST contract", () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ctx = await createTestApp("test-public-status-contract");
    app = ctx.app;
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("returns 200 with [] when no group is public (FR-008)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/public/status" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("shows a public group's monitors and hides a private group's monitors (FR-004/FR-006)", async () => {
    const publicGroup = await prisma.group.create({
      data: { name: "Public Group", isPublic: true },
    });
    const privateGroup = await prisma.group.create({
      data: { name: "Private Group", isPublic: false },
    });
    const publicMonitor = await prisma.monitor.create({
      data: {
        name: "public.example.com",
        type: "http",
        target: "https://public.example.com",
        status: "up",
        groupId: publicGroup.id,
      },
    });
    await prisma.monitor.create({
      data: {
        name: "private.example.com",
        type: "http",
        target: "https://private.example.com",
        status: "down",
        groupId: privateGroup.id,
      },
    });

    const res = await app.inject({ method: "GET", url: "/api/public/status" });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(publicGroup.id);
    expect(body[0].monitors).toHaveLength(1);
    expect(body[0].monitors[0]).toMatchObject({
      id: publicMonitor.id,
      name: "public.example.com",
      status: "up",
      active: true,
    });

    const monitorNames = body.flatMap(
      (g: { monitors: { name: string }[] }) => g.monitors.map((m) => m.name),
    );
    expect(monitorNames).not.toContain("private.example.com");
  });

  it("never exposes credentials, keyword rules, or the raw target (FR-007)", async () => {
    const group = await prisma.group.create({ data: { name: "Sensitive", isPublic: true } });
    await prisma.monitor.create({
      data: {
        name: "protected.example.com",
        type: "keyword",
        target: "https://protected.example.com",
        status: "up",
        groupId: group.id,
        basicAuthUsername: "admin",
        basicAuthPassword: "s3cret",
        keyword: "internal-only-marker",
        keywordInvert: true,
      },
    });

    const res = await app.inject({ method: "GET", url: "/api/public/status" });
    const raw = res.body;

    expect(raw).not.toContain("basicAuthUsername");
    expect(raw).not.toContain("basicAuthPassword");
    expect(raw).not.toContain("s3cret");
    expect(raw).not.toContain("keyword");
    expect(raw).not.toContain("internal-only-marker");
    expect(raw).not.toContain("target");
    expect(raw).not.toContain("protected.example.com".replace("protected", "https"));
  });

  it("includes trailing-24h heartbeats with only timestamp/status, excludes older ones (US2/FR-005)", async () => {
    const group = await prisma.group.create({ data: { name: "History", isPublic: true } });
    const monitor = await prisma.monitor.create({
      data: {
        name: "history.example.com",
        type: "http",
        target: "https://history.example.com",
        status: "up",
        groupId: group.id,
      },
    });

    const now = Date.now();
    await prisma.heartbeat.create({
      data: {
        monitorId: monitor.id,
        timestamp: new Date(now - 30 * 60 * 60 * 1000), // 30h ago — outside window
        status: "down",
        message: "old outage, should not appear",
      },
    });
    await prisma.heartbeat.create({
      data: {
        monitorId: monitor.id,
        timestamp: new Date(now - 60 * 60 * 1000), // 1h ago — inside window
        status: "down",
        responseTimeMs: 1234,
        message: "recent outage detail, should not leak",
      },
    });

    const res = await app.inject({ method: "GET", url: "/api/public/status" });
    const body = res.json();
    const found = body
      .find((g: { id: string }) => g.id === group.id)
      .monitors.find((m: { id: string }) => m.id === monitor.id);

    expect(found.recentHeartbeats).toHaveLength(1);
    expect(found.recentHeartbeats[0].status).toBe("down");
    expect(Object.keys(found.recentHeartbeats[0]).sort()).toEqual(["status", "timestamp"]);
    expect(res.body).not.toContain("recent outage detail");
    expect(res.body).not.toContain("old outage");
  });

  it("stops showing a group's monitors immediately after it is toggled private (US3)", async () => {
    const group = await prisma.group.create({ data: { name: "Toggle", isPublic: true } });
    await prisma.monitor.create({
      data: {
        name: "toggle.example.com",
        type: "http",
        target: "https://toggle.example.com",
        status: "up",
        groupId: group.id,
      },
    });

    const before = await app.inject({ method: "GET", url: "/api/public/status" });
    expect(before.json().some((g: { id: string }) => g.id === group.id)).toBe(true);

    await app.inject({
      method: "PUT",
      url: `/api/groups/${group.id}`,
      payload: { name: "Toggle", isPublic: false },
    });

    const after = await app.inject({ method: "GET", url: "/api/public/status" });
    expect(after.json().some((g: { id: string }) => g.id === group.id)).toBe(false);
  });
});
