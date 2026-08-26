import { describe, expect, it } from "vitest";
import {
  certificateErrorMessage,
  isCertificateError,
  isExpiringSoon,
} from "../../../src/checkers/certificate.js";

describe("isExpiringSoon", () => {
  it("returns true when the certificate expires within 14 days", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const validTo = new Date("2026-01-10T00:00:00Z");
    expect(isExpiringSoon(validTo, now)).toBe(true);
  });

  it("returns false when the certificate expires further than 14 days out", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const validTo = new Date("2026-03-01T00:00:00Z");
    expect(isExpiringSoon(validTo, now)).toBe(false);
  });

  it("returns false when there is no certificate data", () => {
    expect(isExpiringSoon(null)).toBe(false);
  });

  it("returns true when the certificate is already expired", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const validTo = new Date("2026-01-01T00:00:00Z");
    expect(isExpiringSoon(validTo, now)).toBe(true);
  });
});

describe("isCertificateError", () => {
  it("recognizes a known TLS certificate error code", () => {
    const error = Object.assign(new Error("certificate has expired"), { code: "CERT_HAS_EXPIRED" });
    expect(isCertificateError(error)).toBe(true);
  });

  it("recognizes a certificate error nested under `cause`", () => {
    const cause = Object.assign(new Error("cert error"), { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" });
    const error = new Error("fetch failed", { cause });
    expect(isCertificateError(error)).toBe(true);
  });

  it("does not misclassify an unrelated network error", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    expect(isCertificateError(error)).toBe(false);
  });
});

describe("certificateErrorMessage", () => {
  it("produces a message naming the certificate problem", () => {
    const error = new Error("certificate has expired");
    expect(certificateErrorMessage(error)).toContain("Certificate");
    expect(certificateErrorMessage(error)).toContain("certificate has expired");
  });
});
