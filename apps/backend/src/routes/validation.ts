import type { MonitorInput, ValidationFieldError } from "shared-types";
import { config } from "../config.js";

const MONITOR_TYPES: MonitorInput["type"][] = ["http", "tcp", "ping", "dns", "keyword", "docker"];
const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT"];

function isValidTarget(type: MonitorInput["type"], target: string): boolean {
  if (!target.trim()) return false;
  switch (type) {
    case "http": {
      try {
        const url = new URL(target);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }
    case "tcp": {
      const [host, portStr] = target.split(":");
      const port = Number(portStr);
      return Boolean(host) && Number.isInteger(port) && port > 0 && port <= 65535;
    }
    case "keyword": {
      try {
        const url = new URL(target);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }
    case "ping":
    case "docker":
      return target.trim().length > 0;
    case "dns":
      return !/\s/.test(target) && target.includes(".");
    default:
      return false;
  }
}

/**
 * Validates monitor create/edit input per data-model.md's validation rules
 * (FR-014). Returns an empty array when valid.
 */
export function validateMonitorInput(input: Partial<MonitorInput>): ValidationFieldError[] {
  const errors: ValidationFieldError[] = [];

  if (!input.name || !input.name.trim()) {
    errors.push({ field: "name", message: "Name must not be empty" });
  }

  if (!input.type || !MONITOR_TYPES.includes(input.type)) {
    errors.push({ field: "type", message: `Type must be one of ${MONITOR_TYPES.join(", ")}` });
    return errors; // can't validate target/status range without a known type
  }

  if (!input.target || !isValidTarget(input.type, input.target)) {
    errors.push({ field: "target", message: `Target is not a valid ${input.type} target` });
  }

  const intervalSeconds = input.intervalSeconds ?? 60;
  if (intervalSeconds < config.minIntervalSeconds) {
    errors.push({
      field: "intervalSeconds",
      message: `Interval must be at least ${config.minIntervalSeconds} seconds`,
    });
  }

  const timeoutSeconds = input.timeoutSeconds ?? 48;
  if (timeoutSeconds <= 0) {
    errors.push({ field: "timeoutSeconds", message: "Timeout must be greater than 0" });
  } else if (timeoutSeconds >= intervalSeconds) {
    errors.push({
      field: "timeoutSeconds",
      message: "Timeout must be less than the interval",
    });
  }

  const retries = input.retries ?? 0;
  if (retries < 0) {
    errors.push({ field: "retries", message: "Retries must be 0 or greater" });
  }

  const retryIntervalSeconds = input.retryIntervalSeconds ?? intervalSeconds;
  if (retryIntervalSeconds < 0) {
    errors.push({
      field: "retryIntervalSeconds",
      message: "Retry interval must be 0 or greater",
    });
  }

  if (input.type === "http" || input.type === "keyword") {
    const min = input.expectedStatusMin ?? 200;
    const max = input.expectedStatusMax ?? 299;
    if (min < 100 || min > 599 || max < 100 || max > 599 || min > max) {
      errors.push({
        field: "expectedStatusMin",
        message: "Expected status range must be within 100-599 with min <= max",
      });
    }
  } else if (input.basicAuthUsername || input.basicAuthPassword) {
    errors.push({
      field: "basicAuthUsername",
      message: "Basic Auth only applies to HTTP(S)/Keyword monitors",
    });
  }

  if (input.type === "dns") {
    if (!input.dnsRecordType || !DNS_RECORD_TYPES.includes(input.dnsRecordType)) {
      errors.push({
        field: "dnsRecordType",
        message: `Record type must be one of ${DNS_RECORD_TYPES.join(", ")}`,
      });
    }
  } else if (input.dnsRecordType || input.dnsExpectedValue) {
    errors.push({ field: "dnsRecordType", message: "DNS fields only apply to DNS monitors" });
  }

  if (input.type === "keyword") {
    if (!input.keyword || !input.keyword.trim()) {
      errors.push({ field: "keyword", message: "Keyword must not be empty" });
    }
  } else if (input.keyword || input.keywordInvert) {
    errors.push({ field: "keyword", message: "Keyword fields only apply to Keyword monitors" });
  }

  return errors;
}
