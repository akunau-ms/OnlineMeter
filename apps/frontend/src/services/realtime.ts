import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  Heartbeat,
  Monitor,
  MonitorHeartbeatEvent,
  MonitorStatus,
  MonitorUpdateEvent,
  ServerToClientEvents,
} from "shared-types";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io({ path: "/socket.io" });
  }
  return socket;
}

export interface MonitorStatusPatch {
  status: MonitorStatus;
  active: boolean;
  updatedAt: string;
}

/**
 * Tracks live status/active patches keyed by monitor id — sourced from the
 * `monitor:list` full snapshot sent on every connect/reconnect (FR-010) and
 * from incremental `monitor:update` events (FR-009). Deliberately does not
 * own the monitor list itself: the REST-fetched list (services/api.ts,
 * `useMonitors`) stays the source of truth for full monitor records
 * (including ones created after this client last connected), and callers
 * overlay `statusById` onto it — see apply().
 */
export function useRealtimeMonitors(): {
  statusById: Record<string, MonitorStatusPatch>;
  lastHeartbeats: Record<string, Heartbeat>;
  connected: boolean;
} {
  const [statusById, setStatusById] = useState<Record<string, MonitorStatusPatch>>({});
  const [lastHeartbeats, setLastHeartbeats] = useState<Record<string, Heartbeat>>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = getSocket();

    const onList = (payload: { monitors: Monitor[] }) => {
      const patch: Record<string, MonitorStatusPatch> = {};
      for (const m of payload.monitors) {
        patch[m.id] = { status: m.status, active: m.active, updatedAt: m.updatedAt };
      }
      setStatusById(patch);
    };
    const onUpdate = (payload: MonitorUpdateEvent) => {
      setStatusById((prev) => ({
        ...prev,
        [payload.monitorId]: {
          status: payload.status,
          active: payload.active,
          updatedAt: payload.updatedAt,
        },
      }));
    };
    const onHeartbeat = (payload: MonitorHeartbeatEvent) => {
      setLastHeartbeats((prev) => ({ ...prev, [payload.monitorId]: payload.heartbeat }));
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    s.on("monitor:list", onList);
    s.on("monitor:update", onUpdate);
    s.on("monitor:heartbeat", onHeartbeat);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);

    return () => {
      s.off("monitor:list", onList);
      s.off("monitor:update", onUpdate);
      s.off("monitor:heartbeat", onHeartbeat);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, []);

  return { statusById, lastHeartbeats, connected };
}

/** Overlays a live status patch onto a REST-fetched monitor, if one exists. */
export function applyStatusPatch<T extends Monitor>(
  monitor: T,
  statusById: Record<string, MonitorStatusPatch>,
): T {
  const patch = statusById[monitor.id];
  return patch ? { ...monitor, ...patch } : monitor;
}

/** Live heartbeat stream for one monitor, for a detail view's chart/log (FR-009). */
export function useMonitorHeartbeatStream(
  monitorId: string | undefined,
  onHeartbeat: (heartbeat: Heartbeat) => void,
): void {
  useEffect(() => {
    if (!monitorId) return;
    const s = getSocket();
    const handler = (payload: MonitorHeartbeatEvent) => {
      if (payload.monitorId === monitorId) onHeartbeat(payload.heartbeat);
    };
    s.on("monitor:heartbeat", handler);
    return () => {
      s.off("monitor:heartbeat", handler);
    };
  }, [monitorId]);
}
