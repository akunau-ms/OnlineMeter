import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keywordChecker } from "../../../src/checkers/keyword.js";
import type { CheckableMonitor } from "../../../src/checkers/types.js";

function baseMonitor(overrides: Partial<CheckableMonitor> = {}): CheckableMonitor {
  return {
    id: "m1",
    name: "test",
    type: "keyword",
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
    keyword: "Hello",
    keywordInvert: false,
    ...overrides,
  } as CheckableMonitor;
}

describe("keywordChecker", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/has-keyword") {
        res.writeHead(200);
        res.end("Hello world");
      } else if (req.url === "/no-keyword") {
        res.writeHead(200);
        res.end("Goodbye world");
      } else if (req.url === "/error-status") {
        res.writeHead(500);
        res.end("Hello world");
      } else if (req.url === "/large") {
        res.writeHead(200);
        // > 1 MiB body, keyword placed only at the very end (beyond the cap)
        res.end("x".repeat(1024 * 1024 + 10) + "Hello");
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

  it("reports up when the keyword is present in the response body", async () => {
    const result = await keywordChecker.check(baseMonitor({ target: `${baseUrl}/has-keyword` }));
    expect(result.status).toBe("up");
  });

  it("reports down with a message naming the missing keyword", async () => {
    const result = await keywordChecker.check(baseMonitor({ target: `${baseUrl}/no-keyword` }));
    expect(result.status).toBe("down");
    expect(result.message).toContain("Hello");
  });

  it("reports down when an inverted match finds the keyword present", async () => {
    const result = await keywordChecker.check(
      baseMonitor({ target: `${baseUrl}/has-keyword`, keywordInvert: true }),
    );
    expect(result.status).toBe("down");
  });

  it("reports up when an inverted match finds the keyword absent", async () => {
    const result = await keywordChecker.check(
      baseMonitor({ target: `${baseUrl}/no-keyword`, keywordInvert: true }),
    );
    expect(result.status).toBe("up");
  });

  it("reports the status-code failure without evaluating the keyword when the status is out of range", async () => {
    const result = await keywordChecker.check(baseMonitor({ target: `${baseUrl}/error-status` }));
    expect(result.status).toBe("down");
    expect(result.message).toContain("500");
  });

  it("does not require unbounded memory to search a very large response body (keyword beyond the 1 MiB cap is not found)", async () => {
    const result = await keywordChecker.check(baseMonitor({ target: `${baseUrl}/large` }));
    expect(result.status).toBe("down");
  }, 10000);
});
