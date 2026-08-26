import type { NotificationProvider, NotificationSendResult } from "./types.js";

export const DEFAULT_WEBHOOK_TIMEOUT_MS = 10_000;

/**
 * Generic outgoing webhook — the only provider in v1 (specs/018 research.md
 * decision 1). Never throws: every failure mode (non-2xx, network error,
 * timeout) is captured as `{ ok: false, error }` so the dispatcher can
 * always record an outcome and move on to the next channel. `timeoutMs` is
 * an optional override (tests use a short one against a deliberately slow
 * server; production callers rely on the default).
 */
export const webhookProvider: NotificationProvider = {
  type: "webhook",
  async send(
    url,
    payload,
    timeoutMs = DEFAULT_WEBHOOK_TIMEOUT_MS,
  ): Promise<NotificationSendResult> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return { ok: true };
      return { ok: false, error: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
};
