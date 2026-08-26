import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.js";
import type { FastifyInstance } from "fastify";

describe("groups REST contract", () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    ctx = await createTestApp("test-groups-contract");
    app = ctx.app;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("GET /api/groups starts empty", async () => {
    const res = await app.inject({ method: "GET", url: "/api/groups" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("POST /api/groups creates a group", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/groups",
      payload: { name: "Production" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.name).toBe("Production");
    expect(body.id).toBeTruthy();
  });

  it("POST /api/groups rejects an empty name with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/api/groups", payload: { name: "" } });
    expect(res.statusCode).toBe(400);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("PUT/DELETE /api/groups/:id round-trip", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/groups",
      payload: { name: "Internal" },
    });
    const id = created.json().id;

    const renamed = await app.inject({
      method: "PUT",
      url: `/api/groups/${id}`,
      payload: { name: "Internal Tools" },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe("Internal Tools");

    const deleted = await app.inject({ method: "DELETE", url: `/api/groups/${id}` });
    expect(deleted.statusCode).toBe(204);

    const list = await app.inject({ method: "GET", url: "/api/groups" });
    expect(list.json().some((g: { id: string }) => g.id === id)).toBe(false);
  });

  it("PUT /api/groups/:id sets and preserves isPublic (specs/017 FR-002/FR-003)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/groups",
      payload: { name: "Visibility" },
    });
    const id = created.json().id;
    expect(created.json().isPublic).toBe(false);

    const madePublic = await app.inject({
      method: "PUT",
      url: `/api/groups/${id}`,
      payload: { name: "Visibility", isPublic: true },
    });
    expect(madePublic.json().isPublic).toBe(true);

    const renameOnly = await app.inject({
      method: "PUT",
      url: `/api/groups/${id}`,
      payload: { name: "Visibility Renamed" },
    });
    expect(renameOnly.json().isPublic).toBe(true);

    const madePrivate = await app.inject({
      method: "PUT",
      url: `/api/groups/${id}`,
      payload: { name: "Visibility Renamed", isPublic: false },
    });
    expect(madePrivate.json().isPublic).toBe(false);
  });

  it("returns 404 for PUT/DELETE on an unknown group id", async () => {
    const putRes = await app.inject({
      method: "PUT",
      url: "/api/groups/does-not-exist",
      payload: { name: "x" },
    });
    expect(putRes.statusCode).toBe(404);
    const deleteRes = await app.inject({ method: "DELETE", url: "/api/groups/does-not-exist" });
    expect(deleteRes.statusCode).toBe(404);
  });

  it("deleting a group sets groupId=null on its monitors without deleting or disabling them (FR-011)", async () => {
    const group = await app.inject({
      method: "POST",
      url: "/api/groups",
      payload: { name: "Doomed" },
    });
    const groupId = group.json().id;

    const monitor = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "grouped-monitor", type: "http", target: "https://example.com", groupId },
    });
    const monitorId = monitor.json().id;
    expect(monitor.json().groupId).toBe(groupId);

    await app.inject({ method: "DELETE", url: `/api/groups/${groupId}` });

    const after = await app.inject({ method: "GET", url: `/api/monitors/${monitorId}` });
    expect(after.statusCode).toBe(200);
    expect(after.json().groupId).toBeNull();
    expect(after.json().active).toBe(true);
  });
});
