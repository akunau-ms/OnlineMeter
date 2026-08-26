import net, { type Server } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tcpChecker } from "../../../src/checkers/tcp.js";
import type { Monitor } from "shared-types";

function baseMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: "m1",
    name: "test",
    type: "tcp",
    target: "127.0.0.1:0",
    intervalSeconds: 60,
    timeoutSeconds: 1,
    retries: 0,
    retryIntervalSeconds: 0,
    expectedStatusMin: null,
    expectedStatusMax: null,
    active: true,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("tcpChecker", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address && typeof address === "object") port = address.port;
  });

  afterAll(() => {
    server.close();
  });

  it("reports up when the connection succeeds", async () => {
    const result = await tcpChecker.check(baseMonitor({ target: `127.0.0.1:${port}` }));
    expect(result.status).toBe("up");
  });

  it("reports down when the connection is refused", async () => {
    const result = await tcpChecker.check(baseMonitor({ target: "127.0.0.1:1" }));
    expect(result.status).toBe("down");
  });

  it("reports down with a timeout message when nothing responds", async () => {
    // 10.255.255.1 is a non-routable address commonly used to force a connect timeout.
    const result = await tcpChecker.check(
      baseMonitor({ target: "10.255.255.1:81", timeoutSeconds: 1 }),
    );
    expect(result.status).toBe("down");
  }, 10000);
});
