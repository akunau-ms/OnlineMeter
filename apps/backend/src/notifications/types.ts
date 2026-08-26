export interface NotificationPayload {
  monitorName: string;
  status: "up" | "down";
  timestamp: string;
  test?: boolean;
}

export interface NotificationSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Constitution Principle IV extensibility contract, mirroring
 * `checkers/types.ts`'s `MonitorChecker`: every notification channel type
 * implements this interface so the dispatcher stays unaware of per-type
 * delivery mechanics. Adding a new channel type means adding a new
 * NotificationProvider implementation, not touching dispatcher/route code.
 */
export interface NotificationProvider {
  readonly type: string;
  send(url: string, payload: NotificationPayload): Promise<NotificationSendResult>;
}
