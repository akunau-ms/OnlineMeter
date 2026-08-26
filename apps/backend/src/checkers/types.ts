import type { Monitor } from "shared-types";

export interface CheckResult {
  status: "up" | "down";
  responseTimeMs: number | null;
  message: string;
  /**
   * HTTPS certificate expiry read alongside this check (specs/006). Only
   * `http`/`keyword` checkers against an `https://` target ever set this —
   * `undefined` means "not applicable/not attempted," `null` means
   * "attempted but no certificate data available." The scheduler persists
   * it onto `Monitor.certificateExpiresAt` whenever it's not `undefined`.
   */
  certificateExpiresAt?: Date | null;
}

/**
 * `Monitor` (shared-types) deliberately never carries `basicAuthPassword`
 * — it flows to the frontend and must never leak the secret (specs/003
 * research.md decision 2). Checkers, which run only on the backend and
 * need the real password to authenticate, take this backend-only
 * extension instead. The scheduler builds it from the raw Prisma row.
 */
export interface CheckableMonitor extends Monitor {
  basicAuthPassword: string | null;
}

/**
 * Constitution Principle IV extensibility contract: every monitor type
 * implements this interface so the scheduler and API stay unaware of
 * per-type check mechanics. Adding a new monitor type means adding a new
 * MonitorChecker implementation, not touching scheduler/route code.
 */
export interface MonitorChecker {
  readonly type: Monitor["type"];
  check(monitor: CheckableMonitor): Promise<CheckResult>;
}
