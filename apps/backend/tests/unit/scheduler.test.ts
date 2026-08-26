import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Scheduler, shouldNotify, type SchedulerPrisma } from "../../src/scheduler/index.js";
import type { MonitorChecker } from "../../src/checkers/types.js";
import type { Monitor as PrismaMonitor } from "@prisma/client";

function makeMonitor(overrides: Partial<PrismaMonitor> = {}): PrismaMonitor {
  const now = new Date();
  return {
    id: "m1",
    name: "test",
    type: "http",
    target: "https://example.com",
    intervalSeconds: 60,
    timeoutSeconds: 48,
    retries: 2,
    retryIntervalSeconds: 0,
    expectedStatusMin: 200,
    expectedStatusMax: 299,
    active: true,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeFakePrisma(initial: PrismaMonitor) {
  let monitor = { ...initial };
  const heartbeats: unknown[] = [];
  const prisma: SchedulerPrisma = {
    monitor: {
      async findUnique() {
        return { ...monitor };
      },
      async findMany() {
        return monitor.active ? [{ ...monitor }] : [];
      },
      async update({ data }) {
        monitor = { ...monitor, ...data };
        return { ...monitor };
      },
    },
    heartbeat: {
      async create({ data }) {
        const record = {
          id: randomUUID(),
          monitorId: data.monitorId,
          timestamp: new Date(),
          status: data.status,
          responseTimeMs: data.responseTimeMs,
          message: data.message,
        };
        heartbeats.push(record);
        return record;
      },
    },
  };
  return { prisma, heartbeats, getMonitor: () => monitor };
}

describe("Scheduler", () => {
  it("transitions pending -> up on first successful check", async () => {
    const initial = makeMonitor({ status: "pending" });
    const { prisma, getMonitor } = makeFakePrisma(initial);
    const checker: MonitorChecker = {
      type: "http",
      check: vi.fn().mockResolvedValue({ status: "up", responseTimeMs: 10, message: "OK" }),
    };
    const onStatusChange = vi.fn();
    const scheduler = new Scheduler({
      prisma,
      checkers: { http: checker, tcp: checker, ping: checker },
      onHeartbeat: vi.fn(),
      onStatusChange,
      sleep: async () => {},
    });

    await scheduler.runCheckNow("m1");

    expect(getMonitor().status).toBe("up");
    expect(onStatusChange).toHaveBeenCalledOnce();
  });

  it("stays up after a single failed attempt while retries remain (down only after retries exhausted)", async () => {
    const initial = makeMonitor({ status: "up", retries: 2 });
    const { prisma, getMonitor } = makeFakePrisma(initial);
    let call = 0;
    const checker: MonitorChecker = {
      type: "http",
      check: vi.fn().mockImplementation(async () => {
        call += 1;
        // Fails every attempt (exhausts retries) so we can assert intermediate heartbeats.
        return { status: "down", responseTimeMs: null, message: `attempt ${call}` };
      }),
    };
    const onHeartbeat = vi.fn();
    const onStatusChange = vi.fn();
    const scheduler = new Scheduler({
      prisma,
      checkers: { http: checker, tcp: checker, ping: checker },
      onHeartbeat,
      onStatusChange,
      sleep: async () => {},
    });

    await scheduler.runCheckNow("m1");

    // 1 initial attempt + 2 retries = 3 heartbeats recorded
    expect(onHeartbeat).toHaveBeenCalledTimes(3);
    expect(getMonitor().status).toBe("down");
    expect(onStatusChange).toHaveBeenCalledOnce();
  });

  it("recovers down -> up on a single successful check, no retry needed", async () => {
    const initial = makeMonitor({ status: "down", retries: 3 });
    const { prisma, getMonitor } = makeFakePrisma(initial);
    const checker: MonitorChecker = {
      type: "http",
      check: vi.fn().mockResolvedValue({ status: "up", responseTimeMs: 5, message: "OK" }),
    };
    const scheduler = new Scheduler({
      prisma,
      checkers: { http: checker, tcp: checker, ping: checker },
      onHeartbeat: vi.fn(),
      onStatusChange: vi.fn(),
      sleep: async () => {},
    });

    await scheduler.runCheckNow("m1");

    expect(checker.check).toHaveBeenCalledOnce();
    expect(getMonitor().status).toBe("up");
  });

  it("skips a tick if the previous check for the same monitor is still in flight (no-overlap guard)", async () => {
    const initial = makeMonitor({ status: "pending" });
    const { prisma } = makeFakePrisma(initial);
    let resolveCheck!: () => void;
    const inFlightPromise = new Promise<void>((resolve) => {
      resolveCheck = resolve;
    });
    let checkCalls = 0;
    const checker: MonitorChecker = {
      type: "http",
      check: vi.fn().mockImplementation(async () => {
        checkCalls += 1;
        await inFlightPromise;
        return { status: "up", responseTimeMs: 1, message: "OK" };
      }),
    };
    const scheduler = new Scheduler({
      prisma,
      checkers: { http: checker, tcp: checker, ping: checker },
      onHeartbeat: vi.fn(),
      onStatusChange: vi.fn(),
      sleep: async () => {},
    });

    const firstTick = scheduler.runCheckNow("m1");
    const secondTick = scheduler.runCheckNow("m1"); // should be skipped, first still in flight
    resolveCheck();
    await Promise.all([firstTick, secondTick]);

    expect(checkCalls).toBe(1);
  });

  it("calls onNotifiableStatusChange on up -> down (specs/018 FR-006)", async () => {
    const initial = makeMonitor({ status: "up" });
    const { prisma } = makeFakePrisma(initial);
    const checker: MonitorChecker = {
      type: "http",
      check: vi.fn().mockResolvedValue({ status: "down", responseTimeMs: null, message: "fail" }),
    };
    const onNotifiableStatusChange = vi.fn();
    const scheduler = new Scheduler({
      prisma,
      checkers: { http: checker, tcp: checker, ping: checker },
      onHeartbeat: vi.fn(),
      onStatusChange: vi.fn(),
      onNotifiableStatusChange,
      sleep: async () => {},
    });

    await scheduler.runCheckNow("m1");

    expect(onNotifiableStatusChange).toHaveBeenCalledOnce();
    const [previousStatus, monitor] = onNotifiableStatusChange.mock.calls[0];
    expect(previousStatus).toBe("up");
    expect(monitor.status).toBe("down");
  });

  it("calls onNotifiableStatusChange on down -> up (specs/018 FR-007)", async () => {
    const initial = makeMonitor({ status: "down" });
    const { prisma } = makeFakePrisma(initial);
    const checker: MonitorChecker = {
      type: "http",
      check: vi.fn().mockResolvedValue({ status: "up", responseTimeMs: 5, message: "OK" }),
    };
    const onNotifiableStatusChange = vi.fn();
    const scheduler = new Scheduler({
      prisma,
      checkers: { http: checker, tcp: checker, ping: checker },
      onHeartbeat: vi.fn(),
      onStatusChange: vi.fn(),
      onNotifiableStatusChange,
      sleep: async () => {},
    });

    await scheduler.runCheckNow("m1");

    expect(onNotifiableStatusChange).toHaveBeenCalledOnce();
    const [previousStatus, monitor] = onNotifiableStatusChange.mock.calls[0];
    expect(previousStatus).toBe("down");
    expect(monitor.status).toBe("up");
  });

  it("does NOT call onNotifiableStatusChange on a monitor's first-ever check (specs/018 FR-008)", async () => {
    const initial = makeMonitor({ status: "pending" });
    const { prisma } = makeFakePrisma(initial);
    const checker: MonitorChecker = {
      type: "http",
      check: vi.fn().mockResolvedValue({ status: "up", responseTimeMs: 10, message: "OK" }),
    };
    const onStatusChange = vi.fn();
    const onNotifiableStatusChange = vi.fn();
    const scheduler = new Scheduler({
      prisma,
      checkers: { http: checker, tcp: checker, ping: checker },
      onHeartbeat: vi.fn(),
      onStatusChange,
      onNotifiableStatusChange,
      sleep: async () => {},
    });

    await scheduler.runCheckNow("m1");

    // onStatusChange (dashboard/socket) still fires for pending -> up...
    expect(onStatusChange).toHaveBeenCalledOnce();
    // ...but the notification-specific hook must not.
    expect(onNotifiableStatusChange).not.toHaveBeenCalled();
  });
});

describe("shouldNotify", () => {
  it("is true for up -> down and down -> up", () => {
    expect(shouldNotify("up", "down")).toBe(true);
    expect(shouldNotify("down", "up")).toBe(true);
  });

  it("is false when the status did not actually change", () => {
    expect(shouldNotify("up", "up")).toBe(false);
    expect(shouldNotify("down", "down")).toBe(false);
  });

  it("is false for any transition away from pending (the first check)", () => {
    expect(shouldNotify("pending", "up")).toBe(false);
    expect(shouldNotify("pending", "down")).toBe(false);
  });
});
