import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import { createTestApp } from "../helpers/testApp.js";
import type { FastifyInstance } from "fastify";
import type { MonitorHeartbeatEvent, MonitorUpdateEvent } from "shared-types";

describe("realtime: live status/heartbeat push and resync", () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    ctx = await createTestApp("test-realtime-live-update");
    app = ctx.app;
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (address && typeof address === "object") baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  /** See realtime-connect.test.ts: listeners must be attached synchronously
   * at socket creation, before awaiting the initial `monitor:list`, or a
   * fast server can emit before the test is listening. */
  function connectClient(): { socket: Socket; nextList: Promise<unknown> } {
    const socket = io(baseUrl, { path: "/socket.io", forceNew: true });
    const nextList = new Promise((resolve) => socket.once("monitor:list", resolve));
    return { socket, nextList };
  }

  it("emits monitor:heartbeat and monitor:update to every connected client when a check completes", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      // Port 1 is reliably refused/unreachable, giving a fast deterministic "down".
      payload: { name: "live-update", type: "tcp", target: "127.0.0.1:1", timeoutSeconds: 2 },
    });
    const id = created.json().id;

    const a = connectClient();
    const b = connectClient();
    await Promise.all([a.nextList, b.nextList]);

    const heartbeatA = new Promise<MonitorHeartbeatEvent>((resolve) =>
      a.socket.once("monitor:heartbeat", resolve),
    );
    const updateA = new Promise<MonitorUpdateEvent>((resolve) =>
      a.socket.once("monitor:update", resolve),
    );
    const heartbeatB = new Promise<MonitorHeartbeatEvent>((resolve) =>
      b.socket.once("monitor:heartbeat", resolve),
    );

    await app.scheduler.runCheckNow(id);

    const [hbA, upA, hbB] = await Promise.all([heartbeatA, updateA, heartbeatB]);

    expect(hbA.monitorId).toBe(id);
    expect(hbA.heartbeat.status).toBe("down");
    expect(upA.monitorId).toBe(id);
    expect(upA.status).toBe("down");
    expect(hbB.monitorId).toBe(id);

    a.socket.disconnect();
    b.socket.disconnect();
  });

  it("resyncs a reconnecting client to the current (already-changed) status via monitor:list", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "resync-target", type: "tcp", target: "127.0.0.1:1", timeoutSeconds: 2 },
    });
    const id = created.json().id;
    await app.scheduler.runCheckNow(id);

    const { socket, nextList } = connectClient();
    const snapshot = (await nextList) as { monitors: { id: string; status: string }[] };

    const monitor = snapshot.monitors.find((m) => m.id === id);
    expect(monitor?.status).toBe("down");
    socket.disconnect();
  });
});
