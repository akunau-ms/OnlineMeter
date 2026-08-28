import type { Heartbeat, HeartbeatStatus } from "shared-types";

/** One run of consecutive same-status heartbeats. A run of length 1 is
 * just a single check; length > 1 is a collapsed streak (specs/024). */
export interface HeartbeatGroup {
  status: HeartbeatStatus;
  entries: Heartbeat[];
}

/**
 * Groups chronologically-ordered heartbeats (oldest first — the same
 * order the caller holds before reversing for display) into runs of
 * consecutive same-status entries. A new group starts exactly when
 * `status` changes, so every real up/down transition is a group
 * boundary and can never be absorbed into a neighboring group
 * (specs/024 FR-004, research.md decision 2).
 */
export function condenseHeartbeats(heartbeats: Heartbeat[]): HeartbeatGroup[] {
  const groups: HeartbeatGroup[] = [];
  for (const heartbeat of heartbeats) {
    const current = groups[groups.length - 1];
    if (current && current.status === heartbeat.status) {
      current.entries.push(heartbeat);
    } else {
      groups.push({ status: heartbeat.status, entries: [heartbeat] });
    }
  }
  return groups;
}

/** Display fields for one row of the condensed log — a single-entry
 * group's fields describe that one check; a multi-entry group's
 * describe the whole streak (research.md decision 3: the *latest*
 * entry's message represents the streak, since it's the state right
 * before whatever happened next). */
export interface HeartbeatGroupSummary {
  status: HeartbeatStatus;
  count: number;
  earliestTimestamp: string;
  latestTimestamp: string;
  message: string;
}

export function summarizeGroup(group: HeartbeatGroup): HeartbeatGroupSummary {
  const first = group.entries[0];
  const last = group.entries[group.entries.length - 1];
  return {
    status: group.status,
    count: group.entries.length,
    earliestTimestamp: first.timestamp,
    latestTimestamp: last.timestamp,
    message: last.message,
  };
}
