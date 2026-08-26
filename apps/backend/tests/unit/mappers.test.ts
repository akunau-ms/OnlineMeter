import { describe, expect, it } from "vitest";
import { toMonitorDTO } from "../../src/mappers.js";
import type { Monitor as PrismaMonitor } from "@prisma/client";

function prismaMonitor(overrides: Partial<PrismaMonitor> = {}): PrismaMonitor {
  const now = new Date();
  return {
    id: "m1",
    name: "test",
    type: "http",
    target: "https://example.com",
    intervalSeconds: 60,
    timeoutSeconds: 48,
    retries: 0,
    retryIntervalSeconds: 60,
    expectedStatusMin: 200,
    expectedStatusMax: 299,
    active: true,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    groupId: null,
    basicAuthUsername: "alice",
    basicAuthPassword: "s3cret",
    ...overrides,
  };
}

describe("toMonitorDTO", () => {
  it("never includes a basicAuthPassword key, even when the input row has one", () => {
    const dto = toMonitorDTO(prismaMonitor());
    expect(dto).not.toHaveProperty("basicAuthPassword");
    expect(Object.keys(dto)).not.toContain("basicAuthPassword");
  });

  it("does expose basicAuthUsername (safe, not secret)", () => {
    const dto = toMonitorDTO(prismaMonitor());
    expect(dto.basicAuthUsername).toBe("alice");
  });
});
