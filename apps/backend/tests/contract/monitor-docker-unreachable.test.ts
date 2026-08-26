import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

// Mocking the config module (rather than relying on process.env at import
// time) guarantees this test's outcome doesn't depend on ES module import
// hoisting order, or on whether the machine running it happens to have a
// real Docker daemon reachable at the default socket path.
vi.mock("../../src/config.js", () => ({
  config: {
    port: 0,
    databaseUrl: "",
    minIntervalSeconds: 20,
    dockerSocketPath: "/tmp/onlinemeter-test-definitely-missing-docker.sock",
  },
}));

const { createTestApp } = await import("../helpers/testApp.js");

describe("docker monitor creation-time socket probe (specs/006 FR-011)", () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    ctx = await createTestApp("test-docker-unreachable-contract");
    app = ctx.app;
  });

  afterAll(async () => {
    await ctx.cleanup();
  });

  it("POST /api/monitors rejects a docker monitor immediately with 400 when the Docker socket is unreachable", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "docker-check", type: "docker", target: "my-container" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().some((e: { field: string; message: string }) => e.field === "target")).toBe(true);
  });

  it("does not affect creation of a non-docker monitor", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/monitors",
      payload: { name: "plain-tcp", type: "tcp", target: "example.com:443" },
    });
    expect(res.statusCode).toBe(201);
  });
});
