// Pure trigger-evaluation functions for custom dashboard widgets
// (specs/027-custom-dashboards, severity levels added in specs/028). Has no
// Prisma/route dependency so it's unit-testable with no database — same
// rationale as `computeMonitorStats` in `routes/monitor-stats.ts`
// (specs/027 research.md decision 1).
import type { MonitorStatus, TriggerSeverity, TriggerType } from "shared-types";

export interface TriggerWidget {
  triggerType: TriggerType;
  warningThreshold: number | null;
  criticalThreshold: number | null;
}

export interface TriggerMonitor {
  status: MonitorStatus;
  active: boolean;
  statusSince: string;
  certificateExpiresAt: string | null;
}

export interface TriggerStats {
  currentResponseTimeMs: number | null;
  uptime24h: number | null;
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Boolean triggers only ever report critical/normal — never warning (FR-003). */
export function evaluateStatusDown(monitor: TriggerMonitor): TriggerSeverity {
  return monitor.status === "down" ? "critical" : "normal";
}

export function evaluateDockerCheck(monitor: TriggerMonitor): TriggerSeverity {
  return monitor.status === "down" ? "critical" : "normal";
}

/** higher-is-worse: a larger down-duration is more severe (specs/028 data-model.md). */
export function evaluateDownDuration(
  widget: TriggerWidget,
  monitor: TriggerMonitor,
  now: Date = new Date(),
): TriggerSeverity {
  if (monitor.status !== "down") return "normal";
  const downForMs = now.getTime() - new Date(monitor.statusSince).getTime();
  if (widget.criticalThreshold !== null && downForMs >= widget.criticalThreshold * MINUTE_MS) {
    return "critical";
  }
  if (widget.warningThreshold !== null && downForMs >= widget.warningThreshold * MINUTE_MS) {
    return "warning";
  }
  return "normal";
}

/** higher-is-worse: a larger response time is more severe. */
export function evaluateResponseTime(widget: TriggerWidget, stats: TriggerStats): TriggerSeverity {
  if (stats.currentResponseTimeMs === null) return "normal";
  if (
    widget.criticalThreshold !== null &&
    stats.currentResponseTimeMs >= widget.criticalThreshold
  ) {
    return "critical";
  }
  if (widget.warningThreshold !== null && stats.currentResponseTimeMs >= widget.warningThreshold) {
    return "warning";
  }
  return "normal";
}

/** lower-is-worse: fewer days remaining is more severe. */
export function evaluateCertificateExpiry(
  widget: TriggerWidget,
  monitor: TriggerMonitor,
  now: Date = new Date(),
): TriggerSeverity {
  if (monitor.certificateExpiresAt === null) return "normal";
  const daysRemaining =
    (new Date(monitor.certificateExpiresAt).getTime() - now.getTime()) / DAY_MS;
  if (widget.criticalThreshold !== null && daysRemaining <= widget.criticalThreshold) {
    return "critical";
  }
  if (widget.warningThreshold !== null && daysRemaining <= widget.warningThreshold) {
    return "warning";
  }
  return "normal";
}

/** lower-is-worse: a lower uptime percentage is more severe. */
export function evaluateUptimeBelow(widget: TriggerWidget, stats: TriggerStats): TriggerSeverity {
  if (stats.uptime24h === null) return "normal";
  if (widget.criticalThreshold !== null && stats.uptime24h < widget.criticalThreshold) {
    return "critical";
  }
  if (widget.warningThreshold !== null && stats.uptime24h < widget.warningThreshold) {
    return "warning";
  }
  return "normal";
}

/**
 * Single entry point used by the dashboards route to compute
 * `DashboardWidgetView.severity`. A paused monitor is never a problem,
 * regardless of trigger type or how clearly the underlying condition would
 * otherwise hold (FR-012/FR-009) — checked before any trigger-specific
 * logic runs.
 */
export function evaluateTrigger(
  widget: TriggerWidget,
  monitor: TriggerMonitor,
  stats: TriggerStats,
  now: Date = new Date(),
): TriggerSeverity {
  if (!monitor.active) return "normal";

  switch (widget.triggerType) {
    case "status_down":
      return evaluateStatusDown(monitor);
    case "down_duration_minutes":
      return evaluateDownDuration(widget, monitor, now);
    case "response_time_ms":
      return evaluateResponseTime(widget, stats);
    case "certificate_expiry_days":
      return evaluateCertificateExpiry(widget, monitor, now);
    case "docker_check_failing":
      return evaluateDockerCheck(monitor);
    case "uptime_below_percent":
      return evaluateUptimeBelow(widget, stats);
    default:
      return "normal";
  }
}
