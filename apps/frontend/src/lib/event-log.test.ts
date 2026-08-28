import { describe, expect, it } from "vitest";
import type { Heartbeat } from "shared-types";
import { condenseHeartbeats, summarizeGroup } from "./event-log";

function heartbeat(overrides: Partial<Heartbeat>): Heartbeat {
  return {
    id: overrides.id ?? "hb",
    monitorId: "monitor-1",
    timestamp: overrides.timestamp ?? "2026-08-28T00:00:00.000Z",
    status: overrides.status ?? "up",
    responseTimeMs: overrides.responseTimeMs ?? 100,
    message: overrides.message ?? "HTTP 200",
  };
}

describe("condenseHeartbeats", () => {
  it("collapses an unbroken run of the same status into one group", () => {
    const heartbeats = [
      heartbeat({ id: "1", timestamp: "2026-08-28T00:00:00.000Z" }),
      heartbeat({ id: "2", timestamp: "2026-08-28T00:01:00.000Z" }),
      heartbeat({ id: "3", timestamp: "2026-08-28T00:02:00.000Z" }),
    ];

    const groups = condenseHeartbeats(heartbeats);

    expect(groups).toHaveLength(1);
    expect(groups[0].status).toBe("up");
    expect(groups[0].entries).toHaveLength(3);
  });

  it("starts a new group on a status change — a transition is never absorbed", () => {
    const heartbeats = [
      heartbeat({ id: "1", status: "up" }),
      heartbeat({ id: "2", status: "up" }),
      heartbeat({ id: "3", status: "down" }),
      heartbeat({ id: "4", status: "down" }),
      heartbeat({ id: "5", status: "up" }),
    ];

    const groups = condenseHeartbeats(heartbeats);

    expect(groups.map((g) => [g.status, g.entries.length])).toEqual([
      ["up", 2],
      ["down", 2],
      ["up", 1],
    ]);
  });

  it("produces one group per entry when flapping every check", () => {
    const heartbeats = [
      heartbeat({ id: "1", status: "up" }),
      heartbeat({ id: "2", status: "down" }),
      heartbeat({ id: "3", status: "up" }),
      heartbeat({ id: "4", status: "down" }),
    ];

    const groups = condenseHeartbeats(heartbeats);

    expect(groups).toHaveLength(4);
    expect(groups.every((g) => g.entries.length === 1)).toBe(true);
  });

  it("returns a single single-entry group for one recorded check", () => {
    const groups = condenseHeartbeats([heartbeat({ id: "1" })]);

    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(1);
  });

  it("returns an empty array for no heartbeats", () => {
    expect(condenseHeartbeats([])).toEqual([]);
  });
});

describe("summarizeGroup", () => {
  it("uses the group's latest entry as the representative message", () => {
    const group = {
      status: "up" as const,
      entries: [
        heartbeat({ id: "1", timestamp: "2026-08-28T00:00:00.000Z", message: "HTTP 200 (140ms)" }),
        heartbeat({ id: "2", timestamp: "2026-08-28T00:01:00.000Z", message: "HTTP 200 (95ms)" }),
        heartbeat({ id: "3", timestamp: "2026-08-28T00:02:00.000Z", message: "HTTP 200 (120ms)" }),
      ],
    };

    const summary = summarizeGroup(group);

    expect(summary.count).toBe(3);
    expect(summary.earliestTimestamp).toBe("2026-08-28T00:00:00.000Z");
    expect(summary.latestTimestamp).toBe("2026-08-28T00:02:00.000Z");
    expect(summary.message).toBe("HTTP 200 (120ms)");
  });

  it("summarizes a single-entry group as itself", () => {
    const entry = heartbeat({ id: "1", message: "HTTP 200" });
    const summary = summarizeGroup({ status: "up", entries: [entry] });

    expect(summary.count).toBe(1);
    expect(summary.earliestTimestamp).toBe(entry.timestamp);
    expect(summary.latestTimestamp).toBe(entry.timestamp);
    expect(summary.message).toBe(entry.message);
  });
});
