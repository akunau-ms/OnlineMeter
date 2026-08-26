import type { HeartbeatStatus } from "shared-types";
import { inkFor } from "@/components/status-bot/StatusBot";

const SLOT_COUNT = 20;

/**
 * Minimal shape this component actually needs — satisfied by both
 * `MonitorListItem.recentHeartbeats` (sidebar) and
 * `PublicStatusMonitor.recentHeartbeats` (specs/017 public status page),
 * so the same component renders both without duplication.
 */
export interface MonitorHistoryStripHeartbeat {
  timestamp: string;
  status: HeartbeatStatus;
}

export interface MonitorHistoryStripProps {
  recentHeartbeats: MonitorHistoryStripHeartbeat[];
}

/**
 * Compact strip of the monitor's most recent check results (FR-004),
 * matching the reference layout's per-row history bars. Always renders a
 * fixed number of slots, padding with muted placeholders on the left for
 * monitors with less than a full window of history — so strips line up
 * across rows regardless of how long each monitor has existed.
 */
export function MonitorHistoryStrip({ recentHeartbeats }: MonitorHistoryStripProps) {
  const padCount = Math.max(0, SLOT_COUNT - recentHeartbeats.length);
  const slots: (MonitorHistoryStripHeartbeat | null)[] = [
    ...Array.from({ length: padCount }, () => null),
    ...recentHeartbeats.slice(-SLOT_COUNT),
  ];

  return (
    <div className="flex items-center gap-0.5" aria-hidden="true">
      {slots.map((heartbeat, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: heartbeat
              ? inkFor(heartbeat.status, false)
              : "hsl(var(--muted))",
          }}
          title={heartbeat ? `${heartbeat.status} · ${new Date(heartbeat.timestamp).toLocaleString()}` : undefined}
        />
      ))}
    </div>
  );
}
