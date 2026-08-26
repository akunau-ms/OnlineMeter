import { certificateErrorMessage, isCertificateError, readCertificateExpiry } from "./certificate.js";
import { classifyFetchError, fetchWithTimeout } from "./httpRequest.js";
import type { CheckResult, CheckableMonitor, MonitorChecker } from "./types.js";

function httpsUrl(target: string): URL | null {
  try {
    const url = new URL(target);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Cap on how much of the response body is searched (specs/006 research.md
 * decision 2) — `response.text()` buffers the whole body unboundedly, so
 * the body is read chunk-by-chunk via its stream reader instead, stopping
 * once this many bytes have been collected.
 */
const MAX_SEARCH_BYTES = 1024 * 1024;

async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let received = 0;
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received >= maxBytes) {
      const overshoot = received - maxBytes;
      text += decoder.decode(value.subarray(0, value.byteLength - overshoot));
      await reader.cancel();
      break;
    }
    text += decoder.decode(value, { stream: true });
  }

  return text;
}

export const keywordChecker: MonitorChecker = {
  type: "keyword",

  async check(monitor: CheckableMonitor): Promise<CheckResult> {
    const min = monitor.expectedStatusMin ?? 200;
    const max = monitor.expectedStatusMax ?? 299;
    const start = performance.now();

    try {
      const { response, responseTimeMs } = await fetchWithTimeout(monitor);

      const url = httpsUrl(monitor.target);
      const certificateExpiresAt = url
        ? ((await readCertificateExpiry(url.hostname, Number(url.port) || 443, monitor.timeoutSeconds * 1000))
            ?.validTo ?? null)
        : undefined;

      if (!(response.status >= min && response.status <= max)) {
        return {
          status: "down",
          responseTimeMs,
          message: `HTTP ${response.status} outside expected range ${min}-${max}`,
          certificateExpiresAt,
        };
      }

      const keyword = monitor.keyword ?? "";
      const body = await readBodyCapped(response, MAX_SEARCH_BYTES);
      const found = body.includes(keyword);
      const invert = monitor.keywordInvert ?? false;

      if (invert && found) {
        return {
          status: "down",
          responseTimeMs,
          message: `Keyword "${keyword}" found in response (inverted match)`,
          certificateExpiresAt,
        };
      }
      if (!invert && !found) {
        return {
          status: "down",
          responseTimeMs,
          message: `Keyword "${keyword}" not found in response`,
          certificateExpiresAt,
        };
      }
      return { status: "up", responseTimeMs, message: `HTTP ${response.status}`, certificateExpiresAt };
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - start);
      if (httpsUrl(monitor.target) && isCertificateError(error)) {
        return { status: "down", responseTimeMs: elapsedMs || null, message: certificateErrorMessage(error) };
      }
      const { responseTimeMs, message } = classifyFetchError(error, elapsedMs);
      return { status: "down", responseTimeMs, message };
    }
  },
};
