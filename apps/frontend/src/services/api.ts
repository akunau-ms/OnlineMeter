import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AppConfig,
  Dashboard,
  DashboardDetail,
  DashboardInput,
  DashboardTrendPoint,
  DashboardWidgetInput,
  DashboardWidgetView,
  Group,
  GroupInput,
  Heartbeat,
  HeartbeatRange,
  Monitor,
  MonitorInput,
  MonitorListItem,
  MonitorStats,
  NotificationChannel,
  NotificationChannelInput,
  NotificationTestResult,
  PublicStatusResponse,
  ValidationFieldError,
} from "shared-types";

export class ApiValidationError extends Error {
  constructor(public fieldErrors: ValidationFieldError[]) {
    super("Validation failed");
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Only set a JSON content-type when there's actually a body — Fastify's
  // JSON body parser rejects an empty body sent with that header (as
  // pause/resume do, since they take no payload).
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });

  if (response.status === 400) {
    const fieldErrors = (await response.json()) as ValidationFieldError[];
    throw new ApiValidationError(fieldErrors);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/**
 * Whether this instance is a read-only demo (specs/021) — a runtime call,
 * not a build-time flag, since the same built frontend is served by both
 * demo and normal deployments. Never changes during a page's lifetime, so
 * no refetch interval is needed.
 */
export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => request<AppConfig>("/config"),
    staleTime: Infinity,
  });
}

export function useMonitors() {
  return useQuery({
    queryKey: ["monitors"],
    queryFn: () => request<MonitorListItem[]>("/monitors"),
  });
}

export function useMonitor(id: string | undefined) {
  return useQuery({
    queryKey: ["monitors", id],
    queryFn: () => request<Monitor>(`/monitors/${id}`),
    enabled: Boolean(id),
  });
}

export type HeartbeatRangeSelection = HeartbeatRange | { from: string; to: string };

export function useMonitorHeartbeats(
  id: string | undefined,
  selection: HeartbeatRangeSelection = "24h",
) {
  const query =
    typeof selection === "string"
      ? `range=${selection}`
      : `from=${encodeURIComponent(selection.from)}&to=${encodeURIComponent(selection.to)}`;
  return useQuery({
    queryKey: ["monitors", id, "heartbeats", selection],
    queryFn: () => request<Heartbeat[]>(`/monitors/${id}/heartbeats?${query}`),
    enabled: Boolean(id),
  });
}

export function useMonitorStats(id: string | undefined) {
  return useQuery({
    queryKey: ["monitors", id, "stats"],
    queryFn: () => request<MonitorStats>(`/monitors/${id}/stats`),
    enabled: Boolean(id),
    // Refresh alongside the live heartbeat stream rather than only on mount.
    refetchInterval: 30_000,
  });
}

export function useDashboardTrend(range: "7d" | "30d" = "7d") {
  return useQuery({
    queryKey: ["dashboard", "trend", range],
    queryFn: () => request<DashboardTrendPoint[]>(`/dashboard/trend?range=${range}`),
    refetchInterval: 30_000,
  });
}

export function useCreateMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MonitorInput) =>
      request<Monitor>("/monitors", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["monitors"] }),
  });
}

export function usePauseMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<Monitor>(`/monitors/${id}/pause`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["monitors"] }),
  });
}

export function useResumeMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<Monitor>(`/monitors/${id}/resume`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["monitors"] }),
  });
}

export function useUpdateMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      name,
      target,
      intervalSeconds,
    }: {
      id: string;
      name: string;
      target: string;
      intervalSeconds: number;
    }) =>
      // `type` is deliberately never sent — the backend rejects changing
      // it after creation, and this feature doesn't expose that (specs/022
      // research.md decision 1).
      request<Monitor>(`/monitors/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name, target, intervalSeconds }),
      }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["monitors"] });
      queryClient.invalidateQueries({ queryKey: ["monitors", id] });
    },
  });
}

export function useDeleteMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/monitors/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["monitors"] }),
  });
}

export function usePublicStatus() {
  return useQuery({
    queryKey: ["public-status"],
    queryFn: () => request<PublicStatusResponse>("/public/status"),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: ["groups"],
    queryFn: () => request<Group[]>("/groups"),
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GroupInput) =>
      request<Group>("/groups", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
}

export function useRenameGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      request<Group>(`/groups/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
}

export function useSetGroupPublic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, isPublic }: { id: string; name: string; isPublic: boolean }) =>
      request<Group>(`/groups/${id}`, { method: "PUT", body: JSON.stringify({ name, isPublic }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["groups"] }),
  });
}

export function useNotificationChannels() {
  return useQuery({
    queryKey: ["notification-channels"],
    queryFn: () => request<NotificationChannel[]>("/notification-channels"),
  });
}

export function useCreateNotificationChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NotificationChannelInput) =>
      request<NotificationChannel>("/notification-channels", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-channels"] }),
  });
}

export function useTestNotificationChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<NotificationTestResult>(`/notification-channels/${id}/test`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-channels"] }),
  });
}

export function useUpdateNotificationChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<NotificationChannelInput>) =>
      request<NotificationChannel>(`/notification-channels/${id}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-channels"] }),
  });
}

export function useDeleteNotificationChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/notification-channels/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-channels"] }),
  });
}

export function useDashboards() {
  return useQuery({
    queryKey: ["dashboards"],
    queryFn: () => request<Dashboard[]>("/dashboards"),
  });
}

export function useDashboard(id: string | undefined) {
  return useQuery({
    queryKey: ["dashboards", id],
    queryFn: () => request<DashboardDetail>(`/dashboards/${id}`),
    enabled: Boolean(id),
    // Backstop for the down_duration_minutes trigger, which can flip from
    // false to true purely from time passing, with no new socket event to
    // react to (specs/027 research.md decision 3).
    refetchInterval: 30_000,
  });
}

export function useCreateDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DashboardInput) =>
      request<Dashboard>("/dashboards", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboards"] }),
  });
}

export function useRenameDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      request<Dashboard>(`/dashboards/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      queryClient.invalidateQueries({ queryKey: ["dashboards", id] });
    },
  });
}

export function useDeleteDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/dashboards/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboards"] }),
  });
}

export function useAddWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, ...input }: { dashboardId: string } & DashboardWidgetInput) =>
      request<DashboardWidgetView>(`/dashboards/${dashboardId}/widgets`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, { dashboardId }) => {
      queryClient.invalidateQueries({ queryKey: ["dashboards", dashboardId] });
    },
  });
}

export function useRemoveWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, widgetId }: { dashboardId: string; widgetId: string }) =>
      request<void>(`/dashboards/${dashboardId}/widgets/${widgetId}`, { method: "DELETE" }),
    onSuccess: (_data, { dashboardId }) => {
      queryClient.invalidateQueries({ queryKey: ["dashboards", dashboardId] });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request<void>(`/groups/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      // Deleting a group ungroups its monitors server-side (FR-011) — refresh the list too.
      queryClient.invalidateQueries({ queryKey: ["monitors"] });
    },
  });
}
