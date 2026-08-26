import type { CheckableMonitor } from "./types.js";

/**
 * Shared by the http and keyword checkers (specs/006 research.md decision
 * 2) — both are timeout/Basic-Auth-bound GETs, differing only in what they
 * do with the response afterward.
 */
export function basicAuthHeader(monitor: CheckableMonitor): Record<string, string> {
  if (!monitor.basicAuthUsername || !monitor.basicAuthPassword) return {};
  const encoded = Buffer.from(`${monitor.basicAuthUsername}:${monitor.basicAuthPassword}`).toString(
    "base64",
  );
  return { Authorization: `Basic ${encoded}` };
}

export interface HttpFetchResult {
  response: Response;
  responseTimeMs: number;
}

/**
 * Timeout/Basic-Auth-bound GET. Throws the raw fetch rejection (including
 * `AbortError` on timeout) — callers classify it via `classifyFetchError`.
 */
export async function fetchWithTimeout(monitor: CheckableMonitor): Promise<HttpFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), monitor.timeoutSeconds * 1000);
  const start = performance.now();

  try {
    const response = await fetch(monitor.target, {
      method: "GET",
      signal: controller.signal,
      headers: basicAuthHeader(monitor),
    });
    return { response, responseTimeMs: Math.round(performance.now() - start) };
  } finally {
    clearTimeout(timeout);
  }
}

export interface ClassifiedFetchError {
  responseTimeMs: number | null;
  message: string;
}

/** Turns a `fetchWithTimeout` rejection into a down-result message. */
export function classifyFetchError(error: unknown, elapsedMs: number): ClassifiedFetchError {
  if (error instanceof Error && error.name === "AbortError") {
    return { responseTimeMs: null, message: "Request timed out" };
  }
  const message = error instanceof Error ? error.message : "Unknown request error";
  return { responseTimeMs: elapsedMs || null, message };
}
