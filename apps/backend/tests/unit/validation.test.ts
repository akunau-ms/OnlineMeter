import { describe, expect, it } from "vitest";
import { validateMonitorInput } from "../../src/routes/validation.js";

describe("validateMonitorInput", () => {
  it("accepts a minimal valid HTTP monitor", () => {
    expect(validateMonitorInput({ name: "svc", type: "http", target: "https://example.com" })).toEqual(
      [],
    );
  });

  it("rejects an empty name", () => {
    const errors = validateMonitorInput({ name: "", type: "http", target: "https://example.com" });
    expect(errors.some((e) => e.field === "name")).toBe(true);
  });

  it("rejects a malformed HTTP target", () => {
    const errors = validateMonitorInput({ name: "svc", type: "http", target: "not-a-url" });
    expect(errors.some((e) => e.field === "target")).toBe(true);
  });

  it("rejects a TCP target without a valid port", () => {
    const errors = validateMonitorInput({ name: "svc", type: "tcp", target: "example.com" });
    expect(errors.some((e) => e.field === "target")).toBe(true);
  });

  it("accepts a valid TCP target", () => {
    expect(validateMonitorInput({ name: "svc", type: "tcp", target: "example.com:443" })).toEqual(
      [],
    );
  });

  it("rejects an interval below the 20s minimum", () => {
    const errors = validateMonitorInput({
      name: "svc",
      type: "ping",
      target: "example.com",
      intervalSeconds: 5,
    });
    expect(errors.some((e) => e.field === "intervalSeconds")).toBe(true);
  });

  it("rejects a timeout greater than or equal to the interval", () => {
    const errors = validateMonitorInput({
      name: "svc",
      type: "ping",
      target: "example.com",
      intervalSeconds: 30,
      timeoutSeconds: 30,
    });
    expect(errors.some((e) => e.field === "timeoutSeconds")).toBe(true);
  });

  it("rejects an expected status range with min > max", () => {
    const errors = validateMonitorInput({
      name: "svc",
      type: "http",
      target: "https://example.com",
      expectedStatusMin: 500,
      expectedStatusMax: 200,
    });
    expect(errors.some((e) => e.field === "expectedStatusMin")).toBe(true);
  });

  describe("DNS monitors", () => {
    it("accepts a valid DNS monitor with a supported record type", () => {
      expect(
        validateMonitorInput({ name: "svc", type: "dns", target: "example.com", dnsRecordType: "A" }),
      ).toEqual([]);
    });

    it("accepts a DNS monitor with an expected value", () => {
      expect(
        validateMonitorInput({
          name: "svc",
          type: "dns",
          target: "example.com",
          dnsRecordType: "A",
          dnsExpectedValue: "93.184.216.34",
        }),
      ).toEqual([]);
    });

    it("rejects a DNS monitor missing a record type", () => {
      const errors = validateMonitorInput({ name: "svc", type: "dns", target: "example.com" });
      expect(errors.some((e) => e.field === "dnsRecordType")).toBe(true);
    });

    it("rejects a DNS monitor with an unsupported record type", () => {
      const errors = validateMonitorInput({
        name: "svc",
        type: "dns",
        target: "example.com",
        dnsRecordType: "SRV",
      });
      expect(errors.some((e) => e.field === "dnsRecordType")).toBe(true);
    });

    it("rejects DNS fields set on a non-DNS monitor", () => {
      const errors = validateMonitorInput({
        name: "svc",
        type: "http",
        target: "https://example.com",
        dnsRecordType: "A",
      });
      expect(errors.some((e) => e.field === "dnsRecordType")).toBe(true);
    });
  });

  describe("Keyword monitors", () => {
    it("accepts a valid keyword monitor", () => {
      expect(
        validateMonitorInput({
          name: "svc",
          type: "keyword",
          target: "https://example.com",
          keyword: "Hello",
        }),
      ).toEqual([]);
    });

    it("rejects a keyword monitor with an empty keyword", () => {
      const errors = validateMonitorInput({
        name: "svc",
        type: "keyword",
        target: "https://example.com",
        keyword: "",
      });
      expect(errors.some((e) => e.field === "keyword")).toBe(true);
    });

    it("rejects a keyword monitor missing a keyword entirely", () => {
      const errors = validateMonitorInput({ name: "svc", type: "keyword", target: "https://example.com" });
      expect(errors.some((e) => e.field === "keyword")).toBe(true);
    });

    it("rejects keyword fields set on a non-keyword monitor", () => {
      const errors = validateMonitorInput({
        name: "svc",
        type: "http",
        target: "https://example.com",
        keyword: "Hello",
      });
      expect(errors.some((e) => e.field === "keyword")).toBe(true);
    });

    it("accepts Basic Auth fields on a keyword monitor", () => {
      expect(
        validateMonitorInput({
          name: "svc",
          type: "keyword",
          target: "https://example.com",
          keyword: "Hello",
          basicAuthUsername: "alice",
          basicAuthPassword: "s3cret",
        }),
      ).toEqual([]);
    });

    it("validates a keyword monitor's expected status range the same way as http", () => {
      const errors = validateMonitorInput({
        name: "svc",
        type: "keyword",
        target: "https://example.com",
        keyword: "Hello",
        expectedStatusMin: 500,
        expectedStatusMax: 200,
      });
      expect(errors.some((e) => e.field === "expectedStatusMin")).toBe(true);
    });
  });

  describe("Docker monitors", () => {
    it("accepts a valid Docker monitor", () => {
      expect(
        validateMonitorInput({ name: "svc", type: "docker", target: "my-container" }),
      ).toEqual([]);
    });

    it("rejects a Docker monitor with an empty target", () => {
      const errors = validateMonitorInput({ name: "svc", type: "docker", target: "" });
      expect(errors.some((e) => e.field === "target")).toBe(true);
    });

    it("rejects Basic Auth fields on a Docker monitor", () => {
      const errors = validateMonitorInput({
        name: "svc",
        type: "docker",
        target: "my-container",
        basicAuthUsername: "alice",
        basicAuthPassword: "s3cret",
      });
      expect(errors.some((e) => e.field === "basicAuthUsername")).toBe(true);
    });

    it("rejects DNS fields on a Docker monitor", () => {
      const errors = validateMonitorInput({
        name: "svc",
        type: "docker",
        target: "my-container",
        dnsRecordType: "A",
      });
      expect(errors.some((e) => e.field === "dnsRecordType")).toBe(true);
    });

    it("rejects keyword fields on a Docker monitor", () => {
      const errors = validateMonitorInput({
        name: "svc",
        type: "docker",
        target: "my-container",
        keyword: "Hello",
      });
      expect(errors.some((e) => e.field === "keyword")).toBe(true);
    });
  });
});
