import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/testApp.js";
import type { FastifyInstance } from "fastify";

describe("notification channels REST contract", () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let app: FastifyInstance;
  let server: Server;
  let okUrl: string;
  let unreachableUrl: string;

  beforeAll(async () => {
    ctx = await createTestApp("test-notification-channels-contract");
    app = ctx.app;

    server = createServer((req, res) => {
      res.writeHead(200);
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (address && typeof address === "object") okUrl = `http://127.0.0.1:${address.port}/hook`;
    unreachableUrl = "http://127.0.0.1:1/unreachable";
  });

  afterAll(async () => {
    server.close();
    await ctx.cleanup();
  });

  it("GET /api/notification-channels starts empty", async () => {
    const res = await app.inject({ method: "GET", url: "/api/notification-channels" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("POST /api/notification-channels creates a channel, enabled by default", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notification-channels",
      payload: { name: "Ops Webhook", url: okUrl },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      name: "Ops Webhook",
      type: "webhook",
      url: okUrl,
      enabled: true,
      lastDeliveryAt: null,
      lastDeliveryOk: null,
    });
    expect(body.id).toBeTruthy();
  });

  it("POST /api/notification-channels rejects an empty name with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notification-channels",
      payload: { name: "", url: okUrl },
    });
    expect(res.statusCode).toBe(400);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("POST /api/notification-channels rejects an invalid URL with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notification-channels",
      payload: { name: "Bad URL", url: "not-a-url" },
    });
    expect(res.statusCode).toBe(400);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("POST /api/notification-channels/:id/test succeeds against a reachable URL and records the outcome", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/notification-channels",
      payload: { name: "Testable", url: okUrl },
    });
    const id = created.json().id;

    const testRes = await app.inject({
      method: "POST",
      url: `/api/notification-channels/${id}/test`,
    });
    expect(testRes.statusCode).toBe(200);
    expect(testRes.json()).toEqual({ ok: true });

    const list = await app.inject({ method: "GET", url: "/api/notification-channels" });
    const channel = list.json().find((c: { id: string }) => c.id === id);
    expect(channel.lastDeliveryOk).toBe(true);
    expect(channel.lastDeliveryAt).toBeTruthy();
  });

  it("POST /api/notification-channels/:id/test reports failure as 200 with ok:false, not an HTTP error", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/notification-channels",
      payload: { name: "Unreachable", url: unreachableUrl },
    });
    const id = created.json().id;

    const testRes = await app.inject({
      method: "POST",
      url: `/api/notification-channels/${id}/test`,
    });
    expect(testRes.statusCode).toBe(200);
    const body = testRes.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBeTruthy();
  });

  it("returns 404 for /test on an unknown channel id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/notification-channels/does-not-exist/test",
    });
    expect(res.statusCode).toBe(404);
  });

  it("PUT /api/notification-channels/:id updates enabled and preserves omitted fields", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/notification-channels",
      payload: { name: "Lifecycle", url: okUrl },
    });
    const id = created.json().id;

    const disabled = await app.inject({
      method: "PUT",
      url: `/api/notification-channels/${id}`,
      payload: { enabled: false },
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json()).toMatchObject({ name: "Lifecycle", url: okUrl, enabled: false });

    const renamed = await app.inject({
      method: "PUT",
      url: `/api/notification-channels/${id}`,
      payload: { name: "Lifecycle Renamed" },
    });
    expect(renamed.statusCode).toBe(200);
    // enabled omitted on this PUT -> stays false, matching GroupInput's convention
    expect(renamed.json()).toMatchObject({ name: "Lifecycle Renamed", enabled: false });

    const reEnabled = await app.inject({
      method: "PUT",
      url: `/api/notification-channels/${id}`,
      payload: { enabled: true },
    });
    expect(reEnabled.json().enabled).toBe(true);
  });

  it("returns 404 for PUT on an unknown channel id", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/notification-channels/does-not-exist",
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(404);
  });

  it("DELETE /api/notification-channels/:id removes it permanently", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/notification-channels",
      payload: { name: "Doomed", url: okUrl },
    });
    const id = created.json().id;

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/notification-channels/${id}`,
    });
    expect(deleted.statusCode).toBe(204);

    const list = await app.inject({ method: "GET", url: "/api/notification-channels" });
    expect(list.json().some((c: { id: string }) => c.id === id)).toBe(false);
  });

  it("returns 404 for DELETE on an unknown channel id", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: "/api/notification-channels/does-not-exist",
    });
    expect(res.statusCode).toBe(404);
  });
});
