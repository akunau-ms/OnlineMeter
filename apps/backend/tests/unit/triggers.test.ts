import { describe, expect, it } from "vitest";
import {
  evaluateCertificateExpiry,
  evaluateDockerCheck,
  evaluateDownDuration,
  evaluateResponseTime,
  evaluateStatusDown,
  evaluateTrigger,
  evaluateUptimeBelow,
  type TriggerMonitor,
  type TriggerStats,
  type TriggerWidget,
} from "../../src/triggers.js";

function monitor(overrides: Partial<TriggerMonitor> = {}): TriggerMonitor {
  return {
    status: "up",
    active: true,
    statusSince: new Date().toISOString(),
    certificateExpiresAt: null,
    ...overrides,
  };
}

function stats(overrides: Partial<TriggerStats> = {}): TriggerStats {
  return { currentResponseTimeMs: null, uptime24h: null, ...overrides };
}

function widget(overrides: Partial<TriggerWidget>): TriggerWidget {
  return {
    triggerType: "status_down",
    warningThreshold: null,
    criticalThreshold: null,
    ...overrides,
  };
}

describe("evaluateStatusDown", () => {
  it("is critical only while status is down, never warning", () => {
    expect(evaluateStatusDown(monitor({ status: "down" }))).toBe("critical");
    expect(evaluateStatusDown(monitor({ status: "up" }))).toBe("normal");
  });
});

describe("evaluateDockerCheck", () => {
  it("is critical only while status is down, never warning", () => {
    expect(evaluateDockerCheck(monitor({ status: "down" }))).toBe("critical");
    expect(evaluateDockerCheck(monitor({ status: "up" }))).toBe("normal");
  });
});

describe("evaluateDownDuration (higher-is-worse)", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");

  it("is critical once down at least the critical threshold", () => {
    const w = widget({
      triggerType: "down_duration_minutes",
      warningThreshold: 5,
      criticalThreshold: 30,
    });
    const m = monitor({ status: "down", statusSince: "2026-09-01T11:25:00.000Z" }); // 35 min
    expect(evaluateDownDuration(w, m, now)).toBe("critical");
  });

  it("is warning once past the warning threshold but not yet the critical one", () => {
    const w = widget({
      triggerType: "down_duration_minutes",
      warningThreshold: 5,
      criticalThreshold: 30,
    });
    const m = monitor({ status: "down", statusSince: "2026-09-01T11:50:00.000Z" }); // 10 min
    expect(evaluateDownDuration(w, m, now)).toBe("warning");
  });

  it("is normal while down for less than the warning threshold", () => {
    const w = widget({
      triggerType: "down_duration_minutes",
      warningThreshold: 5,
      criticalThreshold: 30,
    });
    const m = monitor({ status: "down", statusSince: "2026-09-01T11:58:00.000Z" }); // 2 min
    expect(evaluateDownDuration(w, m, now)).toBe("normal");
  });

  it("is normal while the monitor is up, no matter how long ago statusSince was", () => {
    const w = widget({ triggerType: "down_duration_minutes", criticalThreshold: 5 });
    const m = monitor({ status: "up", statusSince: "2020-01-01T00:00:00.000Z" });
    expect(evaluateDownDuration(w, m, now)).toBe("normal");
  });

  it("only ever reports critical/normal when warningThreshold is unset (FR-004 compat)", () => {
    const w = widget({ triggerType: "down_duration_minutes", criticalThreshold: 30 });
    const barelyDown = monitor({ status: "down", statusSince: "2026-09-01T11:59:00.000Z" }); // 1 min
    expect(evaluateDownDuration(w, barelyDown, now)).toBe("normal");
    const longDown = monitor({ status: "down", statusSince: "2026-09-01T11:00:00.000Z" }); // 60 min
    expect(evaluateDownDuration(w, longDown, now)).toBe("critical");
  });
});

describe("evaluateResponseTime (higher-is-worse)", () => {
  const w = widget({
    triggerType: "response_time_ms",
    warningThreshold: 500,
    criticalThreshold: 2000,
  });

  it("is critical at/above the critical threshold", () => {
    expect(evaluateResponseTime(w, stats({ currentResponseTimeMs: 2500 }))).toBe("critical");
  });

  it("is warning between the two thresholds", () => {
    expect(evaluateResponseTime(w, stats({ currentResponseTimeMs: 800 }))).toBe("warning");
  });

  it("is normal below the warning threshold", () => {
    expect(evaluateResponseTime(w, stats({ currentResponseTimeMs: 400 }))).toBe("normal");
  });

  it("is normal when there is no recorded response time yet", () => {
    expect(evaluateResponseTime(w, stats({ currentResponseTimeMs: null }))).toBe("normal");
  });
});

describe("evaluateCertificateExpiry (lower-is-worse)", () => {
  const now = new Date("2026-09-01T00:00:00.000Z");
  const w = widget({
    triggerType: "certificate_expiry_days",
    warningThreshold: 30,
    criticalThreshold: 7,
  });

  it("is critical within the critical (smaller) day count", () => {
    const m = monitor({ certificateExpiresAt: "2026-09-05T00:00:00.000Z" }); // 4 days
    expect(evaluateCertificateExpiry(w, m, now)).toBe("critical");
  });

  it("is warning between the two thresholds", () => {
    const m = monitor({ certificateExpiresAt: "2026-09-15T00:00:00.000Z" }); // 14 days
    expect(evaluateCertificateExpiry(w, m, now)).toBe("warning");
  });

  it("is normal further out than the warning threshold", () => {
    const m = monitor({ certificateExpiresAt: "2026-10-15T00:00:00.000Z" }); // 44 days
    expect(evaluateCertificateExpiry(w, m, now)).toBe("normal");
  });

  it("is normal when the monitor has no certificate data at all", () => {
    expect(evaluateCertificateExpiry(w, monitor({ certificateExpiresAt: null }), now)).toBe(
      "normal",
    );
  });
});

describe("evaluateUptimeBelow (lower-is-worse)", () => {
  const w = widget({
    triggerType: "uptime_below_percent",
    warningThreshold: 99,
    criticalThreshold: 95,
  });

  it("is critical at/below the critical (smaller) percentage", () => {
    expect(evaluateUptimeBelow(w, stats({ uptime24h: 90 }))).toBe("critical");
  });

  it("is warning between the two thresholds", () => {
    expect(evaluateUptimeBelow(w, stats({ uptime24h: 97 }))).toBe("warning");
  });

  it("is normal at/above the warning threshold", () => {
    expect(evaluateUptimeBelow(w, stats({ uptime24h: 99.5 }))).toBe("normal");
  });

  it("is normal when there is no uptime data yet", () => {
    expect(evaluateUptimeBelow(w, stats({ uptime24h: null }))).toBe("normal");
  });
});

describe("evaluateTrigger", () => {
  it("is never a problem for a paused monitor, regardless of trigger type or severity (FR-009/FR-012)", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const pausedDown = monitor({
      status: "down",
      active: false,
      statusSince: "2020-01-01T00:00:00.000Z",
    });
    const s = stats({ currentResponseTimeMs: 99999, uptime24h: 0 });

    expect(evaluateTrigger(widget({ triggerType: "status_down" }), pausedDown, s, now)).toBe(
      "normal",
    );
    expect(
      evaluateTrigger(
        widget({ triggerType: "down_duration_minutes", criticalThreshold: 1 }),
        pausedDown,
        s,
        now,
      ),
    ).toBe("normal");
    expect(
      evaluateTrigger(
        widget({ triggerType: "response_time_ms", criticalThreshold: 1 }),
        pausedDown,
        s,
        now,
      ),
    ).toBe("normal");
    expect(evaluateTrigger(widget({ triggerType: "docker_check_failing" }), pausedDown, s, now)).toBe(
      "normal",
    );
    expect(
      evaluateTrigger(
        widget({ triggerType: "uptime_below_percent", criticalThreshold: 100 }),
        pausedDown,
        s,
        now,
      ),
    ).toBe("normal");
  });

  it("dispatches to the correct evaluator for an active monitor", () => {
    const m = monitor({ status: "down" });
    expect(evaluateTrigger(widget({ triggerType: "status_down" }), m, stats())).toBe("critical");
    expect(evaluateTrigger(widget({ triggerType: "docker_check_failing" }), m, stats())).toBe(
      "critical",
    );
  });
});
