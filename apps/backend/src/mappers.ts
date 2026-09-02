import type {
  Dashboard as PrismaDashboard,
  Group as PrismaGroup,
  Heartbeat as PrismaHeartbeat,
  Monitor as PrismaMonitor,
  NotificationChannel as PrismaNotificationChannel,
} from "@prisma/client";
import type {
  Dashboard,
  Group,
  Heartbeat,
  Monitor,
  MonitorListItem,
  NotificationChannel,
  PublicStatusGroup,
  PublicStatusHeartbeat,
  PublicStatusMonitor,
} from "shared-types";
import { isExpiringSoon } from "./checkers/certificate.js";

export function toMonitorDTO(m: PrismaMonitor): Monitor {
  return {
    id: m.id,
    name: m.name,
    type: m.type as Monitor["type"],
    target: m.target,
    intervalSeconds: m.intervalSeconds,
    timeoutSeconds: m.timeoutSeconds,
    retries: m.retries,
    retryIntervalSeconds: m.retryIntervalSeconds,
    expectedStatusMin: m.expectedStatusMin,
    expectedStatusMax: m.expectedStatusMax,
    active: m.active,
    status: m.status as Monitor["status"],
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    groupId: m.groupId,
    // basicAuthPassword is deliberately never mapped here — see
    // checkers/types.ts CheckableMonitor (specs/003 research.md decision 2).
    basicAuthUsername: m.basicAuthUsername,
    dnsRecordType: m.dnsRecordType as Monitor["dnsRecordType"],
    dnsExpectedValue: m.dnsExpectedValue,
    keyword: m.keyword,
    keywordInvert: m.keywordInvert,
    certificateExpiresAt: m.certificateExpiresAt ? m.certificateExpiresAt.toISOString() : null,
    certificateExpiringSoon: isExpiringSoon(m.certificateExpiresAt),
  };
}

export function toGroupDTO(g: PrismaGroup): Group {
  return {
    id: g.id,
    name: g.name,
    isPublic: g.isPublic,
    createdAt: g.createdAt.toISOString(),
  };
}

/**
 * Maps a Monitor loaded with its 20 most-recent heartbeats (queried
 * newest-first, for an efficient LIMIT) into the list-item DTO, which
 * exposes them chronologically for the sidebar strip.
 */
export function toMonitorListItemDTO(
  m: PrismaMonitor & { heartbeats: PrismaHeartbeat[] },
): MonitorListItem {
  return {
    ...toMonitorDTO(m),
    recentHeartbeats: [...m.heartbeats].reverse().map(toHeartbeatDTO),
  };
}

export function toHeartbeatDTO(h: PrismaHeartbeat): Heartbeat {
  return {
    id: h.id,
    monitorId: h.monitorId,
    timestamp: h.timestamp.toISOString(),
    status: h.status as Heartbeat["status"],
    responseTimeMs: h.responseTimeMs,
    message: h.message,
  };
}

/**
 * Deliberately narrower Prisma selection shapes for the public status
 * endpoint (specs/017) — never `PrismaMonitor`/`PrismaHeartbeat`, so a
 * sensitive field added to those later can't leak here by accident
 * (specs/017 research.md decision 2).
 */
export interface PublicHeartbeatSelection {
  timestamp: Date;
  status: string;
}

export interface PublicMonitorSelection {
  id: string;
  name: string;
  status: string;
  active: boolean;
  heartbeats: PublicHeartbeatSelection[];
}

export interface PublicGroupSelection {
  id: string;
  name: string;
  monitors: PublicMonitorSelection[];
}

export function toPublicStatusHeartbeatDTO(h: PublicHeartbeatSelection): PublicStatusHeartbeat {
  return {
    timestamp: h.timestamp.toISOString(),
    status: h.status as PublicStatusHeartbeat["status"],
  };
}

export function toPublicStatusMonitorDTO(m: PublicMonitorSelection): PublicStatusMonitor {
  return {
    id: m.id,
    name: m.name,
    status: m.status as PublicStatusMonitor["status"],
    active: m.active,
    recentHeartbeats: m.heartbeats.map(toPublicStatusHeartbeatDTO),
  };
}

export function toPublicStatusGroupDTO(g: PublicGroupSelection): PublicStatusGroup {
  return {
    id: g.id,
    name: g.name,
    monitors: g.monitors.map(toPublicStatusMonitorDTO),
  };
}

export function toDashboardDTO(d: PrismaDashboard): Dashboard {
  return {
    id: d.id,
    name: d.name,
    createdAt: d.createdAt.toISOString(),
  };
}

export function toNotificationChannelDTO(c: PrismaNotificationChannel): NotificationChannel {
  return {
    id: c.id,
    name: c.name,
    type: c.type as NotificationChannel["type"],
    url: c.url,
    enabled: c.enabled,
    lastDeliveryAt: c.lastDeliveryAt ? c.lastDeliveryAt.toISOString() : null,
    lastDeliveryOk: c.lastDeliveryOk,
    createdAt: c.createdAt.toISOString(),
  };
}
