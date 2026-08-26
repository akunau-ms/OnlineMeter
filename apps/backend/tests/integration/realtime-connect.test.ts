import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import { createTestApp } from "../helpers/testApp.js";
import type { FastifyInstance } from "fastify";

describe("realtime: monitor:list on connect", () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    ctx = await createTestApp("test-realtime-connect");
    app = ctx.app;
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (address && typeof address === "object") baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  /**
   * Registers the `monitor:list` listener in the SAME synchronous tick the
   * socket is created, before awaiting anything — otherwise the server can
   * emit its post-connect snapshot before the test attaches a listener for
   * it, and the test hangs waiting for an event it already missed.
   */
  function connectClient(): { socket: Socket; nextList: Promise<{ monitors: unknown[] }> } {
    const socket = io(baseUrl, { path: "/socket.io", forceNew: true });
    const nextList = new Promise<{ monitors: unknown[] }>((resolve) => {
      socket.once("monitor:list", resolve);
    });
    return { socket, nextList };
  }

  it("sends a full monitor:list snapshot immediately on connect", async () => {
    await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "seen-on-connect", type: "http", target: "https://example.com" },
    });

    const { socket, nextList } = connectClient();
    const snapshot = (await nextList) as { monitors: { name: string }[] };

    expect(snapshot.monitors.some((m) => m.name === "seen-on-connect")).toBe(true);
    socket.disconnect();
  });

  it("sends a fresh monitor:list snapshot again on reconnect", async () => {
    const { socket, nextList } = connectClient();
    await nextList;

    const nextListAfterReconnect = new Promise((resolve) => {
      socket.once("monitor:list", resolve);
    });
    socket.disconnect();
    socket.connect();
    const secondSnapshot = await nextListAfterReconnect;

    expect(secondSnapshot).toBeTruthy();
    socket.disconnect();
  });
});
