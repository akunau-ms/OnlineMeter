export type MonitorType = "http" | "tcp" | "ping" | "dns" | "keyword" | "docker";

export type MonitorStatus = "pending" | "up" | "down";

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT";

export interface Monitor {
  id: string;
  name: string;
  type: MonitorType;
  target: string;
  intervalSeconds: number;
  timeoutSeconds: number;
  retries: number;
  retryIntervalSeconds: number;
  expectedStatusMin: number | null;
  expectedStatusMax: number | null;
  active: boolean;
  status: MonitorStatus;
  createdAt: string;
  updatedAt: string;
  groupId: string | null;
  /** Safe to expose — confirms which account is configured. The password half is deliberately never part of this type (specs/003 research.md decision 2). */
  basicAuthUsername: string | null;
  /** DNS monitors only (specs/006). */
  dnsRecordType: DnsRecordType | null;
  dnsExpectedValue: string | null;
  /** Keyword monitors only (specs/006). */
  keyword: string | null;
  keywordInvert: boolean;
  /** HTTP(S)/Keyword monitors only, HTTPS targets (specs/006). Derived/cached, refreshed on every successful HTTPS check — the same pattern `status` itself uses. */
  certificateExpiresAt: string | null;
  /** Server-computed at read time: true when certificateExpiresAt is within the built-in warning threshold. Never accepted on create/edit. */
  certificateExpiringSoon: boolean;
}

export interface MonitorInput {
  name: string;
  type: MonitorType;
  target: string;
  intervalSeconds?: number;
  timeoutSeconds?: number;
  retries?: number;
  retryIntervalSeconds?: number;
  expectedStatusMin?: number;
  expectedStatusMax?: number;
  groupId?: string | null;
  /** HTTP(S)/Keyword monitors only. On PUT: omitted = unchanged, null = clear, string = set (data-model.md). */
  basicAuthUsername?: string | null;
  basicAuthPassword?: string | null;
  /** DNS monitors only (specs/006). */
  dnsRecordType?: DnsRecordType | null;
  dnsExpectedValue?: string | null;
  /** Keyword monitors only (specs/006). */
  keyword?: string | null;
  keywordInvert?: boolean;
}

export interface Group {
  id: string;
  name: string;
  /** Whether this group's monitors appear on the public status page (specs/017). Defaults false. */
  isPublic: boolean;
  createdAt: string;
}

export interface GroupInput {
  name: string;
  /** On PUT: omitted = unchanged (specs/017). */
  isPublic?: boolean;
}

export type HeartbeatStatus = "up" | "down";

export interface Heartbeat {
  id: string;
  monitorId: string;
  timestamp: string;
  status: HeartbeatStatus;
  responseTimeMs: number | null;
  message: string;
}

export interface ValidationFieldError {
  field: string;
  message: string;
}

export interface ApiError {
  error: string;
  details?: unknown;
}

export type HeartbeatRange = "1h" | "24h" | "7d" | "30d";

/** Shape of each item in GET /api/monitors — Monitor plus a bounded recent-history window for the sidebar strip. */
export interface MonitorListItem extends Monitor {
  recentHeartbeats: Heartbeat[];
}

/** Server-computed reliability stats for a monitor's detail view. Any field is `null` when it can't yet be computed (no heartbeats in that window) — never a fabricated 0. */
export interface MonitorStats {
  currentResponseTimeMs: number | null;
  avgResponseTimeMs24h: number | null;
  uptime24h: number | null;
  uptime30d: number | null;
}

/** One day's point in the cross-monitor aggregate trend chart (GET /api/dashboard/trend). */
export interface DashboardTrendPoint {
  date: string;
  avgResponseTimeMs: number | null;
  uptimePercent: number | null;
}

// --- Public status page (GET /api/public/status), specs/017 ---
// Deliberately narrower than Heartbeat/Monitor — never reuse those types
// here, so a future field added to them can't silently leak publicly
// (specs/017 research.md decision 2).

export interface PublicStatusHeartbeat {
  timestamp: string;
  status: HeartbeatStatus;
}

export interface PublicStatusMonitor {
  id: string;
  name: string;
  status: MonitorStatus;
  active: boolean;
  recentHeartbeats: PublicStatusHeartbeat[];
}

export interface PublicStatusGroup {
  id: string;
  name: string;
  monitors: PublicStatusMonitor[];
}

// --- Notification channels (specs/018) ---

export type NotificationChannelType = "webhook";

export interface NotificationChannel {
  id: string;
  name: string;
  type: NotificationChannelType;
  url: string;
  enabled: boolean;
  lastDeliveryAt: string | null;
  lastDeliveryOk: boolean | null;
  createdAt: string;
}

export interface NotificationChannelInput {
  name: string;
  url: string;
  /** On PUT: omitted = unchanged, matching GroupInput's convention. */
  enabled?: boolean;
}

export interface NotificationTestResult {
  ok: boolean;
  error?: string;
}

export type PublicStatusResponse = PublicStatusGroup[];

// --- App config (GET /api/config), specs/021 ---

/** Backs GET /api/config. Currently just the one flag specs/021 adds. */
export interface AppConfig {
  demoMode: boolean;
}

// --- Custom dashboards & trigger widgets (specs/027) ---

export type TriggerType =
  | "status_down"
  | "down_duration_minutes"
  | "response_time_ms"
  | "certificate_expiry_days"
  | "docker_check_failing"
  | "uptime_below_percent";

/** Which monitor types each trigger type may be attached to (data-model.md, FR-004). */
export const TRIGGER_APPLICABLE_MONITOR_TYPES: Record<TriggerType, MonitorType[] | "all"> = {
  status_down: "all",
  down_duration_minutes: "all",
  response_time_ms: "all",
  certificate_expiry_days: ["http", "keyword"],
  docker_check_failing: ["docker"],
  uptime_below_percent: "all",
};

/** Trigger types that require a numeric `thresholdValue` (data-model.md). */
export const TRIGGER_TYPES_WITH_THRESHOLD: TriggerType[] = [
  "down_duration_minutes",
  "response_time_ms",
  "certificate_expiry_days",
  "uptime_below_percent",
];

// --- Dashboard widget severity levels (specs/028) ---

export type TriggerSeverity = "normal" | "warning" | "critical";

export type TriggerDirection = "higher-is-worse" | "lower-is-worse" | "boolean";

/**
 * Whether a bigger or a smaller number is the more severe one for each
 * threshold-based trigger type, shared between validation (ordering) and
 * evaluation (which threshold to check first) — specs/028 research.md
 * decision 1/4.
 */
export const TRIGGER_SEVERITY_DIRECTION: Record<TriggerType, TriggerDirection> = {
  status_down: "boolean",
  down_duration_minutes: "higher-is-worse",
  response_time_ms: "higher-is-worse",
  certificate_expiry_days: "lower-is-worse",
  docker_check_failing: "boolean",
  uptime_below_percent: "lower-is-worse",
};

export interface Dashboard {
  id: string;
  name: string;
  createdAt: string;
}

export interface DashboardInput {
  name: string;
}

export interface DashboardWidgetInput {
  monitorId: string;
  triggerType: TriggerType;
  warningThreshold?: number | null;
  criticalThreshold?: number | null;
}

/** GET /api/dashboards/:id widget shape — deliberately narrower than Monitor (specs/027 data-model.md). */
export interface DashboardWidgetView {
  id: string;
  triggerType: TriggerType;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  position: number;
  monitor: {
    id: string;
    name: string;
    type: MonitorType;
    status: MonitorStatus;
    active: boolean;
    /** Most recent checks, bounded to 20, chronological order (specs/028). */
    recentHeartbeats: { timestamp: string; status: HeartbeatStatus }[];
  };
  /** Server-computed at read time from the trigger dispatcher. Never accepted on write. */
  severity: TriggerSeverity;
}

export interface DashboardDetail extends Dashboard {
  widgets: DashboardWidgetView[];
}

// --- Realtime (Socket.IO) event contract, see contracts/websocket-events.md ---

export interface MonitorListEvent {
  monitors: Monitor[];
}

export interface MonitorUpdateEvent {
  monitorId: string;
  status: MonitorStatus;
  active: boolean;
  updatedAt: string;
}

export interface MonitorHeartbeatEvent {
  monitorId: string;
  heartbeat: Heartbeat;
}

export interface ServerToClientEvents {
  "monitor:list": (payload: MonitorListEvent) => void;
  "monitor:update": (payload: MonitorUpdateEvent) => void;
  "monitor:heartbeat": (payload: MonitorHeartbeatEvent) => void;
}

// No client → server events for this feature (see contracts/websocket-events.md).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ClientToServerEvents {}
