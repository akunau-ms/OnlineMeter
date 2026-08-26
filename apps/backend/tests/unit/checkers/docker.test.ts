import fs from "node:fs";
import http, { type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { CheckableMonitor } from "../../../src/checkers/types.js";

const SOCKET_PATH = path.join(os.tmpdir(), `onlinemeter-docker-test-${process.pid}-${Date.now()}.sock`);
const mockedConfig = { dockerSocketPath: SOCKET_PATH, minIntervalSeconds: 20, port: 0, databaseUrl: "" };

vi.mock("../../../src/config.js", () => ({ config: mockedConfig }));

const { dockerChecker } = await import("../../../src/checkers/docker.js");

function baseMonitor(overrides: Partial<CheckableMonitor> = {}): CheckableMonitor {
  return {
    id: "m1",
    name: "test",
    type: "docker",
    target: "my-container",
    intervalSeconds: 60,
    timeoutSeconds: 2,
    retries: 0,
    retryIntervalSeconds: 0,
    expectedStatusMin: null,
    expectedStatusMax: null,
    active: true,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    groupId: null,
    basicAuthUsername: null,
    basicAuthPassword: null,
    ...overrides,
  } as CheckableMonitor;
}

describe("dockerChecker", () => {
  let server: Server;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? "";
      if (url === "/containers/running-healthy/json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({ State: { Running: true, Status: "running", Health: { Status: "healthy" } } }),
        );
      } else if (url === "/containers/running-unhealthy/json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({ State: { Running: true, Status: "running", Health: { Status: "unhealthy" } } }),
        );
      } else if (url === "/containers/stopped/json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ State: { Running: false, Status: "exited" } }));
      } else if (url === "/containers/missing/json") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "No such container" }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(SOCKET_PATH, resolve));
  });

  afterAll(() => {
    server.close();
    if (fs.existsSync(SOCKET_PATH)) fs.rmSync(SOCKET_PATH);
  });

  it("reports up for a running, healthy container", async () => {
    const result = await dockerChecker.check(baseMonitor({ target: "running-healthy" }));
    expect(result.status).toBe("up");
  });

  it("reports down for a running but unhealthy container", async () => {
    const result = await dockerChecker.check(baseMonitor({ target: "running-unhealthy" }));
    expect(result.status).toBe("down");
    expect(result.message.toLowerCase()).toContain("unhealthy");
  });

  it("reports down for a stopped container", async () => {
    const result = await dockerChecker.check(baseMonitor({ target: "stopped" }));
    expect(result.status).toBe("down");
  });

  it("reports down with a not-found message for a missing container", async () => {
    const result = await dockerChecker.check(baseMonitor({ target: "missing" }));
    expect(result.status).toBe("down");
    expect(result.message).toContain("not found");
  });

  it("reports a specific socket-unreachable message distinct from 'container down' when the Docker socket itself is unreachable", async () => {
    const originalPath = mockedConfig.dockerSocketPath;
    mockedConfig.dockerSocketPath = path.join(os.tmpdir(), "onlinemeter-definitely-missing.sock");
    try {
      const result = await dockerChecker.check(baseMonitor());
      expect(result.status).toBe("down");
      expect(result.message.toLowerCase()).toContain("socket");
      expect(result.message).not.toContain("not running");
    } finally {
      mockedConfig.dockerSocketPath = originalPath;
    }
  });
});
