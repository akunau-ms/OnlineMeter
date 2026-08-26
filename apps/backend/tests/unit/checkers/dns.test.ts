import { describe, expect, it, vi } from "vitest";
import type { Monitor } from "shared-types";

const resolve4Mock = vi.fn();
const resolve6Mock = vi.fn();
const resolveCnameMock = vi.fn();
const resolveMxMock = vi.fn();
const resolveTxtMock = vi.fn();

vi.mock("node:dns", () => ({
  promises: {
    resolve4: (...args: unknown[]) => resolve4Mock(...args),
    resolve6: (...args: unknown[]) => resolve6Mock(...args),
    resolveCname: (...args: unknown[]) => resolveCnameMock(...args),
    resolveMx: (...args: unknown[]) => resolveMxMock(...args),
    resolveTxt: (...args: unknown[]) => resolveTxtMock(...args),
  },
}));

const { dnsChecker } = await import("../../../src/checkers/dns.js");

function baseMonitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: "m1",
    name: "test",
    type: "dns",
    target: "example.com",
    intervalSeconds: 60,
    timeoutSeconds: 5,
    retries: 0,
    retryIntervalSeconds: 0,
    expectedStatusMin: null,
    expectedStatusMax: null,
    active: true,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    groupId: null,
    basicAuthUsername: null,
    dnsRecordType: "A",
    dnsExpectedValue: null,
    keyword: null,
    keywordInvert: false,
    certificateExpiresAt: null,
    ...overrides,
  };
}

describe("dnsChecker", () => {
  it("reports up when the configured record type resolves (existence-only, no expected value)", async () => {
    resolve4Mock.mockResolvedValueOnce(["93.184.216.34"]);
    const result = await dnsChecker.check(baseMonitor({ dnsRecordType: "A" }) as never);
    expect(result.status).toBe("up");
  });

  it("reports down with a descriptive message when the domain fails to resolve", async () => {
    resolve4Mock.mockRejectedValueOnce(Object.assign(new Error("queryA ENOTFOUND example.invalid"), { code: "ENOTFOUND" }));
    const result = await dnsChecker.check(baseMonitor({ target: "example.invalid" }) as never);
    expect(result.status).toBe("down");
    expect(result.message).toContain("example.invalid");
  });

  it("reports down when the domain resolves no records of the requested type", async () => {
    resolve4Mock.mockResolvedValueOnce([]);
    const result = await dnsChecker.check(baseMonitor() as never);
    expect(result.status).toBe("down");
    expect(result.message).toContain("A");
  });

  it("reports up when an expected value matches one of the resolved records", async () => {
    resolve4Mock.mockResolvedValueOnce(["1.1.1.1", "93.184.216.34"]);
    const result = await dnsChecker.check(
      baseMonitor({ dnsExpectedValue: "93.184.216.34" }) as never,
    );
    expect(result.status).toBe("up");
  });

  it("reports down with a mismatch message when no resolved record matches the expected value", async () => {
    resolve4Mock.mockResolvedValueOnce(["1.1.1.1"]);
    const result = await dnsChecker.check(
      baseMonitor({ dnsExpectedValue: "93.184.216.34" }) as never,
    );
    expect(result.status).toBe("down");
    expect(result.message).toContain("93.184.216.34");
  });

  it("resolves CNAME records", async () => {
    resolveCnameMock.mockResolvedValueOnce(["target.example.net"]);
    const result = await dnsChecker.check(baseMonitor({ dnsRecordType: "CNAME" }) as never);
    expect(result.status).toBe("up");
  });

  it("resolves MX records by exchange hostname", async () => {
    resolveMxMock.mockResolvedValueOnce([{ exchange: "mail.example.com", priority: 10 }]);
    const result = await dnsChecker.check(
      baseMonitor({ dnsRecordType: "MX", dnsExpectedValue: "mail.example.com" }) as never,
    );
    expect(result.status).toBe("up");
  });

  it("resolves TXT records", async () => {
    resolveTxtMock.mockResolvedValueOnce([["v=spf1 include:_spf.example.com ~all"]]);
    const result = await dnsChecker.check(
      baseMonitor({ dnsRecordType: "TXT", dnsExpectedValue: "v=spf1 include:_spf.example.com ~all" }) as never,
    );
    expect(result.status).toBe("up");
  });
});
