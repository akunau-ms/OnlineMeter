import { describe, expect, it } from "vitest";
import { computeMonitorStats, type StatsHeartbeat } from "../../src/routes/monitor-stats.js";

function hb(overrides: Partial<StatsHeartbeat>): StatsHeartbeat {
  return { status: "up", responseTimeMs: 100, timestamp: new Date(), ...overrides };
}

describe("computeMonitorStats", () => {
  it("returns all-null fields when there are no heartbeats at all", () => {
    const stats = computeMonitorStats({ latest: null, last24h: [], last30d: [] });
    expect(stats).toEqual({
      currentResponseTimeMs: null,
      avgResponseTimeMs24h: null,
      uptime24h: null,
      uptime30d: null,
    });
  });

  it("returns null for a window with no heartbeats in it, even if other windows have data", () => {
    const latest = hb({ responseTimeMs: 42 });
    const stats = computeMonitorStats({ latest, last24h: [], last30d: [latest] });
    expect(stats.currentResponseTimeMs).toBe(42);
    expect(stats.avgResponseTimeMs24h).toBeNull();
    expect(stats.uptime24h).toBeNull();
    expect(stats.uptime30d).toBe(100);
  });

  it("computes current response time from the single latest heartbeat", () => {
    const latest = hb({ responseTimeMs: 77 });
    const stats = computeMonitorStats({ latest, last24h: [latest], last30d: [latest] });
    expect(stats.currentResponseTimeMs).toBe(77);
  });

  it("computes the 24h average response time only over heartbeats that recorded one", () => {
    const last24h = [
      hb({ responseTimeMs: 100 }),
      hb({ responseTimeMs: 200 }),
      hb({ status: "down", responseTimeMs: null }),
    ];
    const stats = computeMonitorStats({ latest: last24h[2], last24h, last30d: last24h });
    expect(stats.avgResponseTimeMs24h).toBe(150);
  });

  it("computes uptime percentage as up-count over total heartbeats in the window", () => {
    const last24h = [
      hb({ status: "up" }),
      hb({ status: "up" }),
      hb({ status: "up" }),
      hb({ status: "down", responseTimeMs: null }),
    ];
    const stats = computeMonitorStats({ latest: last24h[3], last24h, last30d: last24h });
    expect(stats.uptime24h).toBe(75);
    expect(stats.uptime30d).toBe(75);
  });

  it("computes uptime30d over whatever history exists for a monitor younger than 30 days, not padded", () => {
    // Only 2 heartbeats total ever recorded (monitor created a few hours ago) — both up.
    const sparse = [hb({ status: "up" }), hb({ status: "up" })];
    const stats = computeMonitorStats({ latest: sparse[1], last24h: sparse, last30d: sparse });
    expect(stats.uptime30d).toBe(100);
  });
});
