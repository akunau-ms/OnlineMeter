import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { httpChecker } from "../../../src/checkers/http.js";
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
    ...overrides,
  };
}

describe("httpChecker", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/ok") {
        res.writeHead(200);
        res.end("ok");
      } else if (req.url === "/error") {
        res.writeHead(500);
        res.end("error");
      } else if (req.url === "/auth") {
        const header = req.headers.authorization;
        if (header === `Basic ${Buffer.from("alice:s3cret").toString("base64")}`) {
          res.writeHead(200);
          res.end("authenticated");
        } else {
          res.writeHead(401);
          res.end("unauthorized");
        }
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
    if (address && typeof address === "object") {
      baseUrl = `http://127.0.0.1:${address.port}`;
    }
  });

  afterAll(() => {
    server.close();
  });

  it("reports up when the status code is within the expected range", async () => {
    const result = await httpChecker.check(baseMonitor({ target: `${baseUrl}/ok` }));
    expect(result.status).toBe("up");
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("reports down when the status code is outside the expected range", async () => {
    const result = await httpChecker.check(baseMonitor({ target: `${baseUrl}/error` }));
    expect(result.status).toBe("down");
    expect(result.message).toContain("500");
  });

  it("reports down with a timeout message when the request exceeds the timeout", async () => {
    const result = await httpChecker.check(
      baseMonitor({ target: `${baseUrl}/slow`, timeoutSeconds: 1 }),
    );
    expect(result.status).toBe("down");
    expect(result.message.toLowerCase()).toContain("timed out");
  }, 10000);

  it("reports down when the target cannot be reached at all", async () => {
    const result = await httpChecker.check(
      baseMonitor({ target: "http://127.0.0.1:1", timeoutSeconds: 2 }),
    );
    expect(result.status).toBe("down");
  });

  it("sends an Authorization: Basic header when both credentials are set, and authenticates successfully", async () => {
    const result = await httpChecker.check(
      baseMonitor({
        target: `${baseUrl}/auth`,
        basicAuthUsername: "alice",
        basicAuthPassword: "s3cret",
      }),
    );
    expect(result.status).toBe("up");
  });

  it("reports down (401) when Basic Auth credentials are wrong", async () => {
    const result = await httpChecker.check(
      baseMonitor({
        target: `${baseUrl}/auth`,
        basicAuthUsername: "alice",
        basicAuthPassword: "wrong",
      }),
    );
    expect(result.status).toBe("down");
    expect(result.message).toContain("401");
  });

  it("sends no Authorization header at all when credentials are unset", async () => {
    const result = await httpChecker.check(baseMonitor({ target: `${baseUrl}/auth` }));
    expect(result.status).toBe("down");
    expect(result.message).toContain("401");
  });

  it("sends no Authorization header when only one of username/password is set", async () => {
    const result = await httpChecker.check(
      baseMonitor({ target: `${baseUrl}/auth`, basicAuthUsername: "alice" }),
    );
    expect(result.status).toBe("down");
    expect(result.message).toContain("401");
  });

  describe("certificate problems (specs/006)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("reports a specific certificate-problem message instead of a generic connection error", async () => {
      const certError = Object.assign(new Error("certificate has expired"), {
        code: "CERT_HAS_EXPIRED",
      });
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(certError);

      const result = await httpChecker.check(baseMonitor({ target: "https://expired.example.com" }));

      expect(result.status).toBe("down");
      expect(result.message).toContain("Certificate");
    });

    it("keeps the generic connection-error message for a non-certificate failure", async () => {
      const networkError = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(networkError);

      const result = await httpChecker.check(baseMonitor({ target: "https://unreachable.example.com" }));

      expect(result.status).toBe("down");
      expect(result.message).not.toContain("Certificate");
    });
  });
});
