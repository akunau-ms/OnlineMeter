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

export const httpChecker: MonitorChecker = {
  type: "http",

  async check(monitor: CheckableMonitor): Promise<CheckResult> {
    const min = monitor.expectedStatusMin ?? 200;
    const max = monitor.expectedStatusMax ?? 299;
    const start = performance.now();

    try {
      const { response, responseTimeMs } = await fetchWithTimeout(monitor);

      // Certificate expiry (specs/006): read only after the connection
      // itself has already succeeded, regardless of the status-code
      // outcome below — a 500 response still proves the TLS handshake
      // (and therefore the certificate) is fine.
      const url = httpsUrl(monitor.target);
      const certificateExpiresAt = url
        ? ((await readCertificateExpiry(url.hostname, Number(url.port) || 443, monitor.timeoutSeconds * 1000))
            ?.validTo ?? null)
        : undefined;

      if (response.status >= min && response.status <= max) {
        return { status: "up", responseTimeMs, message: `HTTP ${response.status}`, certificateExpiresAt };
      }
      return {
        status: "down",
        responseTimeMs,
        message: `HTTP ${response.status} outside expected range ${min}-${max}`,
        certificateExpiresAt,
      };
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
