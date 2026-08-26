import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DashboardTrendPoint,
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

export function useMonitorHeartbeats(id: string | undefined, range: HeartbeatRange = "24h") {
  return useQuery({
    queryKey: ["monitors", id, "heartbeats", range],
    queryFn: () => request<Heartbeat[]>(`/monitors/${id}/heartbeats?range=${range}`),
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
