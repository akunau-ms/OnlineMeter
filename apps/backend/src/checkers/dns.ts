import { promises as dns } from "node:dns";
import type { DnsRecordType } from "shared-types";
import type { CheckResult, CheckableMonitor, MonitorChecker } from "./types.js";

async function resolveRecords(domain: string, recordType: DnsRecordType): Promise<string[]> {
  switch (recordType) {
    case "A":
      return dns.resolve4(domain);
    case "AAAA":
      return dns.resolve6(domain);
    case "CNAME":
      return dns.resolveCname(domain);
    case "MX": {
      const records = await dns.resolveMx(domain);
      return records.map((r) => r.exchange);
    }
    case "TXT": {
      const records = await dns.resolveTxt(domain);
      return records.map((chunks) => chunks.join(""));
    }
  }
}

export const dnsChecker: MonitorChecker = {
  type: "dns",

  async check(monitor: CheckableMonitor): Promise<CheckResult> {
    const recordType = monitor.dnsRecordType ?? "A";
    const start = performance.now();

    try {
      const records = await resolveRecords(monitor.target, recordType);
      const responseTimeMs = Math.round(performance.now() - start);

      if (records.length === 0) {
        return {
          status: "down",
          responseTimeMs,
          message: `No ${recordType} records found for ${monitor.target}`,
        };
      }

      if (monitor.dnsExpectedValue) {
        const expected = monitor.dnsExpectedValue.toLowerCase();
        const matched = records.some((r) => r.toLowerCase() === expected);
        if (!matched) {
          return {
            status: "down",
            responseTimeMs,
            message: `Resolved ${recordType} records [${records.join(", ")}] did not match expected value "${monitor.dnsExpectedValue}"`,
          };
        }
      }

      return { status: "up", responseTimeMs, message: `Resolved ${recordType}: ${records.join(", ")}` };
    } catch (error) {
      const responseTimeMs = Math.round(performance.now() - start);
      const message = error instanceof Error ? error.message : "DNS resolution failed";
      return {
        status: "down",
        responseTimeMs,
        message: `${monitor.target} did not resolve (${recordType}): ${message}`,
      };
    }
  },
};
