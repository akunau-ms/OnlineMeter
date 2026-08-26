import { describe, expect, it, vi } from "vitest";
import type { Monitor } from "shared-types";

const probeMock = vi.fn();
vi.mock("ping", () => ({
  default: { promise: { probe: (...args: unknown[]) => probeMock(...args) } },
}));

const { pingChecker } = await import("../../../src/checkers/ping.js");

function baseMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: "m1",
    name: "test",
    type: "ping",
    target: "example.com",
    intervalSeconds: 60,
    timeoutSeconds: 5,
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

describe("pingChecker", () => {
  it("reports up with a response time when the host is alive", async () => {
    probeMock.mockResolvedValueOnce({ alive: true, time: 12.3 });
    const result = await pingChecker.check(baseMonitor());
    expect(result.status).toBe("up");
    expect(result.responseTimeMs).toBe(12);
  });

  it("reports down when the host is unreachable", async () => {
    probeMock.mockResolvedValueOnce({ alive: false, time: "unknown" });
    const result = await pingChecker.check(baseMonitor());
    expect(result.status).toBe("down");
  });

  it("reports down when the underlying probe throws", async () => {
    probeMock.mockRejectedValueOnce(new Error("ping binary not found"));
    const result = await pingChecker.check(baseMonitor());
    expect(result.status).toBe("down");
    expect(result.message).toContain("ping binary not found");
  });
});
