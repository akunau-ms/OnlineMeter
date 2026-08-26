import { describe, expect, it } from "vitest";
import { computeDashboardTrend, type TrendHeartbeat } from "../../src/routes/dashboard.js";

function hb(date: string, overrides: Partial<TrendHeartbeat> = {}): TrendHeartbeat {
  return { status: "up", responseTimeMs: 100, timestamp: new Date(`${date}T12:00:00Z`), ...overrides };
}

describe("computeDashboardTrend", () => {
  it("returns an empty array when there are no heartbeats", () => {
    expect(computeDashboardTrend([])).toEqual([]);
  });

  it("groups heartbeats by calendar day and computes avg response time + uptime%", () => {
    const points = computeDashboardTrend([
      hb("2026-08-01", { responseTimeMs: 100, status: "up" }),
      hb("2026-08-01", { responseTimeMs: 200, status: "up" }),
      hb("2026-08-01", { responseTimeMs: null, status: "down" }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].date).toBe("2026-08-01");
    expect(points[0].avgResponseTimeMs).toBe(150);
    // 2 up out of 3 total = 66.7%
    expect(points[0].uptimePercent).toBeCloseTo(66.7, 1);
  });

  it("produces one point per day, sorted ascending, across multiple monitors", () => {
    const points = computeDashboardTrend([
      hb("2026-08-03"),
      hb("2026-08-01"),
      hb("2026-08-02"),
    ]);
    expect(points.map((p) => p.date)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });

  it("omits days with zero heartbeats rather than emitting a fabricated zero point", () => {
    const points = computeDashboardTrend([hb("2026-08-01"), hb("2026-08-05")]);
    expect(points).toHaveLength(2);
    expect(points.some((p) => p.date === "2026-08-03")).toBe(false);
  });

  it("returns null avgResponseTimeMs for a day where every heartbeat lacks a response time", () => {
    const points = computeDashboardTrend([
      hb("2026-08-01", { status: "down", responseTimeMs: null }),
    ]);
    expect(points[0].avgResponseTimeMs).toBeNull();
    expect(points[0].uptimePercent).toBe(0);
  });
});
