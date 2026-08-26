import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basicAuthHeader, classifyFetchError, fetchWithTimeout } from "../../../src/checkers/httpRequest.js";
import type { CheckableMonitor } from "../../../src/checkers/types.js";

function baseMonitor(overrides: Partial<CheckableMonitor> = {}): CheckableMonitor {
  return {
    id: "m1",
    name: "test",
    type: "http",
    target: "http://127.0.0.1:0",
    intervalSeconds: 60,
    timeoutSeconds: 1,
    retries: 0,
    retryIntervalSeconds: 0,
    expectedStatusMin: 200,
    expectedStatusMax: 299,
    active: true,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    groupId: null,
    basicAuthUsername: null,
    basicAuthPassword: null,
    dnsRecordType: null,
    dnsExpectedValue: null,
    ...overrides,
  };
}

describe("basicAuthHeader", () => {
  it("returns no header when credentials are unset", () => {
    expect(basicAuthHeader(baseMonitor())).toEqual({});
  });

  it("returns an Authorization: Basic header when both credentials are set", () => {
    const header = basicAuthHeader(
      baseMonitor({ basicAuthUsername: "alice", basicAuthPassword: "s3cret" }),
    );
    expect(header.Authorization).toBe(`Basic ${Buffer.from("alice:s3cret").toString("base64")}`);
  });

  it("returns no header when only one credential is set", () => {
    expect(basicAuthHeader(baseMonitor({ basicAuthUsername: "alice" }))).toEqual({});
  });
});

describe("fetchWithTimeout", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/ok") {
        res.writeHead(200);
        res.end("ok");
      } else if (req.url === "/slow") {
        setTimeout(() => {
          res.writeHead(200);
          res.end("slow");
        }, 2000);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (address && typeof address === "object") baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("resolves with the response and an elapsed time", async () => {
    const { response, responseTimeMs } = await fetchWithTimeout(baseMonitor({ target: `${baseUrl}/ok` }));
    expect(response.status).toBe(200);
    expect(responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("throws an AbortError when the request exceeds the timeout", async () => {
    await expect(
      fetchWithTimeout(baseMonitor({ target: `${baseUrl}/slow`, timeoutSeconds: 1 })),
    ).rejects.toThrow();
  }, 10000);
});

describe("classifyFetchError", () => {
  it("reports a timeout message for an AbortError", () => {
    const error = new DOMException("aborted", "AbortError");
    const result = classifyFetchError(error, 50);
    expect(result.responseTimeMs).toBeNull();
    expect(result.message.toLowerCase()).toContain("timed out");
  });

  it("reports the underlying error message for any other error", () => {
    const result = classifyFetchError(new Error("connection refused"), 12);
    expect(result.responseTimeMs).toBe(12);
    expect(result.message).toBe("connection refused");
  });
});
