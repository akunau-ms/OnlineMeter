import type { Monitor as PrismaMonitor } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { Heartbeat, Monitor, MonitorStatus, MonitorType } from "shared-types";
import type { CheckableMonitor, CheckResult, MonitorChecker } from "../checkers/types.js";
import { checkers } from "../checkers/index.js";
import { toHeartbeatDTO, toMonitorDTO } from "../mappers.js";
import { dispatchStatusChange } from "../notifications/dispatcher.js";

/**
 * A monitor's status is only "notifiable" when it's a genuine change from
 * an established prior state — never on the very first check
 * (`previousStatus === "pending"`), per FR-008 (specs/018 research.md
 * decision 2).
 */
export function shouldNotify(previousStatus: MonitorStatus, newStatus: MonitorStatus): boolean {
  return newStatus !== previousStatus && previousStatus !== "pending";
}

/**
 * The minimal slice of PrismaClient the scheduler actually calls. Kept
 * narrow (rather than depending on the full generated PrismaClient type) so
 * tests can pass an in-memory fake without a real SQLite file.
 */
export interface SchedulerPrisma {
  monitor: {
    findUnique(args: { where: { id: string } }): Promise<PrismaMonitor | null>;
    findMany(args: { where: { active: boolean } }): Promise<PrismaMonitor[]>;
    update(args: { where: { id: string }; data: Partial<PrismaMonitor> }): Promise<PrismaMonitor>;
  };
  heartbeat: {
    create(args: {
      data: { monitorId: string; status: string; responseTimeMs: number | null; message: string };
    }): Promise<{
      id: string;
      monitorId: string;
      timestamp: Date;
      status: string;
      responseTimeMs: number | null;
      message: string;
    }>;
  };
}

export interface SchedulerDeps {
  prisma: SchedulerPrisma;
  checkers: Record<MonitorType, MonitorChecker>;
  onHeartbeat: (monitorId: string, heartbeat: Heartbeat) => void;
  onStatusChange: (monitor: Monitor) => void;
  onNotifiableStatusChange?: (previousStatus: MonitorStatus, monitor: Monitor) => void;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * One setInterval-driven timer per active monitor, with a per-monitor
 * in-flight guard so a check tick is skipped (not queued) if the previous
 * check for that monitor hasn't finished yet (research.md decision 5).
 */
export class Scheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private inFlight = new Set<string>();

  constructor(private deps: SchedulerDeps) {}

  start(monitor: Monitor): void {
    this.stop(monitor.id);
    if (!monitor.active) return;
    const timer = setInterval(() => {
      void this.tick(monitor.id);
    }, monitor.intervalSeconds * 1000);
    timer.unref?.();
    this.timers.set(monitor.id, timer);
  }

  stop(monitorId: string): void {
    const timer = this.timers.get(monitorId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(monitorId);
    }
  }

  stopAll(): void {
    for (const id of [...this.timers.keys()]) this.stop(id);
  }

  isScheduled(monitorId: string): boolean {
    return this.timers.has(monitorId);
  }

  /** Runs one check cycle immediately (used at startup and directly by tests). */
  async runCheckNow(monitorId: string): Promise<void> {
    await this.tick(monitorId);
  }

  async startAllActive(): Promise<void> {
    const active = await this.deps.prisma.monitor.findMany({ where: { active: true } });
    for (const record of active) {
      this.start(toMonitorDTO(record));
    }
  }

  private async tick(monitorId: string): Promise<void> {
    if (this.inFlight.has(monitorId)) return;
    this.inFlight.add(monitorId);
    try {
      const record = await this.deps.prisma.monitor.findUnique({ where: { id: monitorId } });
      if (!record || !record.active) return;
      const monitor = toMonitorDTO(record);
      const checker = this.deps.checkers[monitor.type];
      // The password never rides on the DTO (specs/003 research.md decision
      // 2) — read it straight off the raw row, only for this checker call.
      const checkableMonitor: CheckableMonitor = {
        ...monitor,
        basicAuthPassword: record.basicAuthPassword,
      };

      let attempt = 0;
      let result: CheckResult;
      for (;;) {
        result = await checker.check(checkableMonitor);
        const heartbeat = await this.deps.prisma.heartbeat.create({
          data: {
            monitorId: monitor.id,
            status: result.status,
            responseTimeMs: result.responseTimeMs,
            message: result.message,
          },
        });
        this.deps.onHeartbeat(monitor.id, toHeartbeatDTO(heartbeat));

        if (result.status === "up") break;
        attempt += 1;
        if (attempt > monitor.retries) break;
        await (this.deps.sleep ?? defaultSleep)(monitor.retryIntervalSeconds * 1000);
      }

      // certificateExpiresAt (specs/006) is refreshed independently of
      // whether `status` changed — a monitor can stay "up" for weeks while
      // its certificate's expiry date still needs updating each check.
      const statusChanged = result.status !== monitor.status;
      const hasCertificateUpdate = result.certificateExpiresAt !== undefined;
      if (statusChanged || hasCertificateUpdate) {
        const updated = await this.deps.prisma.monitor.update({
          where: { id: monitor.id },
          data: {
            ...(statusChanged ? { status: result.status } : {}),
            ...(hasCertificateUpdate ? { certificateExpiresAt: result.certificateExpiresAt } : {}),
          },
        });
        if (statusChanged) {
          this.deps.onStatusChange(toMonitorDTO(updated));
          if (shouldNotify(monitor.status, result.status)) {
            this.deps.onNotifiableStatusChange?.(monitor.status, toMonitorDTO(updated));
          }
        }
      }
    } finally {
      this.inFlight.delete(monitorId);
    }
  }
}

export function createScheduler(app: FastifyInstance): Scheduler {
  return new Scheduler({
    prisma: app.prisma,
    checkers,
    onHeartbeat: (monitorId, heartbeat) => {
      app.io.emit("monitor:heartbeat", { monitorId, heartbeat });
    },
    onStatusChange: (monitor) => {
      app.io.emit("monitor:update", {
        monitorId: monitor.id,
        status: monitor.status,
        active: monitor.active,
        updatedAt: monitor.updatedAt,
      });
    },
    onNotifiableStatusChange: (_previousStatus, monitor) => {
      // Fire-and-forget: a slow/hanging delivery must never delay this
      // tick or the monitor's next scheduled check (FR-010, specs/018
      // research.md decision 3).
      void dispatchStatusChange(app, monitor.id, monitor.name, monitor.status as "up" | "down");
    },
  });
}
