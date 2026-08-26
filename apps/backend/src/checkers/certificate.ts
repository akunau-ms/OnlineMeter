import tls from "node:tls";

/** Fixed built-in threshold (specs/006 research.md decision 4) — not operator-configurable. */
const WARNING_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;

export interface CertificateInfo {
  validTo: Date;
}

/**
 * `fetch`/undici doesn't expose the peer certificate, so this opens its own
 * short-lived TLS handshake to the same host/port a check just successfully
 * reached, reads `getPeerCertificate().valid_to`, and closes it immediately.
 * Returns `null` on any failure — this is supplementary data, never a
 * reason to fail the check that requested it.
 */
export function readCertificateExpiry(
  hostname: string,
  port: number,
  timeoutMs: number,
): Promise<CertificateInfo | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CertificateInfo | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const socket = tls.connect({ host: hostname, port, servername: hostname, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      socket.destroy();
      finish(cert?.valid_to ? { validTo: new Date(cert.valid_to) } : null);
    });

    socket.once("error", () => {
      socket.destroy();
      finish(null);
    });
    socket.once("timeout", () => {
      socket.destroy();
      finish(null);
    });
  });
}

/** True once `validTo` is at or within the built-in warning threshold of `now`. */
export function isExpiringSoon(validTo: Date | null, now: Date = new Date()): boolean {
  if (!validTo) return false;
  return validTo.getTime() - now.getTime() <= WARNING_THRESHOLD_MS;
}

const CERTIFICATE_ERROR_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_UNTRUSTED",
  "CERT_CHAIN_TOO_LONG",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "HOSTNAME_MISMATCH",
]);

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  const direct = (error as NodeJS.ErrnoException).code;
  if (direct) return direct;
  const cause = (error as { cause?: unknown }).cause;
  return cause instanceof Error ? (cause as NodeJS.ErrnoException).code : undefined;
}

/** Recognizes a certificate-specific TLS failure among the errors `fetchWithTimeout` can throw (research.md decision 4). */
export function isCertificateError(error: unknown): boolean {
  const code = errorCode(error);
  if (code && CERTIFICATE_ERROR_CODES.has(code)) return true;
  return error instanceof Error && /certificate|self.signed/i.test(error.message);
}

export function certificateErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Certificate validation failed";
  return `Certificate problem: ${message}`;
}
